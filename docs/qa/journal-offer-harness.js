/*
  Kids Journal demand validation: offer page, sample download, interest form, placements (browser)
  ================================================================================================
  Local only. Serves this checkout on 127.0.0.1, blocks every external request (no GA reaches Google), routes
  /.netlify/functions/journal-interest to the real function (handle()) with an in-memory store. Any other function path
  answers 404 and is recorded (there is no Beta on this branch). Reads GA events from the page's dataLayer.
  Proves: desktop and mobile layout, Hebrew and RTL, accessibility basics, privacy of the form, the sample download,
  the four events without duplicates, no order, no payment, no worker call, no request to any other function.

    NODE_PATH=<node_modules with puppeteer-core> node docs/qa/journal-offer-harness.js
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(__dirname, '..', '..');
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf' };
const ENDPOINT = '/.netlify/functions/journal-interest';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

class MemoryStore {
  constructor() { this.m = new Map(); }
  async get(k, o) { if (!this.m.has(k)) return null; const v = this.m.get(k); return o && o.type === 'json' ? JSON.parse(v) : v; }
  async set(k, v, o) { if (o && o.onlyIfNew && this.m.has(k)) return { modified: false }; this.m.set(k, String(v)); return { modified: true, etag: '"1"' }; }
  async delete(k) { this.m.delete(k); }
  async list(o) { return { blobs: [...this.m.keys()].filter(k => k.startsWith((o && o.prefix) || '')).map(key => ({ key })) }; }
}

(async () => {
  const { handle } = await import(path.join(ROOT, 'netlify', 'functions', 'journal-interest.mjs'));
  const env = { store: new MemoryStore(), enabled: true };
  const calls = [], others = [];
  const server = http.createServer(async (q, s) => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname === ENDPOINT) {
      const chunks = []; for await (const c of q) chunks.push(c);
      const body = Buffer.concat(chunks).toString('utf8');
      calls.push({ method: q.method, body });
      const r = await handle(new Request('http://127.0.0.1' + q.url, { method: q.method, body: q.method === 'POST' ? body : undefined }), env);
      s.writeHead(r.status, { 'Content-Type': 'application/json' }); return s.end(await r.text());
    }
    if (u.pathname.startsWith('/.netlify/')) { others.push(u.pathname); s.writeHead(404); return s.end(); }
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    let f = path.join(ROOT, p); if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream', 'Content-Length': fs.statSync(f).size }); fs.createReadStream(f).pipe(s);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const B = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  const blocked = [];

  async function open(url, opts) {
    opts = opts || {};
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: opts.width || 1280, height: opts.height || 900, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', r => { requests.push(r.url()); if (r.url().startsWith(B) || r.url().startsWith('data:')) r.continue(); else { blocked.push(r.url()); r.abort(); } });
    await page.goto(B + url, { waitUntil: 'networkidle2' }); await sleep(500);
    return { ctx, page, errors, requests };
  }
  const events = (page, name) => page.evaluate(n => (window.dataLayer || []).filter(a => a[0] === 'event' && a[1] === n).map(a => a[2] || {}), name);
  const allEvents = page => page.evaluate(() => (window.dataLayer || []).filter(a => a[0] === 'event').map(a => a[1]));
  const chip = (page, text) => page.evaluate(t => { const c = [...document.querySelectorAll('#who .chip, .chip')].find(x => x.textContent.includes(t)); if (c) c.click(); return !!c; }, text);
  const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.hidden && e.offsetParent !== null; }, id);
  const fill = async (page, o) => {
    await page.type('#jo-email', o.email);
    if (o.month) await page.select('#jo-month', o.month);
    if (o.age) await page.select('#jo-age', String(o.age));
    if (o.willing) await page.click('input[name="willing"][value="' + o.willing + '"]');
    if (o.consent !== false) await page.click('#jo-consent');
    await page.click('#jo-submit'); await sleep(600);
  };

  /* ---------- offer page: content, privacy, layout ---------- */
  { const { ctx, page, errors, requests } = await open('/kids-journal-offer.html?e=guide');
    const d = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title, h1: document.querySelector('h1').textContent.trim(),
      h1s: document.querySelectorAll('h1').length, robots: (document.querySelector('meta[name=robots]') || {}).content, price: document.getElementById('jo-price').textContent,
      notice: document.querySelector('.jo-notice').textContent, sample: document.getElementById('jo-sample').getAttribute('href'), dl: document.getElementById('jo-sample').getAttribute('download'),
      imgs: [...document.querySelectorAll('main img')].map(i => i.alt), form: document.getElementById('jo-form').hidden, closed: document.getElementById('jo-closed').hidden,
      labels: [...document.querySelectorAll('#jo-form input:not([type=radio]):not([type=checkbox]), #jo-form select')].every(i => document.querySelector('label[for="' + i.id + '"]')),
      radios: !!document.querySelector('fieldset legend') && [...document.querySelectorAll('input[type=radio]')].every(r => r.closest('label')), alert: document.getElementById('jo-error').getAttribute('role'),
      links: [...document.querySelectorAll('a')].every(a => a.textContent.trim() || a.getAttribute('aria-label')), buttons: [...document.querySelectorAll('button')].every(b => b.textContent.trim() || b.getAttribute('aria-label')),
      overflow: document.documentElement.scrollWidth <= window.innerWidth, back: document.getElementById('jo-back').getAttribute('href') }));
    ok(d.lang === 'he' && d.dir === 'rtl' && d.h1s === 1 && d.h1 === 'המסלול שלכם בלונדון. ההרפתקה שלהם.', 'offer: Hebrew, RTL, one h1 with the approved headline');
    ok(/noindex/.test(d.robots), 'offer: noindex');
    ok(/34 ₪/.test(d.price) && /מחיר מתוכנן/.test(d.price), 'offer: planned price 34 ₪');
    ok(/עדיין לא זמינה לרכישה/.test(d.notice) && /אין הזמנה ואין תשלום/.test(d.notice) && /לא מתחייבים למועד השקה או לאספקה/.test(d.notice), 'offer: not for sale, no order, no payment, no launch or delivery promise');
    ok(d.sample === 'samples/kids-journal-sample-big-ben.pdf' && d.dl === 'golondon-kids-journal-sample.pdf', 'offer: sample link with a download name');
    ok(d.imgs.length === 3 && d.imgs.every(a => a && a.length > 20), 'offer: three sample images with descriptive alt text');
    ok(d.form === false && d.closed === true, 'offer: the form is shown only after the server answered enabled');
    ok(d.labels && d.radios && d.alert === 'alert' && d.links && d.buttons, 'a11y: every field has a label, radios in a fieldset with a legend, error is an alert, links and buttons named');
    ok(d.overflow, 'offer desktop: no horizontal overflow');
    ok(d.back === 'guide-kids.html', 'offer from a guide: the back link goes to the kids guide');
    const v = await events(page, 'journal_offer_view');
    ok(v.length === 1 && v[0].entry === 'guide' && !/@|email/.test(JSON.stringify(v)), 'event: journal_offer_view once per load, entry = guide, no personal data');
    ok((await allEvents(page)).filter(n => n.startsWith('journal_')).length === 1, 'event: no other journal event on load');
    ok(errors.length === 0, 'offer: no page errors');
    ok(!requests.some(u => /journal-beta-request|journal-worker|dispatch|github|stripe|paypal/.test(u)), 'offer: no request to the Beta function, the worker, GitHub or a payment provider');
    /* the sample file really downloads */
    const r = await page.evaluate(async () => { const x = await fetch('samples/kids-journal-sample-big-ben.pdf'); const b = await x.arrayBuffer(); return { status: x.status, type: x.headers.get('content-type'), bytes: b.byteLength, head: String.fromCharCode(...new Uint8Array(b.slice(0, 5))) }; });
    ok(r.status === 200 && r.type === 'application/pdf' && r.bytes > 1e6 && r.head === '%PDF-', 'sample: served as application/pdf, ' + (r.bytes / 1e6).toFixed(1) + ' MB, starts with %PDF');
    /* sample download event: once per session even with two clicks and two buttons */
    await page.evaluate(() => { for (const id of ['jo-sample', 'jo-sample-top']) { const a = document.getElementById(id); a.addEventListener('click', e => e.preventDefault()); a.click(); a.click(); } });
    await sleep(200);
    ok((await events(page, 'journal_sample_download')).length === 1 && (await events(page, 'journal_sample_download'))[0].entry === 'guide', 'event: journal_sample_download once per session (four clicks on two buttons)');
    await ctx.close(); }
  { const { ctx, page } = await open('/kids-journal-offer.html?e=hacker&x=1');
    ok((await events(page, 'journal_offer_view'))[0].entry === 'direct' && await page.evaluate(() => document.getElementById('jo-back').getAttribute('href') === 'guide-kids.html'), 'offer: an unknown entry is reported as direct');
    await ctx.close(); }
  { const { ctx, page } = await open('/kids-journal-offer.html?e=planner');
    ok((await events(page, 'journal_offer_view'))[0].entry === 'planner' && await page.evaluate(() => document.getElementById('jo-back').getAttribute('href') === 'planner.html'), 'offer from the planner: entry planner, back to the planner');
    await ctx.close(); }
  { const { ctx, page } = await open('/kids-journal-offer.html', { width: 375, height: 740, mobile: true });
    const d = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth <= window.innerWidth, btn: document.getElementById('jo-sample').getBoundingClientRect().width, h1: getComputedStyle(document.querySelector('h1')).fontSize,
      formVisible: !document.getElementById('jo-form').hidden, radiosInRow: [...document.querySelectorAll('.jo-radio')].every(r => r.getBoundingClientRect().right <= window.innerWidth) }));
    ok(d.overflow && d.btn > 250 && d.formVisible && d.radiosInRow, 'offer mobile (375px): no horizontal overflow, full-width button, form and radios fit');
    await ctx.close(); }

  /* ---------- interest form ---------- */
  { const { ctx, page, errors } = await open('/kids-journal-offer.html?e=winter');
    await page.click('#jo-submit'); await sleep(200);
    ok(await page.evaluate(() => !document.getElementById('jo-error').hidden && /המייל/.test(document.getElementById('jo-error').textContent)) && calls.filter(c => c.method === 'POST').length === 0, 'form: empty submit shows a Hebrew error, nothing sent');
    await page.type('#jo-email', 'parent@example.com'); await page.click('#jo-submit'); await sleep(200);
    ok(await page.evaluate(() => /כן, אולי או לא/.test(document.getElementById('jo-error').textContent)), 'form: missing answer -> Hebrew error');
    await page.click('input[name="willing"][value="maybe"]'); await page.click('#jo-submit'); await sleep(200);
    ok(await page.evaluate(() => /עדכון חד-פעמי/.test(document.getElementById('jo-error').textContent)) && calls.filter(c => c.method === 'POST').length === 0, 'form: consent required before anything is sent');
    await page.select('#jo-month', '2026-12'); await page.select('#jo-age', '8'); await page.click('#jo-consent'); await page.click('#jo-submit'); await sleep(700);
    const posts = calls.filter(c => c.method === 'POST');
    const body = JSON.parse(posts[0].body);
    ok(posts.length === 1 && Object.keys(body).sort().join() === 'child_age,consent,email,trip_month,website,willing' && body.email === 'parent@example.com' && body.willing === 'maybe' && body.trip_month === '2026-12' && body.child_age === 8 && body.consent === true && body.website === '', 'form: one POST with exactly the six fields');
    ok(await visible(page, 'jo-success') && !(await visible(page, 'jo-form')), 'form: success card shown, form hidden');
    const e = await events(page, 'journal_interest_submit');
    ok(e.length === 1 && e[0].entry === 'winter' && e[0].willing === 'maybe' && e[0].has_month === 1 && e[0].has_age === 1 && !/@|example|2026-12|\b8\b/.test(JSON.stringify(e)), 'event: journal_interest_submit once, willing = maybe, no email, month or age value');
    ok(env.store.m.size === 1 && !/name|route/.test([...env.store.m.values()].join()), 'store: one interest record, no name or route');
    ok(errors.length === 0, 'form: no page errors');
    await ctx.close(); }
  { const { ctx, page } = await open('/kids-journal-offer.html');
    await fill(page, { email: 'PARENT@example.com', willing: 'yes' });
    ok(await visible(page, 'jo-success') && await page.evaluate(() => /כבר רשום/.test(document.getElementById('jo-success-text').textContent)), 'duplicate: same email -> "already registered" message');
    ok((await events(page, 'journal_interest_submit')).length === 0 && env.store.m.size === 1, 'duplicate: no event, no second record');
    await ctx.close(); }
  { const { ctx, page } = await open('/kids-journal-offer.html');
    await page.evaluate(() => { document.getElementById('jo-website').value = 'http://spam'; });
    await fill(page, { email: 'bot@example.com', willing: 'yes' });
    ok(env.store.m.size === 1 && (await events(page, 'journal_interest_submit')).length === 0 && await page.evaluate(() => !document.getElementById('jo-error').hidden), 'honeypot: filled hidden field -> rejected, nothing stored, no event');
    await ctx.close(); }
  { const { ctx, page } = await open('/kids-journal-offer.html');
    await fill(page, { email: 'no@example.com', willing: 'no', consent: true });
    ok((await events(page, 'journal_interest_submit'))[0].willing === 'no' && env.store.m.size === 2, 'answer "no" is recorded and reported as willing = no (interest is never reported as a purchase)');
    ok(!(await allEvents(page)).some(n => /purchase|checkout|add_to_cart|begin_checkout|order/.test(n)), 'events: no e-commerce event names');
    await ctx.close(); }
  { env.enabled = false;
    const { ctx, page } = await open('/kids-journal-offer.html');
    ok(!(await visible(page, 'jo-form')) && await visible(page, 'jo-closed') && await page.evaluate(() => /עדיין לא פתוח/.test(document.getElementById('jo-closed').textContent)), 'switch off: form hidden, Hebrew "not open yet" text');
    const st = await page.evaluate(async () => (await fetch('/.netlify/functions/journal-interest', { method: 'POST', body: JSON.stringify({ email: 'x@example.com', willing: 'yes', consent: true, website: '' }) })).status);
    ok(st === 503 && env.store.m.size === 2, 'switch off: a direct POST is refused (503), nothing written');
    ok((await events(page, 'journal_offer_view')).length === 1 && await page.evaluate(() => document.getElementById('jo-sample').getAttribute('href').endsWith('.pdf')), 'switch off: the offer and the sample still work');
    await ctx.close(); env.enabled = true; }

  /* ---------- placements ---------- */
  for (const [url, entry] of [['/guide-kids.html', 'guide'], ['/guide-kids-museums.html', 'guide'], ['/guide-stay-family.html', 'guide'], ['/guide-winter-kids.html', 'winter'], ['/london-december.html', 'winter'], ['/guide-winter.html', 'winter']]) {
    const { ctx, page, errors } = await open(url);
    const d = await page.evaluate(() => { const b = document.querySelector('[data-journal-offer]'); const a = b && b.querySelector('a'); return { n: document.querySelectorAll('[data-journal-offer]').length, hidden: !b || b.hidden, href: a && a.getAttribute('href'), text: b && b.textContent, overflow: document.documentElement.scrollWidth <= window.innerWidth }; });
    ok(d.n === 1 && !d.hidden && d.href === 'kids-journal-offer.html?e=' + entry && /המסלול שלכם בלונדון\. ההרפתקה שלהם\./.test(d.text) && /בקרוב/.test(d.text), 'placement ' + url + ': one card, link to the offer with entry ' + entry);
    ok(d.overflow && errors.length === 0, 'placement ' + url + ': no overflow, no page errors');
    ok((await allEvents(page)).filter(n => n.startsWith('journal_')).length === 0, 'placement ' + url + ': rendering the card sends no event');
    await page.evaluate(() => { const a = document.querySelector('[data-journal-offer] a'); a.addEventListener('click', e => e.preventDefault()); a.click(); a.click(); });
    const c = await events(page, 'journal_offer_click');
    ok(c.length === 1 && c[0].entry === entry && c[0].placement === url.replace(/^\/|\.html$/g, ''), 'placement ' + url + ': journal_offer_click once per session with entry and placement');
    await ctx.close(); }
  { const { ctx, page } = await open('/guide-kids.html', { width: 375, height: 740, mobile: true });
    ok(await page.evaluate(() => { const b = document.querySelector('[data-journal-offer]'); const r = b.getBoundingClientRect(); return r.width > 300 && r.right <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth; }), 'placement mobile: the card fits the viewport');
    await ctx.close(); }
  { const { ctx, page } = await open('/index.html');
    ok(await page.evaluate(() => document.querySelectorAll('[data-journal-offer], .jo-card-box').length === 0 && !document.querySelector('script[src^="journal-offer-card"]')), 'home page: no offer card and no offer script');
    await ctx.close(); }

  /* ---------- planner: after a family itinerary ---------- */
  { const { ctx, page, errors } = await open('/planner.html');
    await page.evaluate(() => document.getElementById('build').click()); await sleep(900);
    ok(!(await visible(page, 'jo-cta')), 'planner: adult-only itinerary -> no offer');
    await chip(page, 'ילדים (5'); await sleep(400);
    const d = await page.evaluate(() => { const b = document.getElementById('jo-cta'); const a = b.querySelector('a'); return { shown: !b.hidden && b.offsetParent !== null, href: a && a.getAttribute('href'), beta: !document.getElementById('jb-cta') }; });
    ok(d.shown && d.href === 'kids-journal-offer.html?e=planner' && d.beta, 'planner: a child under 12 shows the offer after the route; no Beta element exists on this branch');
    ok((await events(page, 'planner_complete')).length === 1 && (await allEvents(page)).filter(n => n.startsWith('journal_')).length === 0, 'planner: planner_complete once, no journal event until a click');
    await chip(page, 'מבוגרים בלבד'); await sleep(300);
    ok(!(await visible(page, 'jo-cta')), 'planner: back to adults only -> offer hidden');
    await chip(page, 'ילדים (5'); await sleep(300);
    await page.evaluate(() => { const a = document.querySelector('#jo-cta a'); a.addEventListener('click', e => e.preventDefault()); a.click(); a.click(); });
    const c = await events(page, 'journal_offer_click');
    ok(c.length === 1 && c[0].entry === 'planner' && c[0].placement === 'planner', 'planner: journal_offer_click once with entry planner');
    ok(errors.length === 0, 'planner: no page errors');
    await ctx.close(); }
  { const { ctx, page } = await open('/planner.html');
    await chip(page, 'ילדים (5'); await page.evaluate(() => document.getElementById('build').click()); await sleep(900);
    await page.evaluate(() => document.getElementById('again').click()); await sleep(600);
    ok(await visible(page, 'jo-cta') && (await events(page, 'planner_complete')).length === 1, 'planner: "another version" keeps the offer and still counts one completion');
    ok(!(await page.evaluate(() => document.documentElement.innerHTML)).includes('kids-journal-beta'), 'planner: no link to a Beta page on this branch');
    await ctx.close(); }
  { const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8')).attractions; const C = id => DATA.find(a => a.id === id).code;
    const code = [C('big-ben') + C('westminster-abbey'), C('tate-modern')].join('.');
    const { ctx, page } = await open('/planner.html?p=' + code + '&from=share');
    ok(!(await visible(page, 'm-jo-cta')), 'manual board: no offer before a child age is chosen');
    await chip(page, 'ילדים (5'); await sleep(400);
    ok(await visible(page, 'm-jo-cta') && await page.evaluate(() => document.querySelector('#m-jo-cta a').getAttribute('href') === 'kids-journal-offer.html?e=planner'), 'manual board: family selection shows the offer');
    await ctx.close(); }

  /* ---------- isolation ---------- */
  ok(others.length === 0, 'no request reached any other function (' + others.join(', ') + ')');
  ok(!fs.existsSync(path.join(ROOT, 'kids-journal-beta.html')) && !fs.existsSync(path.join(ROOT, 'netlify', 'journal-lib')), 'branch: no Beta page and no journal library');
  ok(!blocked.some(u => /github|amazonaws|stripe|paypal/.test(u)), 'no attempt to reach GitHub, AWS or a payment provider');
  ok(calls.every(c => !/route_code|first_name|delivery|token/.test(c.body)), 'the interest function never receives a route, a name or a token');

  await browser.close(); server.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log(fail ? 'FAILED' : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
