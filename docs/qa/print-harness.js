/*
  Planner print harness
  =====================
  "Save as PDF" in the Planner is the browser print of planner.html (@media print). This harness prints
  every kind of route the Planner can show and checks the PDF that comes out:

    automatic route   1, 3 and 7 days (Math.random seeded, so runs are comparable)
    manual route      1, 3 and 7 days; the 3-day plan has an empty day in the middle (internal Day 1,
                      empty Day 2, Day 3, Day 4) and must come out as Days 1 to 3
    shared route      /t/<code> as it lands in the Planner (?p=<code>&from=share), 1, 3 and 7 days

  Checks per scenario: the route is printed (days numbered 1..n, the expected stops in order, names in the
  PDF text), no empty day, the community form is absent, the "hours and prices change" note is present,
  the day map links are clickable, no Planner controls are printed. For manual and shared routes it also
  checks that WhatsApp, Copy and the /t/ link agree with the print on day numbering.

    NODE_PATH=<node_modules with puppeteer-core> node docs/qa/print-harness.js [--root <site dir>] [--out <dir>]

  Needs puppeteer-core and Google Chrome (override with CHROME). Python 3 with PyMuPDF reads
  the PDFs. Serves the site locally and blocks every external request except fonts.
*/
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const args = process.argv.slice(2);
const opt = (k, d) => args.includes(k) ? args[args.indexOf(k) + 1] : d;
const ROOT = path.resolve(opt('--root', path.join(__dirname, '..', '..')));
const OUT = path.resolve(opt('--out', path.join(require('os').tmpdir(), 'gl-print-harness')));
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p); if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8'));
const BY_ID = {}; DATA.attractions.forEach(a => { BY_ID[a.id] = a; });
const ROUTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'routes.json'), 'utf8')).routes;
const routeDays = id => ROUTES.find(r => r.route_id === id).days.map(d => d.stops.filter(s => BY_ID[s]));
const THREE = routeDays('three-days'), SEVEN = routeDays('seven-days');
const code = days => days.map(d => d.map(id => BY_ID[id].code).join('')).filter(Boolean).join('.');

const UI_STRINGS = ['שליחה בוואטסאפ', 'שמירה כ PDF', 'הוספת יום', 'גרסה אחרת', 'מידע על המקום', 'הוספה לכאן',
  'מוסיפים לכאן', 'העברה ליום', 'חיפוש מקום', 'מקומות שאספתם', 'בוחרים מהרשימה', 'שיבנו לי מסלול', 'בנו לי מסלול',
  'ניווט בהליכה', 'עדיין ריק', 'יום ריק'];
const FORM_STRINGS = ['האתר של הקהילה', 'חיפשתם משהו', 'הצטרפו למועדון'];
const NOTE = 'שעות הפתיחה והמחירים משתנים';

const SCENARIOS = [
  { name: 'auto-1', kind: 'auto', days: 1 }, { name: 'auto-3', kind: 'auto', days: 3 }, { name: 'auto-7', kind: 'auto', days: 7 },
  { name: 'manual-1', kind: 'manual', plan: [THREE[0]] },
  { name: 'manual-3-empty-day', kind: 'manual', plan: [THREE[0], [], THREE[1], THREE[2]] },
  { name: 'manual-7', kind: 'manual', plan: SEVEN },
  { name: 'shared-1', kind: 'shared', plan: [THREE[0]] }, { name: 'shared-3', kind: 'shared', plan: THREE },
  { name: 'shared-7', kind: 'shared', plan: SEVEN }
];

