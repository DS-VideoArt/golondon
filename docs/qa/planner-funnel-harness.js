/*
  Planner funnel harness
  ======================
  Runs every Planner entry path in a fresh headless Chrome profile and records exactly which
  planner_open / planner_start / planner_complete events the page sends to gtag.

    NODE_PATH=<node_modules with puppeteer-core> node docs/qa/planner-funnel-harness.js [--json out.json] [--expect]

  The harness serves the site itself (clean URLs like Netlify: /planner -> planner.html, and the
  301 rules from _redirects such as /t/* and /fb), blocks every external request (Google Analytics
  never loads, so nothing reaches the real property), and reads events from the page's dataLayer.
  --expect checks the intended semantics (see docs/qa/PLANNER_FUNNEL.md) and exits 1 on any miss.
  docs/ is not served publicly (netlify.toml).
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const EXPECT = args.includes('--expect');
const FUNNEL = ['planner_open', 'planner_start', 'planner_complete'];

/* ---------- static server with Netlify-style clean URLs and redirects ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const REDIRECTS = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8').split('\n')
  .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  .map(l => l.split(/\s+/)).filter(p => p.length >= 3 && /^30[12]/.test(p[2]))
  .map(([from, to]) => ({ from, to }));
function redirectFor(p) {
  for (const r of REDIRECTS) {
    if (r.from.endsWith('/*')) {
      const base = r.from.slice(0, -1);
      if (p.startsWith(base)) return r.to.replace(':splat', p.slice(base.length));
    } else if (r.from === p) return r.to;
  }
  return null;
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const red = redirectFor(u.pathname);
  if (red && !/\.html$/.test(u.pathname)) { res.writeHead(301, { Location: red + (u.search && !red.includes('?') ? u.search : '') }); return res.end(); }
  let p = decodeURIComponent(u.pathname);
  if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p);
  if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

/* ---------- browser helpers ---------- */
let BASE, browser;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(ctx, log, errors) {
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', r => (r.url().startsWith(BASE) || r.url().startsWith('data:')) ? r.continue() : r.abort());
  page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 160)));
  await page.exposeFunction('__rec', s => log.push(JSON.parse(s)));
  await page.evaluateOnNewDocument(() => {
    const dl = window.dataLayer = window.dataLayer || [];
    const push = Array.prototype.push;
    dl.push = function () {
      for (const a of arguments) {
        if (a && a[0] === 'event') {
          try { window.__rec(JSON.stringify({ page: location.pathname + location.search.slice(0, 40), name: a[1], params: a[2] || {} })); } catch (e) {}
        }
      }
      return push.apply(this, arguments);
    };
  });
  return page;
}
async function plannerReady(page) {
  await page.waitForSelector('#days .chip', { timeout: 15000 });
  await sleep(900);
}
async function click(page, sel) {
  await page.waitForSelector(sel, { visible: true, timeout: 10000 });
  await page.$eval(sel, el => el.scrollIntoView({ block: 'center' }));
  await page.click(sel);
}
/* element-level click: fires the same listeners as a real tap, and is not blocked by
   overlays (install prompt, accessibility button) or collapsed sections */
/* seed saved places from a script-free URL on the same origin, so the tray script on the page
   cannot overwrite the seed while it starts; then wait until the pill is really showing */
async function seedTray(page) {
  await page.goto(BASE + '/favicon.ico');
  await page.evaluate(() => localStorage.setItem('golondon_tray_v1', JSON.stringify({ v: 1, ids: ['british-museum', 'national-gallery'] })));
  await page.goto(BASE + '/guide-attractions');
  await page.waitForSelector('a.gl-tray-pill.is-on', { timeout: 15000 });
}
async function clickNav(page, sel) {
  await page.waitForSelector(sel, { timeout: 10000 });
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.$eval(sel, el => el.click())]);
}

