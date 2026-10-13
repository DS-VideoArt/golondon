/*
  Travel Pack, local render and QA (Phase 1 prototype)
  ====================================================
  Renders travel-pack.html?p=<route code> to an A4 PDF with headless Chrome, the same path the planned
  server function will take, and checks the result.

    node docs/qa/travel-pack-render.js [--code ADAGAEAPANAM] [--label one-day] [--out <dir>] [--runs 3]

  Default route: "London in 3 days", Day 1 (routes.json three-days / westminster-southbank), 6 stops.
  Measures: browser launch (cold), page build, PDF generation, total, size, pages. Checks:
    route code round trip; stops in route order on every day; numbers 1..n per day in list and map;
    exact vs approximate pins; the order line is labelled as visiting order, not a walking route;
    page count (cover + one page per day, a long day may continue onto one more page) and no blank page;
    no dedicated closing page (the closing block shares the last day's page); no stop split across pages;
    fonts embedded (no Type3); text selectable; links clickable; both QR codes decode to the live route
    (Apple Vision, docs/qa/qr-decode.swift); print-quality logo; Hebrew writing rules; no request outside
    the local server (no personal data, no external storage).
  Writes the PDF, PNG pages and a contact sheet to <out>/<label>/.
*/
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const RC = require('../../route-code.js');
const args = process.argv.slice(2);
const opt = (k, d) => args.includes(k) ? args[args.indexOf(k) + 1] : d;
const ROOT = path.resolve(__dirname, '..', '..');
const CODE = opt('--code', 'ADAGAEAPANAM');
const LABEL = opt('--label', 'pack');
const OUT = path.join(path.resolve(opt('--out', path.join(os.tmpdir(), 'gl-travel-pack'))), LABEL);
const RUNS = +opt('--runs', '3');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const ms = t => Math.round(Number(process.hrtime.bigint() - t) / 1e6);
const words = s => String(s || '').split(/\s+/).flatMap(w => w.split(/['׳]/)).map(w => w.replace(/[,.()"]/g, '')).filter(w => w.length > 1);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8'));
  const byCode = {}, byId = {}; data.attractions.forEach(a => { byCode[a.code] = a.id; byId[a.id] = a; });
  const expected = RC.decode(CODE, c => byCode[c]);
  const file = path.join(OUT, 'travel-pack-' + LABEL + '.pdf');

  const timings = []; let last = null; const external = [];
  for (let run = 1; run <= RUNS; run++) {
    const t0 = process.hrtime.bigint();
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
    const tLaunch = ms(t0);
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', r => { if (r.url().startsWith(BASE) || r.url().startsWith('data:')) r.continue(); else { external.push(r.url()); r.abort(); } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const t1 = process.hrtime.bigint();
    await page.goto(BASE + '/travel-pack.html?p=' + encodeURIComponent(CODE), { waitUntil: 'load' });
    await page.waitForSelector('html[data-pack-ready="1"], html[data-pack-error]', { timeout: 20000 });
    const tBuild = ms(t1);
    const t2 = process.hrtime.bigint();
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    const tPdf = ms(t2);
    const t3 = process.hrtime.bigint();
    await page.goto(BASE + '/travel-pack.html?p=' + encodeURIComponent(CODE), { waitUntil: 'load' });
    await page.waitForSelector('html[data-pack-ready="1"]', { timeout: 20000 });
    await page.pdf({ path: path.join(OUT, 'warm.pdf'), preferCSSPageSize: true, printBackground: true });
    const tWarm = ms(t3);
    if (run === RUNS) {
      last = await page.evaluate(() => {
        const H = document.documentElement;
        return {
          error: H.getAttribute('data-pack-error'), code: H.getAttribute('data-route-code'), lastMapMm: H.getAttribute('data-last-map-mm'),
          days: [...document.querySelectorAll('.tp-day')].map(d => ({
            names: [...d.querySelectorAll('.tp-stop strong')].map(e => e.textContent),
            nums: [...d.querySelectorAll('.tp-stop > .tp-pin')].map(e => ({ n: e.textContent, approx: e.classList.contains('tp-pin--approx') })),
            pins: [...d.querySelectorAll('.tp-overlay .tp-pin-n')].map(t => ({ label: t.textContent, approx: t.getAttribute('fill') !== '#ffffff' })),
            orderPaths: d.querySelectorAll('.tp-overlay path.tp-order').length,
            legend: [...d.querySelectorAll('.tp-legend li')].map(l => l.textContent.trim()),
            meta: (d.querySelector('.tp-day-meta') || {}).textContent || '',
            close: !!d.querySelector('.tp-close'),
            closeMm: d.querySelector('.tp-close') ? d.querySelector('.tp-close').getBoundingClientRect().height * 25.4 / 96 : 0
          })),
          coverRows: document.querySelectorAll('.tp-ov-row').length,
          coverDetails: [...document.querySelectorAll('.tp-ov-row')].map(r => (r.querySelector('.tp-ov-details') || {}).textContent || ''),
          bookAlert: !!document.querySelector('.tp-stat--alert'),
          bgStamp: !!document.querySelector('.tp-bg-stamp'),
          dashes: (document.body.innerText.match(/[–—]| - /g) || []).length,
          qrHrefs: [...document.querySelectorAll('.tp-qr, .tp-close-qr')].map(a => a.href)
        };
      });
      last.errors = errors;
    }
    await browser.close();
    timings.push({ run, launch_ms: tLaunch, build_ms: tBuild, pdf_ms: tPdf, total_ms: tLaunch + tBuild + tPdf, warm_second_pdf_ms: tWarm });
  }
  server.close();

  const py = `
import fitz, json, sys
d = fitz.open(sys.argv[1]); out = sys.argv[2]
pages = []
for i, p in enumerate(d):
    p.get_pixmap(dpi=110).save(f"{out}/page-{i+1}.png")
    pages.append(p.get_text())
d[0].get_pixmap(dpi=300).save(f"{out}/qr-cover.png"); d[-1].get_pixmap(dpi=300).save(f"{out}/qr-last.png")
pix = [p.get_pixmap(dpi=40) for p in d]; gap = 8
sheet = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, (pix[0].width + gap) * len(pix) - gap, pix[0].height), 0); sheet.set_rect(sheet.irect, (170, 170, 170))
for i, px in enumerate(pix): px.set_origin(i * (px.width + gap), 0); sheet.copy(px, px.irect)
sheet.save(f"{out}/sheet.png")
imgs = [d.extract_image(x[0]) for p in d for x in p.get_images(full=True)]
print(json.dumps({'pages': d.page_count, 'size': [round(d[0].rect.width / 72 * 25.4), round(d[0].rect.height / 72 * 25.4)],
  'fonts': sorted(set((f[3] or '(none)') + ' ' + f[2] for p in d for f in p.get_fonts())),
  'links': [l.get('uri') for p in d for l in p.get_links() if l.get('uri')],
  'pageText': pages, 'images': [[i['width'], i['height']] for i in imgs]}))`;
  const pdf = JSON.parse(execFileSync('python3', ['-c', py, file, OUT], { encoding: 'utf8', maxBuffer: 1 << 27 }));
  const text = pdf.pageText.join('\n');
  const qr = execFileSync('swift', [path.join(__dirname, 'qr-decode.swift'), path.join(OUT, 'qr-cover.png'), path.join(OUT, 'qr-last.png')], { encoding: 'utf8' })
    .trim().split('\n').map(l => l.split('\t')[1]);

  const checks = []; let fail = 0; const ok = (n, c, d) => { checks.push([n, !!c, d]); if (!c) fail++; };
  /* links from the pack use the pack channel (/tp/), never the WhatsApp-tagged /t/ */
  const link = RC.link(CODE, 'pack');
  const expDays = expected.map(d => d.map(id => byId[id]));
  /* the base can be a deploy (Deploy Preview QA); default is this checkout served locally */
  ok('page built without error', !last.error && !last.errors.length, last.error || last.errors.join(' | '));
  ok('route code round trip (input = rendered = re-encoded)', last.code === CODE && RC.encode(expected, id => byId[id].code) === CODE, last.code);
  ok('one day page per route day, cover lists every day', last.days.length === expDays.length && last.coverRows === expDays.length, last.days.length + ' / ' + last.coverRows);
  ok('stops in route order on every day', last.days.every((d, i) => JSON.stringify(d.names) === JSON.stringify(expDays[i].map(a => a.name))), '');
  ok('list numbers 1..n per day', last.days.every((d, i) => d.nums.map(x => x.n).join() === expDays[i].map((_, k) => k + 1).join()), '');
  ok('map pins = list numbers per day', last.days.every(d => d.pins.flatMap(p => p.label.split('·')).sort().join() === d.nums.map(x => x.n).sort().join()), '');
  ok('approximate stops hollow in list and map', last.days.every((d, i) => {
    const ap = expDays[i].map(a => a.precision === 'approx');
    return JSON.stringify(d.nums.map(x => x.approx)) === JSON.stringify(ap) && d.pins.every(p => p.approx === p.label.split('·').some(n => ap[+n - 1]));
  }), '');
  ok('order line labelled as visiting order, not a walking route, on every day with a line', last.days.every(d => d.orderPaths === 0 ||
    d.legend.some(l => /סדר הביקור/.test(l) && /לא מסלול הליכה/.test(l))), '');
  ok('approximate legend says area, not exact address', last.days.every((d, i) => !expDays[i].some(a => a.precision === 'approx') ||
    d.legend.some(l => /מיקום משוער/.test(l) && /לא כתובת מדויקת/.test(l))), '');
  ok('no wording claims a walking path', !/מסלול ההליכה|מסלול הליכה של היום/.test(text), '');
  ok('prototype background marks itself as not a map', last.bgStamp, '');
  /* a day with a paid or partly paid stop must never be summarised as all free (cover row and day page) */
  const notFree = a => !a.free || /בתשלום/.test(a.priceBand || '');
  ok('free summary never hides a paid or partly paid stop', last.days.every((d, i) => !expDays[i].some(notFree) || !/כולן בלי תשלום|^בלי תשלום/.test(d.meta)) &&
    last.coverDetails.every((t, i) => !expDays[i].some(notFree) || !/בלי תשלום כניסה$/.test(t) || /בחינם/.test(t)), JSON.stringify(last.days.map(d => d.meta)));
  ok('book-ahead zero is not highlighted', expDays.flat().some(a => a.bookAhead) === last.bookAlert, String(last.bookAlert));
  ok('closing block only on the last day, about 18 to 22 mm', last.days.map(d => d.close).join() === last.days.map((_, i) => i === last.days.length - 1).join() &&
    last.days[last.days.length - 1].closeMm >= 16 && last.days[last.days.length - 1].closeMm <= 24, last.days[last.days.length - 1].closeMm.toFixed(1) + ' mm');
  const minPages = 1 + expDays.length;
  ok('A4, page count = cover + one per day (a long day may add one)', pdf.size.join('x') === '210x297' && pdf.pages >= minPages && pdf.pages <= minPages + expDays.filter(d => d.length > 6).length,
    pdf.pages + ' pages for ' + expDays.length + ' days');
  ok('no blank page', pdf.pageText.every(t => t.trim().length > 20), JSON.stringify(pdf.pageText.map(t => t.trim().length)));
  ok('no dedicated closing page: the last page also has stops', words('לפני שיוצאים המסלול החי').every(w => pdf.pageText[pdf.pages - 1].includes(w)) &&
    words(expDays[expDays.length - 1].slice(-1)[0].name).every(w => pdf.pageText[pdf.pages - 1].includes(w)), '');
  const split = [];
  expDays.flat().forEach(a => {
    const en = pdf.pageText.findIndex(t => words(a.nameEn).every(w => t.includes(w)));
    /* the end of the stop block: its tip, or the Tube station when a place has no tip */
    const tail = a.tip ? words(a.tip).slice(0, 4) : words(a.tube);
    const tip = pdf.pageText.findIndex(t => tail.every(w => t.includes(w)));
    if (en < 0 || tip < 0 || en !== tip) split.push(a.id + ' ' + en + '/' + tip);
  });
  ok('no stop split across pages (name and tip on the same page)', split.length === 0, split.join(', '));
  ok('fonts embedded, no Type3', pdf.fonts.length > 0 && !pdf.fonts.some(f => /Type3/.test(f)), pdf.fonts.join(' ; '));
  ok('text selectable (all stop names in PDF text)', expDays.flat().every(a => words(a.name).every(w => text.includes(w))), '');
  ok('links clickable and all absolute: live route, official sites, navigation per day', pdf.links.includes(link) && pdf.links.filter(u => /google\.com\/maps\/dir/.test(u)).length >= expDays.filter(d => d.length > 1).length &&
    expDays.flat().every(a => !/^https?:\/\//.test(a.source || '') || pdf.links.includes(a.source)) && !pdf.links.some(u => !/^https?:/.test(u)), pdf.links.length + ' links');
  ok('pack never links to the WhatsApp-tagged /t/ path', !pdf.links.some(u => /golondon\.co\.il\/t\//.test(u)) && link.indexOf('/tp/') > 0, link);
  ok('cover QR and closing QR decode to the live route link', qr.length === 2 && qr.every(q => q === link) && last.qrHrefs.every(h => h === link), JSON.stringify(qr));
  ok('print-quality logo (600 px source embedded)', pdf.images.some(([w]) => w >= 600), JSON.stringify(pdf.images));
  ok('Hebrew writing rules: no long dash, no spaced hyphen', last.dashes === 0, last.dashes);
  ok('no request outside the local server', external.length === 0, external.join(' | '));

  const size = fs.statSync(file).size;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ code: CODE, label: LABEL, pdf_bytes: size, pages: pdf.pages, lastMapMm: last.lastMapMm, fonts: pdf.fonts, timings, checks }, null, 1));
  console.log(`${LABEL}: ${pdf.pages} pages, ${(size / 1024).toFixed(1)} KB, last day map ${last.lastMapMm} mm, ${file}`);
  if (RUNS > 1) console.table(timings);
  checks.forEach(([n, c, d]) => console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ': ' + d)));
  console.log(fail ? fail + ' FAILED' : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