function pdfInfo(file) {
  const py = `
import fitz, json, sys
d = fitz.open(sys.argv[1])
print(json.dumps({'pages': d.page_count, 'text': ''.join(p.get_text() for p in d), 'pageChars': [len(p.get_text().strip()) for p in d],
  'links': [l.get('uri') for p in d for l in p.get_links() if l.get('uri')],
  'fonts': sorted(set((f[3] or '(no name)') + ':' + f[2] for p in d for f in p.get_fonts()))}))`;
  return JSON.parse(execFileSync('python3', ['-c', py, file], { encoding: 'utf8', maxBuffer: 1 << 26 }));
}
/* every word of s is in the PDF text. A word with an apostrophe (ריג'נטס) is checked in parts, because PDF text
   extraction moves the neutral apostrophe in right-to-left runs (נטס'ריג) although the page shows it correctly */
const hasWords = (text, s) => s.split(/\s+/).flatMap(w => w.split(/['׳]/)).map(w => w.replace(/[,.]/g, '')).filter(w => w.length > 1).every(w => text.includes(w));
/* a whole phrase, in logical order or in the visual (word-reversed) order PDF text extraction gives for Hebrew */
const flat = t => t.replace(/\s+/g, ' ');
const hasPhrase = (text, s) => { const t = flat(text); return t.includes(s) || t.includes(s.split(' ').reverse().join(' ')); };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  let fail = 0; const report = [];
  for (const sc of SCENARIOS) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', r => (r.url().startsWith(BASE) || /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(r.url())) ? r.continue() : r.abort());
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => {
      let s = 42; Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      window.__opened = []; window.open = u => { window.__opened.push(String(u)); return null; };
      window.__copied = [];
      try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } } }); } catch (e) {}
    });
    let url = BASE + '/planner.html';
    if (sc.kind === 'shared') url += '?p=' + code(sc.plan) + '&from=share';
    if (sc.kind === 'manual') {
      await page.goto(BASE + '/favicon.ico');
      await page.evaluate(p => localStorage.setItem('golondon_manual_v1', JSON.stringify({ days: p, dayIds: p.map(() => null), active: 0 })), sc.plan);
    }
    await page.goto(url, { waitUntil: 'networkidle2' }); await sleep(700);
    if (sc.kind === 'auto') {
      await page.evaluate(n => [...document.querySelectorAll('#days .chip')][n - 1].click(), sc.days);
      await page.click('#build'); await sleep(900);
    } else if (sc.kind === 'manual') {
      await page.click('#tab-manual'); await sleep(500);
    }
    // outputs other than print: WhatsApp text and Copy text (manual and shared only, auto is unchanged)
    let waDays = null, copyDays = null, linkDays = null;
    if (sc.kind !== 'auto') {
      await sleep(500); await page.evaluate(() => { document.getElementById('m-wa').click(); document.getElementById('m-copy').click(); }); await sleep(300);
      const o = await page.evaluate(() => ({ opened: window.__opened, copied: window.__copied }));
      const wa = o.opened.length ? decodeURIComponent(o.opened[0].split('text=')[1]) : '';
      waDays = [...wa.matchAll(/\*יום (\d+)\*/g)].map(m => +m[1]);
      const link = /golondon\.co\.il\/t\/([A-Za-z0-9.]+)/.exec(wa); linkDays = link ? link[1].split('.').length : 0;
      copyDays = o.copied.length ? [...o.copied[0].matchAll(/^יום (\d+),/gm)].map(m => +m[1]) : [];
    }
    await page.emulateMediaType('print');
    const domAll = await page.evaluate(() => {
      const shown = el => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return true; };
      const cards = [...document.querySelectorAll('#days-out .day-card, #board-days .board-day')].filter(shown);
      const days = cards.map(c => ({
        num: [...c.querySelectorAll('.day-num, .day-num *')].filter(shown).map(e => e.childElementCount ? '' : e.textContent.trim()).join(''),
        stops: [...c.querySelectorAll('.stop-name')].filter(shown).map(e => e.textContent.trim())
      }));
      /* anything you can press or type into, if it would be printed */
      const controls = [...document.querySelectorAll('main button, main select, main input, main textarea, .ca-wrap')].filter(shown)
        .map(e => (e.tagName + ':' + (e.textContent || e.placeholder || '').trim()).slice(0, 40));
      return { days, controls };
    });
    const dom = domAll.days; dom.controls = domAll.controls;
    const file = path.join(OUT, sc.name + '.pdf');
    await page.pdf({ path: file, format: 'A4', preferCSSPageSize: true });
    await ctx.close();
    const info = pdfInfo(file);
    const expectStops = sc.kind === 'auto' ? null : sc.plan.filter(d => d.length).map(d => d.map(id => BY_ID[id].name));
    const nDays = sc.kind === 'auto' ? sc.days : expectStops.length;
    const checks = []; const ok = (n, c, d) => { checks.push({ n, ok: !!c, d }); if (!c) fail++; };
    ok('route printed: day cards', dom.length === nDays, dom.length + ' of ' + nDays);
    ok('days numbered 1..n in print', JSON.stringify(dom.map(d => d.num)) === JSON.stringify(Array.from({ length: nDays }, (_, i) => String(i + 1))), JSON.stringify(dom.map(d => d.num)));
    ok('no blank page (every page has text)', info.pageChars.every(c => c > 0), JSON.stringify(info.pageChars));
    ok('no empty day printed', dom.every(d => d.stops.length > 0), JSON.stringify(dom.map(d => d.stops.length)));
    if (expectStops) ok('stops and order as planned', JSON.stringify(dom.map(d => d.stops)) === JSON.stringify(expectStops), '');
    const allStops = dom.flatMap(d => d.stops);
    ok('stop names in the PDF text', allStops.length > 0 && allStops.every(s => hasWords(info.text, s)), allStops.filter(s => !hasWords(info.text, s)).join(' | '));
    ok('community form absent', !FORM_STRINGS.some(s => hasPhrase(info.text, s)), FORM_STRINGS.filter(s => hasPhrase(info.text, s)).join(', '));
    ok('hours/prices note present', hasWords(info.text, NOTE), '');
    /* the Planner shows a day map link only for a day with at least two distinct points (dayMapUrl) */
    const nameToPlace = {}; DATA.attractions.forEach(a => { nameToPlace[a.name] = a; });
    const mappable = dom.filter(d => new Set(d.stops.map(n => nameToPlace[n]).filter(Boolean).map(a => a.lat + ',' + a.lng)).size >= 2).length;
    const maps = info.links.filter(u => /google\.com\/maps\/dir/.test(u));
    ok('day map links clickable', maps.length === mappable && mappable > 0, maps.length + ' links for ' + mappable + ' days with 2+ points');
    ok('no Planner controls printed', !UI_STRINGS.some(s => hasPhrase(info.text, s)) && dom.controls.length === 0, UI_STRINGS.filter(s => hasPhrase(info.text, s)).concat(dom.controls).join(', '));
    if (waDays) {
      const seq = Array.from({ length: nDays }, (_, i) => i + 1);
      ok('WhatsApp days 1..n', JSON.stringify(waDays) === JSON.stringify(seq), JSON.stringify(waDays));
      ok('Copy days 1..n', JSON.stringify(copyDays) === JSON.stringify(seq), JSON.stringify(copyDays));
      ok('/t/ link has n days', linkDays === nDays, linkDays);
    }
    ok('no page errors', errors.length === 0, errors.join(' | '));
    const pass = checks.every(c => c.ok);
    console.log(`${pass ? 'PASS' : 'FAIL'} ${sc.name}: ${info.pages} pages, ${dom.length} days, ${allStops.length} stops, ${maps.length} map links`);
    checks.filter(c => !c.ok).forEach(c => console.log(`     FAIL ${c.n}: ${c.d}`));
    report.push({ scenario: sc.name, pages: info.pages, days: dom, controls: dom.controls, maps: maps.length, fonts: info.fonts, checks });
  }
  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED CHECKS'}  (PDFs and report.json in ${OUT})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