/* ---------- scenarios ---------- */
const SCENARIOS = [
  { id: 'direct', label: 'Direct /planner visit, no action', expect: { open: 1, start: 0, complete: 0, entry: 'direct' },
    run: async p => { await p.goto(BASE + '/planner'); await plannerReady(p); } },
  { id: 'reload', label: 'Direct visit, then reload twice', expect: { open: 1, start: 0, complete: 0 },
    run: async p => { await p.goto(BASE + '/planner'); await plannerReady(p); await p.reload(); await plannerReady(p); await p.reload(); await plannerReady(p); } },
  { id: 'home_link', label: 'Homepage hero CTA to Planner', expect: { open: 1, start: 0, complete: 0, entry: 'internal_link' },
    run: async p => { await p.goto(BASE + '/'); await sleep(500); await clickNav(p, 'a.btn-hero-main'); await plannerReady(p); } },
  { id: 'tray_pill', label: 'Attractions page: saved places, tray pill to Planner', expect: { open: 1, start: 0, complete: 0, entry: 'tray_pill', open_mode: 'manual', tab: 'manual' },
    run: async p => {
      await seedTray(p);
      await clickNav(p, 'a.gl-tray-pill.is-on'); await plannerReady(p);
    } },
  { id: 'tray_add_all', label: 'Tray pill, then "add all saved places" to day 1', expect: { open: 1, start: 1, complete: 1, entry: 'tray_pill', mode: 'manual', built_from: 'manual', tab: 'manual' },
    run: async p => {
      await seedTray(p);
      await clickNav(p, 'a.gl-tray-pill.is-on'); await plannerReady(p);
      await p.waitForSelector('#tray-all', { visible: true, timeout: 20000 }); await sleep(600); await click(p, '#tray-all'); await sleep(500);
    } },
  { id: 'area_preset', label: 'Area guide category preset (?day=&from=camden_exp_...)', expect: { open: 1, start: 0, complete: 0, entry: 'area_preset' },
    run: async p => { await p.goto(BASE + '/guide-areas-camden'); await sleep(500); await clickNav(p, 'a[href*="planner.html?day="]'); await plannerReady(p); await sleep(800); } },
  { id: 'route_preset', label: 'Ready route preset (?route=&rv=) from london-3-days', expect: { open: 1, start: 0, complete: 0, entry: 'route_preset' },
    run: async p => { await p.goto(BASE + '/london-3-days'); await sleep(500); await clickNav(p, 'a[href*="route="]'); await plannerReady(p); await sleep(800); } },
  { id: 'share', label: 'Shared trip short link /t/<codes>', expect: { open: 1, start: 0, complete: 0, entry: 'share' },
    run: async p => { await p.goto(BASE + '/t/AAAB.ACAD'); await plannerReady(p); await sleep(800); } },
  { id: 'nearby_link', label: 'Nearby mode link (?mode=nearby&zone=)', expect: { open: 1, start: 0, complete: 0, entry: 'nearby_link' },
    run: async p => { await p.goto(BASE + '/planner?mode=nearby&zone=westminster&from=westminster_nearby'); await plannerReady(p); await sleep(800); } },
  { id: 'nearby_filter', label: 'Nearby link, then tap a radius filter', expect: { open: 1, start: 1, complete: 0, entry: 'nearby_link' },
    run: async p => { await p.goto(BASE + '/planner?mode=nearby&zone=westminster&from=westminster_nearby'); await plannerReady(p); await sleep(800);
      await p.evaluate(() => { const b = document.querySelector('#nb-controls .nb-chip:not(.is-on)'); if (b) b.click(); }); await sleep(400); } },
  { id: 'preset_edit', label: 'Area preset, then add one more place', expect: { open: 1, start: 1, complete: 1, entry: 'area_preset', mode: 'manual', built_from: 'preset_edit' },
    run: async p => { await p.goto(BASE + '/guide-areas-camden'); await sleep(500); await clickNav(p, 'a[href*="planner.html?day="]'); await plannerReady(p); await sleep(900);
      await p.evaluate(() => { const b = [...document.querySelectorAll('#pal-list .cube-btn--add')].find(x => !x.closest('.cube').querySelector('.is-used')); if (b) b.click(); }); await sleep(400); } },
  { id: 'auto_choice_only', label: 'Auto: pick options, never build', expect: { open: 1, start: 1, complete: 0 },
    run: async p => { await p.goto(BASE + '/planner'); await plannerReady(p); await click(p, '#days .chip:nth-child(2)'); await click(p, '#interests .chip'); await sleep(300); } },
  { id: 'campaign', label: 'Social short link /fb (utm campaign)', expect: { open: 1, start: 0, complete: 0, entry: 'campaign' },
    run: async p => { await p.goto(BASE + '/fb'); await plannerReady(p); } },
  { id: 'tabs_only', label: 'Direct visit, switch tabs only', expect: { open: 1, start: 0, complete: 0 },
    run: async p => { await p.goto(BASE + '/planner'); await plannerReady(p); await click(p, '#tab-manual'); await sleep(300); await click(p, '#tab-auto'); await sleep(300); } },
  { id: 'auto_flow', label: 'Auto: pick days, build, build again, new version', expect: { open: 1, start: 1, complete: 1, mode: 'auto' },
    run: async p => {
      await p.goto(BASE + '/planner'); await plannerReady(p);
      await click(p, '#days .chip:nth-child(3)'); await sleep(200);
      await click(p, '#build'); await sleep(900);
      await click(p, '#build'); await sleep(900);
      await click(p, '#again'); await sleep(600);
    } },
  { id: 'manual_flow', label: 'Manual: open tab, add 3 places to day 1', expect: { open: 1, start: 1, complete: 1, mode: 'manual' },
    run: async p => {
      await p.goto(BASE + '/planner'); await plannerReady(p);
      await click(p, '#tab-manual'); await sleep(400);
      for (let i = 0; i < 3; i++) {
        await p.evaluate(i => { const b = document.querySelectorAll('#pal-list .cube-btn--add')[i]; if (b) b.click(); }, i);
        await sleep(300);
      }
    } },
  { id: 'resume', label: 'Returning visitor with a saved manual plan, no action', expect: { open: 1, start: 0, complete: 0, entry: 'direct', saved: true },
    run: async p => {
      await p.goto(BASE + '/about');
      await p.evaluate(() => localStorage.setItem('golondon_manual_v1', JSON.stringify({ v: 1, days: [['british-museum', 'national-gallery']], active: 0 })));
      await p.goto(BASE + '/planner'); await plannerReady(p);
    } },
];

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const results = [];
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;   /* ONLY=id1,id2 runs a subset */
  for (const sc of SCENARIOS.filter(x => !only || only.includes(x.id))) {
    const ctx = await browser.createBrowserContext();
    const log = [], errors = [];
    const page = await newPage(ctx, log, errors);
    let failed = '';
    let tab = '';
    try { await sc.run(page); await sleep(400);
      tab = await page.evaluate(() => { const m = document.getElementById('panel-manual'), a = document.getElementById('panel-auto');
        return m && a ? (!m.hidden ? 'manual' : (!a.hidden ? 'auto' : 'other')) : ''; }).catch(() => '');
    } catch (e) { failed = String(e.message || e).slice(0, 140); }
    await ctx.close();
    const ev = log.filter(e => FUNNEL.includes(e.name));
    const count = n => ev.filter(e => e.name === n).length;
    const first = n => (ev.find(e => e.name === n) || {}).params || {};
    const r = { id: sc.id, label: sc.label, open: count('planner_open'), start: count('planner_start'), complete: count('planner_complete'),
      open_page: (ev.find(e => e.name === 'planner_open') || {}).page || '', open_params: first('planner_open'), start_params: first('planner_start'),
      complete_params: first('planner_complete'), tab, other: [...new Set(log.filter(e => !FUNNEL.includes(e.name)).map(e => e.name))], errors, failed };
    if (EXPECT) {
      const x = sc.expect, miss = [];
      for (const k of ['open', 'start', 'complete']) if (r[k] !== x[k]) miss.push(`${k} ${r[k]} != ${x[k]}`);
      if (x.entry && r.open_params.planner_entry !== x.entry) miss.push(`planner_entry ${r.open_params.planner_entry} != ${x.entry}`);
      if (x.mode && r.complete_params.planner_mode !== x.mode) miss.push(`complete planner_mode ${r.complete_params.planner_mode} != ${x.mode}`);
      if (x.saved && r.open_params.has_saved_plan !== true) miss.push('has_saved_plan not true');
      if (x.open_mode && r.open_params.planner_mode !== x.open_mode) miss.push(`open planner_mode ${r.open_params.planner_mode} != ${x.open_mode}`);
      if (x.tab && r.tab !== x.tab) miss.push(`tab shown ${r.tab} != ${x.tab}`);
      if (x.built_from && r.complete_params.built_from !== x.built_from) miss.push(`complete built_from ${r.complete_params.built_from} != ${x.built_from}`);
      if (r.open && r.start && r.start_params.planner_session_id !== r.open_params.planner_session_id) miss.push('session id differs between open and start');
      r.expect_ok = miss.length === 0 && !failed; r.miss = miss;
    }
    results.push(r);
    const flag = EXPECT ? (r.expect_ok ? 'PASS ' : 'FAIL ') : '';
    console.log(`${flag}${sc.id.padEnd(13)} open ${r.open}  start ${r.start}  complete ${r.complete}` +
      (r.open ? `  | open on ${r.open_page.split('?')[0]}${r.open_params.planner_entry ? ' entry=' + r.open_params.planner_entry : ''}` : '') +
      (failed ? `  | RUN ERROR ${failed}` : '') + (EXPECT && !r.expect_ok ? `  | ${r.miss.join('; ')}` : ''));
  }
  await browser.close(); server.close();
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
  if (EXPECT) process.exit(results.every(r => r.expect_ok) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
