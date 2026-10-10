/*
  Travel Pack, Deploy Preview QA (server PDF at /pack/<code>)
  ===========================================================
  Runs against a deployed site, not this checkout:

    node docs/qa/travel-pack-preview-qa.js --base https://deploy-preview-N--golondon.netlify.app --out <dir> [--local <dir of local PDFs>]

  1. site safety: /node_modules, /package.json, /package-lock.json are 404; the template is served; the
     existing admin functions answer as on production
  2. /pack timings: cold (first call after the deploy), warm (new cache key, same function instance),
     CDN hit; client time, Server-Timing (launch, render, pdf, total, memory), size, cache status
  3. edge cases: malformed codes 400, unknown places 404, shared coordinates, approximate coordinates,
     one-stop day, 12-stop day
  4. every PDF: A4, page count, no blank page, Type0 fonts (no Type3), selectable stop names, absolute
     links with /tp/ and never /t/, both QR codes = /tp/<code>, 600 px logo; optional pixel comparison
     with local PDFs of the same routes
  5. redirects: /tp/<code> tagged travel_pack, /t/<code> still tagged whatsapp
*/
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const RC = require('../../route-code.js');
const args = process.argv.slice(2);
const opt = (k, d) => args.includes(k) ? args[args.indexOf(k) + 1] : d;
const BASE = opt('--base'); const OUT = path.resolve(opt('--out', 'preview-qa')); const LOCAL = opt('--local', '');
if (!BASE) { console.error('--base is required'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'planner-data.json'), 'utf8'));
const BY = {}; DATA.attractions.forEach(a => { BY[a.code] = a; });
let fail = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ': ' + d)); if (!c) fail++; };

