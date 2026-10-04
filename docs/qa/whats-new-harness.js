/*
  What's New harness
  ==================
  Checks the homepage "What's New" block against the freshness rules, in a real browser with the
  clock moved to each scenario date, and compares the cards the browser picks with what
  build_whats_new.py --report says for the same date (same rules on both sides).

    NODE_PATH=<node_modules with puppeteer-core> node docs/qa/whats-new-harness.js [--dates 2026-10-04,2026-11-30]

  Also checks: the static HTML of the block is hidden and has no month name or date outside the
  inert <template>; with valid items the block shows, whats_new_view fires exactly once when it
  scrolls into view and a card click fires one whats_new_click with the guide as destination_url;
  with no valid item the block stays hidden (hidden_fallback) and sends nothing; the block never
  contains month-guide links, so it cannot duplicate the homepage month section.
  Serves the site locally, blocks every external request. docs/ is not public.
*/
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(__dirname, '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const DATES = args.includes('--dates') ? args[args.indexOf('--dates') + 1].split(',')
  : ['2026-10-04', '2026-10-31', '2026-11-01', '2026-11-06', '2026-11-13', '2026-11-30', '2027-01-01', '2027-01-04', '2027-12-20'];
const MONTHS = /ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר/;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p); if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

function pythonReport(date) {
  const out = execFileSync('python3', [path.join(ROOT, 'build_whats_new.py'), '--report', date], { encoding: 'utf8' });
  if (/מוסתר, אין אייטם תקף/.test(out)) return [];
  return [...out.matchAll(/^\s+(news|upcoming_event)\s+(\S+)/gm)].map(m => m[2]);
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const results = []; let fail = 0;
  const raw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const block = raw.split('<!-- WHATS-NEW:START -->')[1].split('<!-- WHATS-NEW:END -->')[0];
  const visible = block.replace(/<template[\s\S]*?<\/template>/, '').replace(/<style[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ');
  const rawOk = !MONTHS.test(visible) && !/\d{4}-\d{2}-\d{2}/.test(block.replace(/<template[\s\S]*?<\/template>/, ''))
    && /<section class="whats-new" id="whats-new"[^>]*\shidden[\s>]/.test(block);
  console.log(`${rawOk ? 'PASS' : 'FAIL'} raw HTML: block hidden by default, no month name or date outside the template`); if (!rawOk) fail++;

  for (const date of DATES) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true); page.on('request', r => r.url().startsWith(BASE) ? r.continue() : r.abort());
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const events = []; await page.exposeFunction('__rec', s => events.push(JSON.parse(s)));
    const t = new Date(date + 'T12:00:00').getTime();
    await page.evaluateOnNewDocument(t => {
      const R = Date; window.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } };
      const dl = window.dataLayer = window.dataLayer || []; const push = Array.prototype.push;
      dl.push = function () { for (const a of arguments) if (a && a[0] === 'event') try { window.__rec(JSON.stringify({ name: a[1], params: a[2] || {} })); } catch (e) {} return push.apply(this, arguments); };
    }, t);
    await page.goto(BASE + '/', { waitUntil: 'load' }); await sleep(700);
    const viewBefore = events.filter(e => e.name === 'whats_new_view').length;
    const state = await page.evaluate(() => {
      const s = document.getElementById('whats-new');
      return { mode: s.getAttribute('data-wn-mode'), hidden: s.hidden || getComputedStyle(s).display === 'none', height: s.offsetHeight,
        cards: [...s.querySelectorAll('[data-wn-grid] .wnc')].map(c => ({ href: c.getAttribute('href'), title: c.dataset.wnTitle, when: c.querySelector('time').textContent.trim(), go: c.querySelector('.wnc-go').textContent.trim() })),
        monthLinks: [...s.querySelectorAll('a')].filter(a => /london-(january|february|march|april|may|june|july|august|september|october|november|december|by-month)/.test(a.getAttribute('href') || '')).length,
        monthSections: document.querySelectorAll('[data-now="cur"]').length,
        allLink: !!s.querySelector('.wnc-all') && getComputedStyle(s).display !== 'none' };
    });
    // scroll the block into view twice; the view event must fire once
    await page.$eval('#whats-new', el => el.scrollIntoView({ block: 'center' })); await sleep(900);
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
    await page.$eval('#whats-new', el => el.scrollIntoView({ block: 'center' })); await sleep(900);
    const views = events.filter(e => e.name === 'whats_new_view');
    // click the first card (stay on the page) and record the analytics event
    const clickedHref = state.cards.length ? await page.evaluate(() => { const a = document.querySelector('#whats-new [data-wn-grid] a'); a.addEventListener('click', e => e.preventDefault(), { once: true }); a.click(); return a.getAttribute('href'); }) : null;
    await sleep(300);
    const clicks = events.filter(e => ['whats_new_click', 'month_select', 'month_hub_open'].includes(e.name));
    await ctx.close();

    const expectIds = pythonReport(date);
    const titles = JSON.parse(fs.readFileSync(path.join(ROOT, 'whats-new.json'), 'utf8')).items.reduce((m, i) => (m[i.id] = i.title, m), {});
    const expectTitles = expectIds.map(id => titles[id]);
    const gotTitles = state.cards.map(c => c.title);
    const checks = [];
    const ok = (name, cond, detail) => { checks.push({ name, ok: !!cond, detail }); if (!cond) fail++; };
    ok('browser picks the same cards as the builder', JSON.stringify(expectTitles) === JSON.stringify(gotTitles), JSON.stringify({ expectTitles, gotTitles }));
    ok('mode matches', state.mode === (expectIds.length ? 'fresh_items' : 'hidden_fallback'), state.mode);
    ok('no month links inside What\'s New, one canonical month section', state.monthLinks === 0 && state.monthSections === 1, JSON.stringify({ monthLinks: state.monthLinks, monthSections: state.monthSections }));
    ok('no view before the block is on screen', viewBefore === 0, viewBefore);
    if (state.mode === 'fresh_items') {
      ok('block visible', !state.hidden, state.hidden);
      ok('whats_new_view fired exactly once', views.length === 1, JSON.stringify(views.map(v => v.params)));
      ok('view params', views[0] && views[0].params.items_shown === state.cards.length && views[0].params.display_mode === 'fresh_items', JSON.stringify(views[0] && views[0].params));
      ok('one whats_new_click with the guide as destination', clicks.length === 1 && clicks[0].name === 'whats_new_click' && clicks[0].params.destination_url === clickedHref, JSON.stringify(clicks));
      ok('cards lead to guides with specific labels', state.cards.every(c => /^guide-|^london-|\.html$/.test(c.href) && !/^לפרטים/.test(c.go)), JSON.stringify(state.cards.map(c => c.href + ' | ' + c.go)));
      ok('archive link shown', state.allLink, state.allLink);
    } else {
      ok('block hidden, no gap', state.hidden && state.height === 0, JSON.stringify({ hidden: state.hidden, height: state.height }));
      ok('no whats_new_view while hidden', views.length === 0, JSON.stringify(views));
      ok('no click events from a hidden block', clicks.length === 0, JSON.stringify(clicks));
    }
    ok('no page errors', errors.length === 0, JSON.stringify(errors));
    results.push({ date, state, views: views.map(v => v.params), clicks, checks });
    console.log(`\n${date}: ${state.mode}, ${state.cards.length} cards ${checks.every(c => c.ok) ? 'PASS' : 'FAIL'}`);
    state.cards.forEach(c => console.log(`   ${c.when.padEnd(34)} ${c.title}  ->  ${c.href} [${c.go}]`));
    if (state.hidden) console.log('   block hidden (hidden_fallback)');
    checks.filter(c => !c.ok).forEach(c => console.log(`   FAIL ${c.name}: ${c.detail}`));
  }
  await browser.close(); server.close();
  if (args.includes('--json')) fs.writeFileSync(args[args.indexOf('--json') + 1], JSON.stringify(results, null, 1));
  console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILURES'}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
