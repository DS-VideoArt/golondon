/*
  Travel Pack, local render and QA (Phase 1 prototype)
  ====================================================
  Renders travel-pack.html?p=<route code> to an A4 PDF with headless Chrome, the same path the planned
  server function will take, and checks the result.

    node docs/qa/travel-pack-render.js [--code ADAGAEAPANAM] [--out <dir>] [--runs 3]

  Default route: "London in 3 days", Day 1 (routes.json three-days / westminster-southbank), 6 stops.
  Measures: browser launch (cold), page build, PDF generation, total, size, pages. Then checks: route code
  round trip, stop order and numbers (list, map pins, data), exact vs approximate pins, the order line is
  labelled as visiting order, fonts embedded (no Type3), text selectable, links clickable, QR payload
  (Apple Vision, docs/qa/qr-decode.swift), Hebrew writing rules, and that the page made no request outside
  the local server (no personal data, no external storage). Writes the PDF and PNG previews to --out.
*/
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const RC = require('../../route-code.js');
const args = process.argv.slice(2);
const opt = (k, d) => args.includes(k) ? args[args.indexOf(k) + 1] : d;
const ROOT = path.resolve(__dirname, '..', '..');
const CODE = opt('--code', 'ADAGAEAPANAM');
const OUT = path.resolve(opt('--out', path.join(os.tmpdir(), 'gl-travel-pack')));
const RUNS = +opt('--runs', '3');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const ms = t => Math.round(Number(process.hrtime.bigint() - t) / 1e6);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8'));
  const byCode = {}, byId = {}; data.attractions.forEach(a => { byCode[a.code] = a.id; byId[a.id] = a; });
  const expected = RC.decode(CODE, c => byCode[c]);

  const timings = []; let last = null; const external = [];
  for (let run = 1; run <= RUNS; run++) {
    const t0 = process.hrtime.bigint();
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
    const tLaunch = ms(t0);
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', r => { if (r.url().startsWith(BASE) || r.url().startsWith('data:')) r.continue(); else { external.push(r.url()); r.abort(); } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const t1 = process.hrtime.bigint();
    await page.goto(BASE + '/travel-pack.html?p=' + encodeURIComponent(CODE), { waitUntil: 'load' });
    await page.waitForSelector('html[data-pack-ready="1"], html[data-pack-error]', { timeout: 20000 });
    const tBuild = ms(t1);
    const t2 = process.hrtime.bigint();
    const file = path.join(OUT, 'travel-pack-' + CODE + '.pdf');
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    const tPdf = ms(t2);
    // a second PDF in the same browser: the warm case of a server that keeps Chrome alive
    const t3 = process.hrtime.bigint();
    await page.goto(BASE + '/travel-pack.html?p=' + encodeURIComponent(CODE), { waitUntil: 'load' });
    await page.waitForSelector('html[data-pack-ready="1"]', { timeout: 20000 });
    await page.pdf({ path: path.join(OUT, 'warm.pdf'), preferCSSPageSize: true, printBackground: true });
    const tWarm = ms(t3);
    if (run === RUNS) {
      await page.emulateMediaType('print');
      last = await page.evaluate(() => {
        const H = document.documentElement;
        const text = document.body.innerText;
        return {
          error: H.getAttribute('data-pack-error'), code: H.getAttribute('data-route-code'),
          listNames: [...document.querySelectorAll('.tp-stop strong')].map(e => e.textContent),
          listNums: [...document.querySelectorAll('.tp-stop > .tp-pin')].map(e => ({ n: e.textContent, approx: e.classList.contains('tp-pin--approx') })),
          mapPins: [...document.querySelectorAll('.tp-overlay .tp-pin-n')].map(t => ({ label: t.textContent, approx: t.getAttribute('fill') !== '#ffffff' })),
          orderPaths: document.querySelectorAll('.tp-overlay path.tp-order').length,
          legend: [...document.querySelectorAll('.tp-legend li')].map(l => l.textContent.trim()),
          bgStamp: !!document.querySelector('.tp-bg-stamp'),
          dashes: (text.match(/[\u2013\u2014]| - /g) || []).length,
          qrHref: (document.querySelector('.tp-qr') || {}).href || '',
          view: (document.querySelector('.tp-map') || { dataset: {} }).dataset
        };
      });
      last.errors = errors;
    }
    await browser.close();
    timings.push({ run, launch_ms: tLaunch, build_ms: tBuild, pdf_ms: tPdf, total_ms: tLaunch + tBuild + tPdf, warm_second_pdf_ms: tWarm });
  }
  server.close();

  const file = path.join(OUT, 'travel-pack-' + CODE + '.pdf');
  const py = `
import fitz, json, sys
d = fitz.open(sys.argv[1]); out = sys.argv[2]
for i, p in enumerate(d): p.get_pixmap(dpi=110).save(f"{out}/page-{i+1}.png"); p.get_pixmap(dpi=300, clip=None).save(f"{out}/page-{i+1}-300.png") if i == 0 else None
print(json.dumps({'pages': d.page_count, 'size': [round(d[0].rect.width / 72 * 25.4), round(d[0].rect.height / 72 * 25.4)],
  'fonts': sorted(set((f[3] or '(none)') + ' ' + f[2] + ' ' + f[1] for p in d for f in p.get_fonts())),
  'links': [l.get('uri') for p in d for l in p.get_links() if l.get('uri')],
  'text': ''.join(p.get_text() for p in d)}))`;
  const pdf = JSON.parse(execFileSync('python3', ['-c', py, file, OUT], { encoding: 'utf8', maxBuffer: 1 << 26 }));
  const qr = execFileSync('swift', [path.join(__dirname, 'qr-decode.swift'), path.join(OUT, 'page-1-300.png')], { encoding: 'utf8' }).trim().split('\t')[1];

  const checks = []; let fail = 0; const ok = (n, c, d) => { checks.push([n, !!c, d]); if (!c) fail++; };
  const expNames = expected[0].map(id => byId[id].name);
  const expApprox = expected[0].map(id => byId[id].precision === 'approx');
  ok('page built without error', !last.error && !last.errors.length, last.error || last.errors.join(' | '));
  ok('route code round trip (input = rendered = re-encoded)', last.code === CODE && RC.encode(expected, id => byId[id].code) === CODE, last.code);
  ok('stop list in route order', JSON.stringify(last.listNames) === JSON.stringify(expNames), JSON.stringify(last.listNames));
  ok('list numbers 1..n', last.listNums.map(x => x.n).join(',') === expNames.map((_, i) => i + 1).join(','), last.listNums.map(x => x.n).join(','));
  ok('map pins = list numbers', last.mapPins.map(p => p.label).sort().join(',') === last.listNums.map(x => x.n).sort().join(','), last.mapPins.map(p => p.label).join(','));
  ok('approximate stops are hollow in list and map', JSON.stringify(last.listNums.map(x => x.approx)) === JSON.stringify(expApprox) &&
    last.mapPins.every(p => p.approx === expApprox[+p.label - 1]), JSON.stringify(expApprox));
  ok('order line drawn and labelled as visiting order, not walking route', last.orderPaths === expNames.length - 1 &&
    last.legend.some(l => /סדר הביקור/.test(l) && /לא מסלול הליכה/.test(l)), last.legend.join(' | '));
  ok('no wording claims a walking path', !/מסלול ההליכה|מסלול הליכה של היום/.test(pdf.text), '');
  ok('prototype background marks itself as not a map', last.bgStamp, '');
  ok('A4, pages', pdf.size.join('x') === '210x297' && pdf.pages >= 2 && pdf.pages <= 3, pdf.pages + ' pages ' + pdf.size.join('x'));
  ok('fonts embedded, no Type3', pdf.fonts.length > 0 && !pdf.fonts.some(f => /Type3/.test(f)), pdf.fonts.join(' ; '));
  ok('text selectable (stop names in PDF text)', expNames.every(n => n.split(/\s+/).flatMap(w => w.split(/['׳]/)).filter(w => w.length > 1).every(w => pdf.text.includes(w))), '');
  const link = RC.link(CODE);
  ok('links clickable: live route, official sites, day navigation', pdf.links.includes(link) && pdf.links.some(u => /google\.com\/maps\/dir/.test(u)) &&
    expected[0].every(id => !byId[id].source || pdf.links.includes(byId[id].source)), pdf.links.length + ' links');
  ok('QR decodes to the live route link', qr === link && last.qrHref === link, qr);
  ok('Hebrew writing rules: no long dash, no spaced hyphen', last.dashes === 0, last.dashes);
  ok('no request outside the local server', external.length === 0, external.join(' | '));

  const size = fs.statSync(file).size;
  const result = { code: CODE, view: last.view, pdf_bytes: size, pages: pdf.pages, fonts: pdf.fonts, links: pdf.links, qr, timings, checks };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(result, null, 1));
  console.log('PDF', file, (size / 1024).toFixed(1) + ' KB', pdf.pages + ' pages');
  console.table(timings);
  checks.forEach(([n, c, d]) => console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ': ' + d)));
  console.log(fail ? fail + ' FAILED' : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