async function get(u, opts) {
  const t = Date.now(); const r = await fetch(u, Object.assign({ redirect: 'manual' }, opts || {}));
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, ms: Date.now() - t, buf, type: r.headers.get('content-type') || '', timing: r.headers.get('server-timing') || '',
    cache: r.headers.get('cache-status') || '', location: r.headers.get('location') || '', disp: r.headers.get('content-disposition') || '' };
}
function pdfCheck(file, code, label) {
  const py = `
import fitz, json, sys
d = fitz.open(sys.argv[1]); out = sys.argv[2]
d[0].get_pixmap(dpi=300).save(out + '-qr1.png'); d[-1].get_pixmap(dpi=300).save(out + '-qr2.png')
for i, p in enumerate(d): p.get_pixmap(dpi=110).save(f"{out}-page-{i+1}.png")
print(json.dumps({'pages': d.page_count, 'size': [round(d[0].rect.width / 72 * 25.4), round(d[0].rect.height / 72 * 25.4)],
  'fonts': sorted(set((f[3] or '(none)') + ' ' + f[2] for p in d for f in p.get_fonts())),
  'links': [l.get('uri') for p in d for l in p.get_links() if l.get('uri')],
  'pageText': [p.get_text() for p in d], 'images': [d.extract_image(x[0])['width'] for p in d for x in p.get_images(full=True)]}))`;
  const stem = path.join(OUT, label);
  const r = JSON.parse(execFileSync('python3', ['-c', py, file, stem], { encoding: 'utf8', maxBuffer: 1 << 27 }));
  const qr = execFileSync('swift', [path.join(__dirname, 'qr-decode.swift'), stem + '-qr1.png', stem + '-qr2.png'], { encoding: 'utf8' }).trim().split('\n').map(l => l.split('\t')[1]);
  const link = RC.link(code, 'pack'); const text = r.pageText.join('\n');
  const days = code.split('.'); const names = days.join('').match(/../g).map(c => BY[c].name);
  const words = s => s.split(/\s+/).flatMap(w => w.split(/['׳]/)).map(w => w.replace(/[,.()"]/g, '')).filter(w => w.length > 1);
  return { pages: r.pages, checks: [
    ['A4', r.size.join('x') === '210x297'],
    ['no blank page', r.pageText.every(t => t.trim().length > 20)],
    ['fonts embedded, no Type3', r.fonts.length > 0 && !r.fonts.some(f => /Type3/.test(f))],
    ['stop names selectable', names.every(n => words(n).every(w => text.includes(w)))],
    ['links absolute, /tp/ present, no /t/', r.links.every(u => /^https?:/.test(u)) && r.links.includes(link) && !r.links.some(u => /golondon\.co\.il\/t\//.test(u))],
    ['both QR codes = /tp/ link', qr.length === 2 && qr.every(q => q === link)],
    ['600 px logo embedded', r.images.some(w => w >= 600)]
  ], fonts: r.fonts };
}
function compare(a, b) {
  const py = `
import fitz, sys, json
a, b = fitz.open(sys.argv[1]), fitz.open(sys.argv[2]); res = []
for i in range(min(a.page_count, b.page_count)):
    pa, pb = a[i].get_pixmap(dpi=50), b[i].get_pixmap(dpi=50)
    if (pa.width, pa.height) != (pb.width, pb.height): res.append(1.0); continue
    sa, sb = pa.samples, pb.samples
    diff = sum(1 for k in range(0, len(sa), pa.n) if abs(sa[k] - sb[k]) > 40 or abs(sa[k+1] - sb[k+1]) > 40 or abs(sa[k+2] - sb[k+2]) > 40)
    res.append(round(diff / (pa.width * pa.height) * 100, 2))
print(json.dumps({'pages': [a.page_count, b.page_count], 'diffPct': res}))`;
  return JSON.parse(execFileSync('python3', ['-c', py, a, b], { encoding: 'utf8' }));
}

(async () => {
  console.log('== 1. site safety');
  for (const [p, want] of [['/node_modules/puppeteer-core/package.json', 404], ['/node_modules/@sparticuz/chromium/package.json', 404], ['/package.json', 404], ['/package-lock.json', 404],
    ['/docs/qa/TRAVEL_PACK.md', 404], ['/travel-pack', 200], ['/travel-pack/travel-pack.js', 200], ['/access-cost.js', 200], ['/travel-pack-ui.js', 200], ['/planner', 200], ['/', 200]]) {
    const r = await get(BASE + p); ok(p + ' -> ' + want, r.status === want, r.status);
  }
  for (const fn of ['/.netlify/functions/admin-verify', '/.netlify/functions/admin-login']) {
    const a = await get(BASE + fn), b = await get('https://golondon.co.il' + fn);
    ok('existing function ' + fn + ' answers like production (GET ' + b.status + ')', a.status === b.status, a.status + ' vs ' + b.status);
  }

  console.log('\n== 2. timings and PDFs');
  const ROUTES = { 'one-day': 'ADAGAEAPANAM', 'three-day': 'ADAGAEAPANAM.AIAJArALBJAb.AAAXCQCAAn', 'seven-day': 'ADAGAEAPANAM.AIAJArALBJAb.ARAUAW.AAAXCQCAAn.BRBOAd.BEBFBI.Ae' };
  const EXPECT = { 'one-day': 2, 'three-day': 4, 'seven-day': 8 };
  const timings = [];
  async function pack(label, code, q, note) {
    const r = await get(BASE + '/pack/' + code + (q || ''));
    timings.push({ label, note, status: r.status, client_ms: r.ms, kb: Math.round(r.buf.length / 1024), cache: r.cache.replace(/\s+/g, ' ').slice(0, 60), server_timing: r.timing });
    return r;
  }
  const first = await pack('one-day', ROUTES['one-day'], '', 'cold: first call after deploy');
  await pack('one-day', ROUTES['one-day'], '?dl=1', 'warm: new cache key');
  for (const k of ['three-day', 'seven-day']) await pack(k, ROUTES[k], '', 'warm');
  await pack('seven-day', ROUTES['seven-day'], '?dl=1', 'warm, attachment');
  const hit = await pack('one-day', ROUTES['one-day'], '', 'repeat: CDN');
  console.table(timings);
  ok('cold one-day PDF returned', first.status === 200 && /application\/pdf/.test(first.type), first.status + ' ' + first.type);
  ok('inline by default, attachment with ?dl=1', /inline/.test(first.disp), first.disp);
  for (const [k, code] of Object.entries(ROUTES)) {
    const r = await get(BASE + '/pack/' + code + '?dl=1');
    ok(k + ': attachment disposition', /attachment/.test(r.disp), r.disp);
    const file = path.join(OUT, k + '.pdf'); fs.writeFileSync(file, r.buf);
    const c = pdfCheck(file, code, k);
    ok(k + ': ' + c.pages + ' pages (expected ' + EXPECT[k] + ')', c.pages === EXPECT[k], c.pages);
    c.checks.forEach(([n, v]) => ok(k + ': ' + n, v, c.fonts.join('; ')));
    if (LOCAL && fs.existsSync(path.join(LOCAL, k, 'travel-pack-' + k + '.pdf'))) {
      const cmp = compare(path.join(LOCAL, k, 'travel-pack-' + k + '.pdf'), file);
      console.log('     ' + k + ' vs local render, % pixels differing per page: ' + cmp.diffPct.join(', '));
      ok(k + ': same layout as the approved local render (each page under 1% different)', cmp.pages[0] === cmp.pages[1] && cmp.diffPct.every(x => x < 1), JSON.stringify(cmp));
    }
  }

  console.log('\n== 3. edge cases');
  for (const [name, code, want] of [['malformed single char', 'A', 400], ['malformed empty day', 'AB..CD', 400], ['malformed characters', 'AB%3CCD', 400],
    ['too many days', Array(15).fill('AD').join('.'), 400], ['unknown places', 'ZZZZ', 404], ['empty (site 404, function not called)', '', 404]]) {
    const r = await get(BASE + '/pack/' + code); ok(name + ' -> ' + want, r.status === want, r.status + ' ' + r.buf.toString().slice(0, 60));
  }
  for (const [name, code, pages] of [['shared coordinates (Greenwich)', 'BRAcBO', 2], ['approximate coordinates', 'AUAW', 2], ['one-stop day', 'Ae', 2], ['12-stop day', 'AAABACADAEAFAGAHAhAiAjAk', 3]]) {
    const r = await get(BASE + '/pack/' + code);
    const file = path.join(OUT, 'edge-' + code + '.pdf'); fs.writeFileSync(file, r.buf);
    const c = r.status === 200 ? pdfCheck(file, code, 'edge-' + code) : { pages: 0, checks: [] };
    ok(name + ': 200, ' + c.pages + ' pages (expected ' + pages + ')', r.status === 200 && c.pages === pages, r.status + ' ' + c.pages);
    c.checks.forEach(([n, v]) => ok(name + ': ' + n, v, ''));
  }

  console.log('\n== 5. redirects');
  const tp = await get('https://golondon.co.il/tp/ADAGAEAPANAM'), tpPrev = await get(BASE + '/tp/ADAGAEAPANAM'), t = await get(BASE + '/t/ADAGAEAPANAM');
  ok('/tp/ on the preview -> Planner tagged travel_pack', tpPrev.status === 301 && /from=travel_pack/.test(tpPrev.location) && /utm_source=travel_pack/.test(tpPrev.location), tpPrev.status + ' ' + tpPrev.location);
  ok('/t/ unchanged -> whatsapp', t.status === 301 && /from=share/.test(t.location) && /utm_source=whatsapp/.test(t.location), t.location);
  console.log('     production /tp/ today (rule not deployed yet): ' + tp.status + ' ' + tp.location);

  fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(timings, null, 1));
  console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
