/*
  Closed places harness ("closed": true in planner-data.json)
  ===========================================================
  A permanently closed place stays in the data so old shared links keep working, but is never offered for
  a new route. This harness checks both sides in a real browser against the local site:

    new routes     automatic builds never pick a closed place; the manual list and its counts leave them
                   out; adding one is refused; a guide page's ?day= link skips it; area guide cards, the
                   saved-places pill (GoLondonTray.add) and site search do not offer it
    old routes     a shared /t/ link (?p=) that contains a closed place opens with every stop in place, the
                   closed stop marked "נסגר לצמיתות", no booking or navigation for it, the day's walking link
                   skips it, WhatsApp and Copy say it is closed, the /t/ code in WhatsApp is the same code,
                   the print shows the status, and the info window offers no "add"
    saved places   a closed place saved earlier is shown in the Planner's saved list with the status and no
                   add button, and "add all" adds only the open ones

    NODE_PATH=<node_modules with puppeteer-core> node docs/qa/closed-places-harness.js
*/
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(__dirname, '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8')).attractions;
const BY = {}; DATA.forEach(a => { BY[a.id] = a; });
const CLOSED = DATA.filter(a => a.closed);
const CLOSED_NAMES = CLOSED.map(a => a.name);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p); if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ': ' + d)); if (!c) fail++; };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  async function open(url, prep) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', r => (r.url().startsWith(BASE) || /fonts\.(googleapis|gstatic)|cdnjs/.test(r.url())) ? r.continue() : r.abort());
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => {
      window.__opened = []; window.open = u => { window.__opened.push(String(u)); return null; };
      window.__copied = []; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } } }); } catch (e) {}
    });
    if (prep) { await page.goto(BASE + '/favicon.ico'); await page.evaluate(prep); }
    await page.goto(BASE + url, { waitUntil: 'networkidle2' }); await sleep(800);
    return { ctx, page, errors };
  }
  console.log('closed places: ' + CLOSED.map(a => a.id + ' (' + a.code + ')').join(', '));

  // 1. automatic routes: many builds with every interest and the longest trip
  let { ctx, page, errors } = await open('/planner.html');
  await page.evaluate(() => {
    [...document.querySelectorAll('#days .chip')][6].click();
    document.querySelectorAll('#interests .chip').forEach(c => { if (c.getAttribute('aria-pressed') !== 'true') c.click(); });
  });
  const seen = new Set(); let builds = 0;
  for (const budget of [0, 1, 2]) {
    await page.evaluate(b => { const c = document.querySelectorAll('#budget .chip, #budgets .chip'); if (c[b]) c[b].click(); }, budget);
    await page.evaluate(() => document.getElementById('build').click()); await sleep(250);
    for (let i = 0; i < 25; i++) {
      (await page.evaluate(() => [...document.querySelectorAll('#days-out .stop-name')].map(e => e.textContent))).forEach(n => seen.add(n));
      builds++;
      await page.evaluate(() => document.getElementById('again').click()); await sleep(60);
    }
  }
  ok('automatic: ' + builds + ' builds, ' + seen.size + ' different places, none closed', builds >= 75 && CLOSED_NAMES.every(n => !seen.has(n)), CLOSED_NAMES.filter(n => seen.has(n)).join(', '));

  // 2. manual list
  await page.evaluate(() => document.getElementById('tab-manual').click()); await sleep(300);
  const pal = await page.evaluate(() => ({ text: document.getElementById('pal-list').innerText, all: (document.querySelector('#pal-areas .area-btn .area-count') || {}).textContent || '' }));
  ok('manual: closed places are not in the list', CLOSED_NAMES.every(n => !pal.text.includes(n)), '');
  ok('manual: "all areas" counts only open places (' + (DATA.length - CLOSED.length) + ')', pal.all.trim() === String(DATA.length - CLOSED.length), pal.all);
  for (const a of CLOSED) {
    await page.evaluate(q => { const s = document.getElementById('pal-search'); s.value = q; s.dispatchEvent(new Event('input')); }, a.nameEn.split(' ')[0] === 'The' ? a.nameEn : a.nameEn.split(' ')[0]);
    await sleep(150);
    const t = await page.evaluate(() => document.getElementById('pal-list').innerText);
    ok('manual search "' + a.nameEn + '": not offered', !t.includes(a.name), t.slice(0, 80));
  }
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // 3. old shared route with a closed place (as /t/<code> lands: ?p=<code>&from=share)
  const code = [BY['camden-market'].code + BY['chin-chin-labs'].code + BY['poppies-camden'].code, BY['spitalfields-market'].code + BY['beyond-retro'].code + BY['brick-lane'].code].join('.');
  ({ ctx, page, errors } = await open('/planner.html?p=' + code + '&from=share'));
  const board = await page.evaluate(() => [...document.querySelectorAll('#board-days .board-day')].map(d => [...d.querySelectorAll('.stop')].map(s => ({
    name: s.querySelector('.stop-name').textContent, closed: s.classList.contains('stop--closed'), status: (s.querySelector('.fact.closed') || {}).textContent || '',
    tip: (s.querySelector('.stop-tip') || {}).textContent || '', acts: [...s.querySelectorAll('.stop-actions a, .stop-actions button')].map(b => b.textContent.trim()) }))));
  const flat = board.flat();
  ok('old link: every stop kept in order (' + flat.length + ' of 6)', JSON.stringify(board.map(d => d.map(s => s.name))) === JSON.stringify([['camden-market', 'chin-chin-labs', 'poppies-camden'], ['spitalfields-market', 'beyond-retro', 'brick-lane']].map(d => d.map(id => BY[id].name))), JSON.stringify(board.map(d => d.map(s => s.name))));
  const shut = flat.filter(s => s.closed);
  ok('old link: the 2 closed stops are marked "נסגר לצמיתות"', shut.length === 2 && shut.every(s => s.status.includes('נסגר לצמיתות') && /נסגר לצמיתות/.test(s.tip)), JSON.stringify(shut));
  ok('old link: open stops are not marked', flat.filter(s => !s.closed).every(s => !s.status), '');
  ok('old link: no booking or navigation button on a closed stop', shut.every(s => s.acts.length === 1 && /מידע/.test(s.acts[0])), JSON.stringify(shut.map(s => s.acts)));
  const maps = await page.evaluate(() => [...document.querySelectorAll('#board-days a.day-map')].map(a => a.href));
  const pt = id => String(Math.round(BY[id].lat * 1e5) / 1e5) + ',' + String(Math.round(BY[id].lng * 1e5) / 1e5);
  ok('old link: day walking links skip the closed stops', maps.length === 2 && !maps.some(u => u.includes(pt('chin-chin-labs')) || u.includes(pt('beyond-retro'))) && maps[0].includes(pt('camden-market')), JSON.stringify(maps));
  await page.evaluate(() => { document.getElementById('m-wa').click(); document.getElementById('m-copy').click(); }); await sleep(300);
  const out = await page.evaluate(() => ({ wa: window.__opened[0] ? decodeURIComponent(window.__opened[0].split('text=')[1]) : '', copy: window.__copied[0] || '' }));
  const tcode = (/golondon\.co\.il\/t\/([A-Za-z0-9.]+)/.exec(out.wa) || [])[1];
  ok('old link: WhatsApp keeps the same /t/ code', tcode === code, tcode + ' vs ' + code);
  ok('old link: WhatsApp and Copy say the closed places are closed', (out.wa.match(/נסגר לצמיתות/g) || []).length === 2 && (out.copy.match(/נסגר לצמיתות/g) || []).length === 2, out.wa.slice(0, 200));
  await page.evaluate(() => [...document.querySelectorAll('#board-days .stop--closed .stop-btn')][0].click()); await sleep(300);
  const modal = await page.evaluate(() => { const b = [...document.querySelectorAll('.info-btn--primary')].pop(); return b ? { text: b.textContent.trim(), disabled: b.disabled } : null; });
  ok('old link: the info window offers no "add" for a closed place', modal && modal.disabled && /נסגר לצמיתות/.test(modal.text), JSON.stringify(modal));
  await page.keyboard.press('Escape');
  await page.emulateMediaType('print');
  const printed = await page.evaluate(() => { const s = document.querySelector('#board-days .stop--closed .fact.closed'); return s ? getComputedStyle(s).display !== 'none' : false; });
  ok('old link: the status is printed', printed, '');
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // 4. new route from a guide page link (?day=) with a closed id: skipped
  ({ ctx, page, errors } = await open('/planner.html?day=camden-market,poppies-camden,chin-chin-labs,coffee-jar-camden&from=camden_exp_food'));
  const preset = await page.evaluate(() => [...document.querySelectorAll('#board-days .stop-name')].map(e => e.textContent));
  ok('?day= link (new route): closed place skipped, the other 3 loaded', preset.length === 3 && !preset.includes(BY['chin-chin-labs'].name), JSON.stringify(preset));
  await ctx.close();

  // 5. saved places: closed shown with status, not addable
  ({ ctx, page, errors } = await open('/planner.html', () => localStorage.setItem('golondon_tray_v1', JSON.stringify({ ids: ['beyond-retro', 'big-ben'] }))));
  await sleep(600);
  const tray = await page.evaluate(() => [...document.querySelectorAll('#tray-list .tray-item')].map(c => ({ text: c.textContent, plusHidden: c.querySelector('.tray-add').hidden })));
  ok('saved places: closed one kept with "נסגר לצמיתות" and no add button', tray.length === 2 && tray.some(t => t.text.includes(BY['beyond-retro'].name) && t.text.includes('נסגר לצמיתות') && t.plusHidden) && tray.some(t => t.text.includes(BY['big-ben'].name) && !t.plusHidden), JSON.stringify(tray));
  await page.evaluate(() => document.getElementById('tray-all').click()); await sleep(300);
  const added = await page.evaluate(() => [...document.querySelectorAll('#board-days .stop-name')].map(e => e.textContent));
  ok('saved places: "add all" adds only the open place', added.length === 1 && added[0] === BY['big-ben'].name, JSON.stringify(added));
  const pill = await page.evaluate(() => window.GoLondonTray.add('blitz-london'));
  ok('site-wide save (GoLondonTray.add) refuses a closed place', pill === false, String(pill));
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // 6. area guide card, nearby mode and search
  ({ ctx, page, errors } = await open('/guide-areas-camden.html'));
  await page.evaluate(() => { const c = document.querySelector('.exp-c[data-exp="food"]'); if (c) c.click(); }); await sleep(800);
  const cardText = await page.evaluate(() => document.body.innerText);
  ok('Camden guide: food card does not offer the closed shop', !cardText.includes(BY['chin-chin-labs'].name) && !/chin-chin-labs/.test(await page.content()), '');
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'search-index.json'), 'utf8')).items;
  ok('search index: no closed place', !idx.some(i => i.type === 'place' && CLOSED_NAMES.indexOf(i.title) !== -1), '');

  await browser.close(); server.close();
  console.log(fail ? fail + ' FAILED' : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
