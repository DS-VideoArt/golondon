/*
  Travel Pack download UI harness (travel-pack-ui.js in planner.html)
  ===================================================================
  Serves the site locally and answers /pack/<code> with a stub: a small PDF, or an error, so the UI states
  can be checked without the server function:

    ready     button visible on the automatic results and the manual board (hidden in print)
    preparing button disabled with a spinner while the PDF is fetched
    success   "הורדת הקובץ" always; "שיתוף" only when navigator.canShare({files}) is true; share and
              download fire travel_pack_download with the right delivery_method
    error     message, retry, direct link, print fallback; travel_pack_error fires; the Planner still works
  Also: travel_pack_generate parameters, the route code sent is the Planner's own /t/ code, no request
  carries personal data, the funnel events are unchanged by the button, and layout at 390 and 360 px.

    node docs/qa/travel-pack-ui-harness.js
*/
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(__dirname, '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
let mode = 'ok'; const packHits = [];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith('/pack/')) {
    packHits.push(p);
    return setTimeout(() => {
      if (mode === 'ok') { res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end(PDF); }
      res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('fail');
    }, 600);
  }
  let f = path.join(ROOT, p === '/' ? '/index.html' : p); if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0; const ok = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ': ' + d)); if (!c) fail++; };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  async function open(width, share) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', r => (r.url().startsWith(BASE) || /fonts\.(googleapis|gstatic)|cdnjs/.test(r.url())) ? r.continue() : r.abort());
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(share => {
      window.__ev = []; const dl = window.dataLayer = window.dataLayer || []; const push = Array.prototype.push;
      dl.push = function () { for (const a of arguments) if (a && a[0] === 'event') window.__ev.push({ n: a[1], p: a[2] || {} }); return push.apply(this, arguments); };
      let s = 3; Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      if (share === 'files') { navigator.canShare = () => true; navigator.share = () => Promise.resolve(); }
      else if (share === 'text-only') { navigator.canShare = d => !(d && d.files); navigator.share = () => Promise.resolve(); }
      else { delete Navigator.prototype.share; delete Navigator.prototype.canShare; }
    }, share);
    await page.goto(BASE + '/planner.html', { waitUntil: 'networkidle2' }); await sleep(600);
    return { ctx, page, errors };
  }
  const ev = page => page.evaluate(() => window.__ev);

  // 1. automatic route, success, file sharing supported
  mode = 'ok';
  let { ctx, page, errors } = await open(1280, 'files');
  await page.evaluate(() => [...document.querySelectorAll('#days .chip')][2].click()); await page.evaluate(() => document.getElementById('build').click()); await sleep(800);
  ok('ready: pack button visible on results and board', await page.evaluate(() => !document.getElementById('pack').hidden && !document.getElementById('m-pack').hidden), '');
  await page.evaluate(() => document.getElementById('pack').click());
  const preparing = await page.evaluate(() => ({ disabled: document.getElementById('pack').disabled, text: document.getElementById('pack').textContent.trim() }));
  ok('preparing: button disabled with progress label', preparing.disabled && /מכינים/.test(preparing.text), JSON.stringify(preparing));
  await sleep(1200);
  const success = await page.evaluate(() => ({ text: document.querySelector('#results .gl-pack-status').textContent, share: !![...document.querySelectorAll('#results .gl-pack-act')].find(b => b.textContent === 'שיתוף'),
    dl: (document.querySelector('#results a.gl-pack-act[download]') || {}).download, enabled: !document.getElementById('pack').disabled }));
  ok('success: share and download offered, button ready again', /מוכנה/.test(success.text) && success.share && success.dl === 'golondon-travel-pack.pdf' && success.enabled, JSON.stringify(success));
  await page.evaluate(() => [...document.querySelectorAll('#results .gl-pack-act')].find(b => b.textContent === 'שיתוף').click()); await sleep(200);
  let e = await ev(page);
  const gen = e.find(x => x.n === 'travel_pack_generate'), dl1 = e.find(x => x.n === 'travel_pack_download');
  ok('travel_pack_generate params', gen && gen.p.planner_mode === 'auto' && gen.p.day_count === 3 && gen.p.place_count > 0 && gen.p.generation_method === 'server' && gen.p.source_component === 'planner_results', JSON.stringify(gen));
  ok('travel_pack_download on share, with delivery_method and duration_bucket', dl1 && dl1.p.delivery_method === 'share' && /^(under_3s|3_6s)$/.test(dl1.p.duration_bucket), JSON.stringify(dl1));
  const code = await page.evaluate(() => window.GoLondonPlannerPack.current('results').code);
  ok('the PDF is requested with the Planner route code (same as /t/)', packHits[packHits.length - 1] === '/pack/' + code, packHits[packHits.length - 1] + ' vs ' + code);
  ok('no personal data in the request (route code only)', /^\/pack\/[A-Za-z0-9.]+$/.test(packHits[packHits.length - 1]), packHits[packHits.length - 1]);
  ok('funnel events not fired by the pack button', e.filter(x => /^planner_(open|start|complete)$/.test(x.n)).length === 3, JSON.stringify(e.map(x => x.n)));
  await page.emulateMediaType('print');
  ok('pack button and status hidden in print', await page.evaluate(() => getComputedStyle(document.getElementById('pack')).display === 'none' && getComputedStyle(document.querySelector('#results .gl-pack-status')).display === 'none'), '');
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // 2. manual board, success, sharing without file support: download only
  ({ ctx, page, errors } = await open(1280, 'text-only'));
  await page.evaluate(() => document.getElementById('tab-manual').click()); await sleep(300);
  for (let i = 0; i < 3; i++) { await page.evaluate(i => document.querySelectorAll('#pal-list .cube-btn--add')[i].click(), i); await sleep(200); }
  await page.evaluate(() => document.getElementById('m-pack').click()); await sleep(1500);
  const s2 = await page.evaluate(() => ({ share: [...document.querySelectorAll('#panel-manual .gl-pack-act')].some(b => b.textContent === 'שיתוף'), dl: !!document.querySelector('#panel-manual a.gl-pack-act[download]') }));
  ok('no file sharing: download only, no share button', !s2.share && s2.dl, JSON.stringify(s2));
  await page.evaluate(() => { const a = document.querySelector('#panel-manual a.gl-pack-act[download]'); a.addEventListener('click', ev => ev.preventDefault(), { once: true }); a.click(); }); await sleep(200);
  e = await ev(page);
  const g2 = e.find(x => x.n === 'travel_pack_generate'), d2 = e.find(x => x.n === 'travel_pack_download');
  ok('manual: generate from the board, download event', g2 && g2.p.planner_mode === 'manual' && g2.p.source_component === 'planner_board' && d2 && d2.p.delivery_method === 'download', JSON.stringify([g2, d2]));
  await ctx.close();

  // 3. error: the Planner keeps working, fallbacks offered
  mode = 'fail';
  ({ ctx, page, errors } = await open(1280, 'none'));
  await page.evaluate(() => [...document.querySelectorAll('#days .chip')][0].click()); await page.evaluate(() => document.getElementById('build').click()); await sleep(800);
  await page.evaluate(() => document.getElementById('pack').click()); await sleep(1500);
  const s3 = await page.evaluate(() => ({ cls: document.querySelector('#results .gl-pack-status').className, acts: [...document.querySelectorAll('#results .gl-pack-act')].map(a => a.textContent),
    direct: document.querySelector('#results a.gl-pack-act[target=_blank]') ? document.querySelector('#results a.gl-pack-act[target=_blank]').getAttribute('href') : '', btn: !document.getElementById('pack').disabled }));
  ok('error: message, retry, direct link, print fallback; button usable', /error/.test(s3.cls) && s3.acts.join('|') === 'ניסיון נוסף|פתיחת החוברת בלשונית חדשה|שמירה כ PDF מהדפדפן' && /^\/pack\//.test(s3.direct) && s3.btn, JSON.stringify(s3));
  e = await ev(page);
  ok('travel_pack_error fired', e.some(x => x.n === 'travel_pack_error' && x.p.generation_method === 'server' && x.p.duration_bucket), JSON.stringify(e.filter(x => /travel_pack/.test(x.n))));
  await page.evaluate(() => document.getElementById('again').click()); await sleep(300);
  ok('Planner still works after a failure (new version builds)', await page.evaluate(() => document.querySelectorAll('#days-out .day-card').length === 1), '');
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // 4. narrow phones: no horizontal overflow, button reachable
  mode = 'ok';
  for (const w of [390, 360]) {
    ({ ctx, page, errors } = await open(w, 'files'));
    await page.evaluate(() => [...document.querySelectorAll('#days .chip')][2].click()); await page.evaluate(() => document.getElementById('build').click()); await sleep(800);
    await page.evaluate(() => document.getElementById('pack').click()); await sleep(1300);
    const m = await page.evaluate(() => { const b = document.getElementById('pack').getBoundingClientRect(), s = document.querySelector('#results .gl-pack-status').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, vw: innerWidth, btn: [Math.round(b.left), Math.round(b.right)], status: [Math.round(s.left), Math.round(s.right)] }; });
    ok(w + 'px: no horizontal scroll, button and status inside the screen', m.sw <= m.vw && m.btn[0] >= 0 && m.btn[1] <= w && m.status[0] >= 0 && m.status[1] <= w, JSON.stringify(m));
    await page.screenshot({ path: path.join(require('os').tmpdir(), 'gl-pack-ui-' + w + '.png') });
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fail ? fail + ' FAILED' : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
