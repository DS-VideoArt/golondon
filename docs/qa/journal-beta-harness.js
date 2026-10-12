/*
  Kids Journal free Beta: Planner CTA, request page, real request function (browser)
  ==================================================================================
  Local only. Serves this checkout on 127.0.0.1, blocks every external request (no GA reaches Google), and routes
  /.netlify/functions/journal-beta-request to the real function (netlify/functions/journal-beta-request.mjs,
  handle()) backed by an in-memory store with an atomic onlyIfNew. Backend-only cases (concurrency, purge, the real
  @netlify/blobs client) are in journal-beta-backend-test.mjs.

    NODE_PATH=<node_modules with puppeteer-core> node docs/qa/journal-beta-harness.js
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const RC = require('../../route-code.js');
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8')).attractions;
const BY = {}; DATA.forEach(a => { BY[a.id] = a; });
const C = id => BY[id].code;
const OPEN = DATA.filter(a => !a.closed);
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const ENDPOINT = '/.netlify/functions/journal-beta-request';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

class MemoryStore {
  constructor() { this.m = new Map(); }
  async get(k, o) { if (!this.m.has(k)) return null; const v = this.m.get(k); return o && o.type === 'json' ? JSON.parse(v) : v; }
  async set(k, v, o) { if (o && o.onlyIfNew && this.m.has(k)) return { modified: false }; this.m.set(k, String(v)); return { modified: true }; }
  async delete(k) { this.m.delete(k); }
  async list(o) { return { blobs: [...this.m.keys()].filter(k => k.startsWith((o && o.prefix) || '')).map(key => ({ key })) }; }
  keys(p) { return [...this.m.keys()].filter(k => k.startsWith(p)); }
}

(async () => {
  const { handle } = await import(path.join(ROOT, 'netlify', 'functions', 'journal-beta-request.mjs'));
  const env = { store: new MemoryStore(), enabled: true, secret: 'harness-secret', loadPlaces: async () => DATA };
  const calls = [];
  const server = http.createServer(async (q, s) => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname === ENDPOINT) {
      const chunks = []; for await (const c of q) chunks.push(c);
      const body = Buffer.concat(chunks).toString('utf8');
      calls.push({ method: q.method, body });
      const r = await handle(new Request('http://127.0.0.1' + q.url, { method: q.method, body: q.method === 'POST' ? body : undefined }), env);
      s.writeHead(r.status, { 'Content-Type': 'application/json' }); return s.end(await r.text());
    }
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    let f = path.join(ROOT, p); if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const B = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });

  async function open(url, opts) {
    opts = opts || {};
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: opts.width || 1280, height: 900 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => { window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; }; });
    await page.setRequestInterception(true);
    page.on('request', r => (r.url().startsWith(B) || r.url().startsWith('data:')) ? r.continue() : r.abort());
    await page.goto(B + url, { waitUntil: 'networkidle2' }); await sleep(600);
    return { ctx, page, errors };
  }
  const events = (page, name) => page.evaluate(n => (window.dataLayer || []).filter(a => a[0] === 'event' && a[1] === n).map(a => a[2] || {}), name);
  const chip = (page, text) => page.evaluate(t => { const c = [...document.querySelectorAll('#who .chip, .chip')].find(x => x.textContent.includes(t)); if (c) c.click(); return !!c; }, text);
  const waCode = async (page, id) => {
    const before = await page.evaluate(() => window.__opened.length);
    await page.evaluate(i => document.getElementById(i).click(), id); await sleep(300);
    const url = decodeURIComponent(await page.evaluate(i => window.__opened[i] || '', before));
    const m = /\/t\/([A-Za-z0-9.]+)/.exec(url); return m ? m[1] : '';
  };
  const hashOf = href => { const o = {}; (href.split('#')[1] || '').split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); }); return o; };
  const ctaHref = (page, id) => page.evaluate(i => { const b = document.getElementById(i); return b && !b.hidden && b.querySelector('a') ? b.querySelector('a').href : ''; }, id);
  const fill = async (page, email, name) => {
    await page.type('#jb-email', email); if (name) await page.type('#jb-name', name);
    await page.click('#jb-ack'); await page.click('#jb-submit'); await sleep(600);
  };
  const page1 = (code, fam) => '/kids-journal-beta.html#r=' + code + '&f=' + (fam === false ? 0 : 1) + '&m=auto&e=planner_cta';

  /* ---------- Planner CTA ---------- */
  { const { ctx, page, errors } = await open('/planner.html');
    await chip(page, 'ילדים (5'); await page.evaluate(() => document.getElementById('build').click()); await sleep(800);
    ok(await page.evaluate(() => document.getElementById('jb-cta').hidden && document.getElementById('jb-cta').textContent === ''), 'Beta disabled (production default): no CTA, even for a family route');
    ok((await events(page, 'planner_complete')).length === 1 && (await events(page, 'journal_beta_start')).length === 0, 'disabled: planner_complete once, no journal_beta_start');
    ok(errors.length === 0, 'disabled: no page errors'); await ctx.close(); }
  { const { ctx, page } = await open('/planner.html?journal_beta=preview');
    await page.evaluate(() => document.getElementById('build').click()); await sleep(800);
    ok(!(await ctaHref(page, 'jb-cta')), 'adult-only route (default "מבוגרים בלבד"): no CTA');
    await chip(page, 'נוער'); await sleep(200);
    ok(!(await ctaHref(page, 'jb-cta')), 'teen-only route: no CTA (not a strict kids band)');
    await chip(page, 'ילדים (5'); await sleep(200);
    ok(!!(await ctaHref(page, 'jb-cta')), 'choosing a child under 12 shows the CTA at once, without rebuilding');
    await chip(page, 'מבוגרים בלבד'); await sleep(200);
    ok(!(await ctaHref(page, 'jb-cta')), 'back to adults only: CTA hidden again');
    await ctx.close(); }
  { const { ctx, page, errors } = await open('/planner.html?journal_beta=preview');
    await chip(page, 'תינוקות'); await page.evaluate(() => document.getElementById('build').click()); await sleep(800);
    const href = await ctaHref(page, 'jb-cta'), h = hashOf(href), code = await waCode(page, 'wa');
    ok(!!href && h.f === '1' && h.m === 'auto', 'family auto route: CTA shown, family flag 1');
    ok(h.r && h.r === code, 'family auto route: CTA code == WhatsApp /t/ code (' + h.r + ')');
    ok(!/[?&]r=/.test(href.split('#')[0]), 'route code travels after #');
    await page.evaluate(() => document.getElementById('again').click()); await sleep(500);
    ok(hashOf(await ctaHref(page, 'jb-cta')).r === await waCode(page, 'wa'), 'after "another version": CTA follows the visible route');
    await page.evaluate(() => { const a = document.querySelector('#jb-cta a'); a.addEventListener('click', e => e.preventDefault()); a.click(); a.click(); });
    const st = await events(page, 'journal_beta_start');
    ok(st.length === 1 && st[0].entry === 'planner_cta' && st[0].family_route === 1, 'journal_beta_start once from the CTA ' + JSON.stringify(st));
    ok((await events(page, 'planner_complete')).length === 1, 'planner_complete unchanged by the CTA');
    ok(errors.length === 0, 'family auto: no page errors'); await ctx.close(); }
  { const code = [C('big-ben') + C('westminster-abbey'), C('tate-modern') + C('chin-chin-labs')].join('.');
    /* "מי נוסע" נבחר בלשונית האוטומטית, ובאותו עמוד הקריאה מופיעה גם על הלוח הידני */
    const { ctx, page, errors } = await open('/planner.html?journal_beta=preview&p=' + code + '&from=share');
    ok(!(await ctaHref(page, 'm-jb-cta')), 'manual route before any child age is chosen: no CTA');
    await chip(page, 'ילדים (5'); await sleep(300);
    const href = await ctaHref(page, 'm-jb-cta'), wa = await waCode(page, 'm-wa');
    ok(!!href && hashOf(href).m === 'manual', 'family manual route: CTA shown on the board');
    ok(hashOf(href).r === code && wa === code, 'family manual route: CTA code == shared /t/ code == WhatsApp code, closed stop kept (' + hashOf(href).r + ')');
    ok(errors.length === 0, 'family manual: no page errors'); await ctx.close();
    const adult = await open('/planner.html?journal_beta=preview&p=' + code + '&from=share');
    ok(!(await ctaHref(adult.page, 'm-jb-cta')), 'adult manual route: no CTA'); await adult.ctx.close(); }

  /* ---------- strict validation on the page: nothing is sent ---------- */
  for (const [name, code] of [['unknown code', C('big-ben') + 'Zz'], ['truncated code', C('big-ben') + C('tate-modern').slice(0, 1)],
      ['malformed code', C('big-ben') + '..' + C('tate-modern')], ['8 days', OPEN.slice(0, 8).map(a => a.code).join('.')],
      ['13 stops in a day', OPEN.slice(0, 13).map(a => a.code).join('')], ['same place twice in a day', C('big-ben') + C('big-ben')]]) {
    const n0 = calls.filter(c => c.method === 'POST').length;
    const { ctx, page } = await open(page1(code));
    const st = await page.evaluate(() => ({ err: !document.getElementById('jb-route-error').hidden, txt: document.getElementById('jb-route-error-text').textContent,
      back: !!document.querySelector('#jb-route-error a[href="planner.html"]'), dis: document.getElementById('jb-submit').disabled, days: document.querySelectorAll('.jb-route-day').length }));
    await page.evaluate(() => document.getElementById('jb-form').requestSubmit()); await sleep(300);
    ok(st.err && /לא הצלחנו להכין את המסלול/.test(st.txt) && st.back && st.dis && st.days === 0, name + ': friendly Hebrew error, back to Planner, submit disabled, no partial route shown');
    ok(calls.filter(c => c.method === 'POST').length === n0, name + ': nothing sent');
    await ctx.close(); }
  { const { ctx, page } = await open(page1(C('big-ben') + C('tate-modern'), false));
    ok(await page.evaluate(() => !document.getElementById('jb-route-error').hidden && document.getElementById('jb-submit').disabled), 'adult route opened directly: refused on the page'); await ctx.close(); }

  /* ---------- real function: accept, optional name, closed stop, duplicate, honeypot ---------- */
  const good = [C('big-ben') + C('camden-market') + C('chin-chin-labs') + C('poppies-camden'), C('tate-modern')].join('.');
  { const { ctx, page, errors } = await open(page1(good));
    const st = await page.evaluate(() => ({ days: [...document.querySelectorAll('.jb-route-day')].map(e => e.textContent), struck: [...document.querySelectorAll('.jb-route-day s')].map(e => e.textContent) }));
    ok(st.days.length === 2 && st.struck.length === 1 && st.struck[0] === BY['chin-chin-labs'].name, 'route shown in order, closed stop kept and struck through');
    await fill(page, 'Parent@Example.com', 'נועה');
    const s = await page.evaluate(() => ({ ok: !document.getElementById('jb-success').hidden, back: document.getElementById('jb-back-route').href, txt: document.getElementById('jb-success-text').textContent }));
    ok(s.ok && /נכין את יומן הבטא/.test(s.txt), 'valid request accepted by the real function: success state');
    ok(s.back === RC.link(good), 'success: return link is the family /t/ itinerary (' + s.back + ')');
    const rec = JSON.parse(env.store.m.get(env.store.keys('requests/')[0]));
    ok(rec.route_code === good && rec.email === 'parent@example.com' && rec.first_name === 'נועה' && rec.family_route === true, 'stored: exact route code (closed stop included), normalized email, first name');
    const sub = await events(page, 'journal_beta_submit');
    ok(sub.length === 1 && sub[0].first_name_given === 1, 'journal_beta_submit once, after acceptance');
    const dl = await page.evaluate(() => JSON.stringify(window.dataLayer || []));
    ok(!/parent@|example\.com|נועה/.test(dl) && dl.indexOf(good) === -1 && dl.indexOf(rec.request_id) === -1, 'no email, first name, route code or request id in any GA4 event');
    ok(errors.length === 0, 'accept: no page errors'); await ctx.close(); }
  { const { ctx, page } = await open(page1(good));
    await fill(page, '  parent@EXAMPLE.com', '');
    ok(await page.evaluate(() => /כבר קיבלנו/.test(document.getElementById('jb-success-text').textContent)), 'duplicate (same normalized email + route): already-received state');
    ok(env.store.keys('slots/').length === 1, 'duplicate did not claim a second slot');
    ok((await events(page, 'journal_beta_submit')).length === 0, 'duplicate: no second journal_beta_submit'); await ctx.close(); }
  { const { ctx, page } = await open(page1(C('tower-of-london')));
    await fill(page, 'second@example.com', '');
    ok(await page.evaluate(() => !document.getElementById('jb-success').hidden) && JSON.parse(env.store.m.get(env.store.keys('requests/').find(k => JSON.parse(env.store.m.get(k)).email === 'second@example.com'))).first_name === null, 'child first name optional'); await ctx.close(); }
  { const before = env.store.m.size;
    const { ctx, page } = await open(page1(C('british-museum')));
    await page.evaluate(() => { document.getElementById('jb-website').value = 'http://spam.example'; });
    await fill(page, 'bot@example.com', '');
    ok(await page.evaluate(() => document.getElementById('jb-success').hidden && !document.getElementById('jb-error').hidden), 'honeypot filled: rejected, error shown, no success');
    ok(env.store.m.size === before, 'honeypot: nothing stored, no slot claimed');
    ok((await events(page, 'journal_beta_submit')).length === 0, 'honeypot: no journal_beta_submit'); await ctx.close(); }

  /* ---------- the cap: fill to 24, the page takes slot 25, the next distinct family is full ---------- */
  for (let i = env.store.keys('slots/').length + 1; i <= 24; i++) {
    await handle(new Request('http://x/', { method: 'POST', body: JSON.stringify({ route_code: C('big-ben'), family_route: true, planner_mode: 'auto', email: 'fill' + i + '@example.com', first_name: null, beta_ack: true, website: '' }) }), env);
  }
  ok(env.store.keys('slots/').length === 24, 'slots 1..24 accepted');
  /* family 26 opens the page while one slot is still free; family 25 takes it; then family 26 submits */
  const late = await open(page1(C('natural-history')));
  ok(await late.page.evaluate(() => !document.getElementById('jb-request').hidden), 'page opened at 24 of 25: form available');
  { const { ctx, page } = await open(page1(C('london-eye')));
    await fill(page, 'twentyfifth@example.com', '');
    ok(await page.evaluate(() => !document.getElementById('jb-success').hidden) && env.store.keys('slots/').length === 25, 'slot 25 accepted from the page'); await ctx.close(); }
  { const { ctx, page } = late;
    await fill(page, 'twentysixth@example.com', '');
    const st = await page.evaluate(() => ({ full: !document.getElementById('jb-full').hidden, form: document.getElementById('jb-request').hidden, txt: document.getElementById('jb-full').textContent, back: document.getElementById('jb-full-route').href }));
    ok(st.full && st.form && /ההרצה התמלאה/.test(st.txt), 'distinct request 26: full state, form removed');
    ok(st.back === RC.link(C('natural-history')), 'full state: return link to the family route');
    ok(env.store.keys('slots/').length === 25 && env.store.keys('requests/').length === 25, 'still exactly 25 slots and 25 stored requests');
    ok((await events(page, 'journal_beta_submit')).length === 0, 'full: no journal_beta_submit'); await ctx.close(); }
  { const { ctx, page } = await open(page1(C('natural-history')));
    ok(await page.evaluate(() => !document.getElementById('jb-full').hidden && document.getElementById('jb-request').hidden), 'full on load (status open:false): full state, no form');
    const v = await events(page, 'journal_beta_view'); ok(v.length === 1 && v[0].beta_state === 'full', 'journal_beta_view reports beta_state full'); await ctx.close(); }

  /* ---------- server switched off ---------- */
  { env.enabled = false;
    const { ctx, page } = await open(page1(C('big-ben')));
    ok(await page.evaluate(() => document.getElementById('jb-submit').disabled && /עדיין לא פתוחה/.test(document.getElementById('jb-draft').textContent)), 'JOURNAL_BETA_ENABLED off: "not open yet", submit disabled');
    await ctx.close(); env.enabled = true; }

  /* ---------- gallery, privacy, layout, site search ---------- */
  { const { ctx, page, errors } = await open(page1(C('big-ben')));
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } });
    await sleep(800);
    const g = await page.evaluate(() => ({ cap: document.querySelector('.jb-sample') && document.querySelector('.jb-sample').textContent,
      imgs: [...document.querySelectorAll('.jb-gallery img')].map(i => ({ ok: i.complete && i.naturalWidth > 0, alt: i.alt, src: i.currentSrc })),
      pdf: performance.getEntriesByType('resource').some(e => /\.pdf/.test(e.name)) }));
    ok(g.cap === 'דוגמה מיומן אישי שנוצר למסלול לדוגמה', 'gallery: approved explanatory line');
    ok(g.imgs.length === 6 && g.imgs.every(i => i.ok && i.alt.length > 20 && /\.webp$/.test(i.src)), 'gallery: 6 real images load as WebP, each with meaningful alt text');
    ok(!g.pdf, 'no PDF loaded by the page');
    ok(errors.length === 0, 'gallery: no page errors'); await ctx.close(); }
  const overflow = page => page.evaluate(() => ({ d: document.documentElement.scrollWidth - window.innerWidth,
    out: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); })
      .slice(0, 3).map(e => e.tagName + '.' + e.className) }));
  env.store = new MemoryStore();   /* layout is measured with the Beta open, so the form (and the honeypot) are on the page */
  for (const w of [1280, 390, 360]) {
    const { ctx, page, errors } = await open(page1(good), { width: w });
    ok(await page.evaluate(() => !document.getElementById('jb-request').hidden), 'layout @' + w + ': request form visible');
    const o = await overflow(page);
    ok(o.d <= 0 && o.out.length === 0 && errors.length === 0, 'page @' + w + ': no horizontal overflow, nothing outside the viewport ' + JSON.stringify(o));
    await ctx.close();
    const p2 = await open('/planner.html?journal_beta=preview', { width: w });
    await chip(p2.page, 'ילדים (5'); await p2.page.evaluate(() => document.getElementById('build').click()); await sleep(800);
    ok((await p2.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0 && !!(await ctaHref(p2.page, 'jb-cta')), 'planner CTA @' + w + ': visible, no overflow');
    await p2.ctx.close(); }
  { const priv = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
    const sec = priv.slice(priv.indexOf('id="journal-beta"'), priv.indexOf('<h2>שירותים חיצוניים'));
    ok(/לשלוח לכם את היומן/.test(sec) && /שם הפרטי משמש רק/.test(sec) && /זמני/.test(sec) && /7 ימים/.test(sec) && /לא רושמת אתכם לשום רשימת דיוור/.test(sec), 'privacy: Beta paragraph (delivery, first name, temporary, 7 days, no marketing)');
    const idx = fs.readFileSync(path.join(ROOT, 'search-index.json'), 'utf8'), sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'), pg = fs.readFileSync(path.join(ROOT, 'kids-journal-beta.html'), 'utf8');
    ok(!/kids-journal-beta|יומן המסע לילדים|יומן מסע לילדים/.test(idx) && !/kids-journal-beta/.test(sm) && /noindex, nofollow/.test(pg), 'draft stays out of site search and sitemap, noindex');
    const links = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'kids-journal-beta.html' && f !== 'planner.html').filter(f => /kids-journal-beta/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    ok(links.length === 0, 'no page links to the draft (only the gated Planner CTA) ' + links.join(',')); }

  await browser.close(); server.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log(fail ? 'FAILED' : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
