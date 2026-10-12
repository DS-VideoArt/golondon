/*
  Kids Journal free Beta: Planner CTA and request page (draft branch)
  ===================================================================
  Local only: serves this checkout on 127.0.0.1 and blocks every external request (no GA, no fonts needed).
  The request endpoint does not exist yet (docs/journal-beta/BETA_PLAN.md), so the harness answers it with
  mocked responses where a case needs one, and checks the honest draft notice where it does not.

    NODE_PATH=<node_modules with puppeteer-core> node docs/qa/journal-beta-harness.js
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const RC = require('../../route-code.js');
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'planner-data.json'), 'utf8')).attractions;
const BY = {}; DATA.forEach(a => { BY[a.id] = a; });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const ENDPOINT = '/.netlify/functions/journal-beta-request';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

(async () => {
  const server = http.createServer((q, s) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    let f = path.join(ROOT, p); if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const B = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });

  /* mock: null = real local server (404 for the endpoint); otherwise { get, post } responses */
  async function open(url, opts) {
    opts = opts || {};
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: opts.width || 1280, height: 900 });
    const errors = [], posts = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => {
      window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; };
    });
    await page.setRequestInterception(true);
    page.on('request', r => {
      const u = r.url();
      if (u.startsWith(B + ENDPOINT) && opts.mock) {
        if (r.method() === 'POST') { posts.push(r.postData()); const m = opts.mock.post || { status: 404, body: '' };
          return r.respond({ status: m.status, contentType: 'application/json', body: JSON.stringify(m.body || {}) }); }
        const g = opts.mock.get || { status: 404, body: '' };
        return r.respond({ status: g.status, contentType: 'application/json', body: JSON.stringify(g.body || {}) });
      }
      if (u.startsWith(B + ENDPOINT) && r.method() === 'POST') posts.push(r.postData());
      return (u.startsWith(B) || u.startsWith('data:')) ? r.continue() : r.abort();
    });
    await page.goto(B + url, { waitUntil: 'networkidle2' }); await sleep(600);
    return { ctx, page, errors, posts };
  }
  const events = (page, name) => page.evaluate(n => (window.dataLayer || []).filter(a => a[0] === 'event' && a[1] === n).map(a => a[2] || {}), name);
  const waCode = async page => {
    const before = await page.evaluate(() => window.__opened.length);
    await page.evaluate(() => { const b = document.getElementById(document.getElementById('wa').offsetParent ? 'wa' : 'm-wa'); b.click(); });
    await sleep(300);
    const url = await page.evaluate(i => window.__opened[i] || '', before);
    const m = /golondon\.co\.il%2Ft%2F([A-Za-z0-9.]+)|golondon\.co\.il\/t\/([A-Za-z0-9.]+)/.exec(decodeURIComponent(url)) || /\/t\/([A-Za-z0-9.]+)/.exec(decodeURIComponent(url));
    return m ? (m[1] || m[2]) : '';
  };
  const hashOf = href => { const o = {}; (href.split('#')[1] || '').split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); }); return o; };

  /* 1. production default: the CTA never appears */
  {
    const { ctx, page, errors } = await open('/planner.html');
    await page.evaluate(() => document.getElementById('build').click()); await sleep(800);
    const st = await page.evaluate(() => ({ cards: document.querySelectorAll('#days-out .day-card').length, cta: !document.getElementById('jb-cta').hidden, text: document.getElementById('jb-cta').textContent }));
    ok(st.cards > 0 && !st.cta && st.text === '', 'default: auto route built, CTA hidden and empty (' + st.cards + ' days)');
    ok((await events(page, 'planner_complete')).length === 1, 'default: planner_complete once');
    ok((await events(page, 'journal_beta_start')).length === 0, 'default: no journal_beta_start');
    ok(errors.length === 0, 'default: no page errors ' + errors.join(' | '));
    await ctx.close();
  }
  /* 2. preview: auto route, family chip, CTA code == WhatsApp share code */
  {
    const { ctx, page, errors } = await open('/planner.html?journal_beta=preview');
    await page.evaluate(() => { const c = [...document.querySelectorAll('.chip')].find(x => x.textContent.includes('ילדים (5')); c && c.click(); });
    await page.evaluate(() => document.getElementById('build').click()); await sleep(800);
    const href = await page.evaluate(() => { const b = document.getElementById('jb-cta'); return b.hidden ? '' : b.querySelector('a').href; });
    const h = hashOf(href);
    const code = await waCode(page);
    ok(!!href && /kids-journal-beta\.html#r=/.test(href), 'preview auto: CTA shown with a #r= link');
    ok(h.r && h.r === code, 'preview auto: CTA route code == WhatsApp /t/ code (' + h.r + ')');
    ok(h.f === '1' && h.m === 'auto' && h.e === 'planner_cta', 'preview auto: family flag 1 for a kid band, mode auto');
    ok(!/[?&]r=/.test(href.split('#')[0]), 'route code is after #, not in the query string');
    /* version switch: CTA follows the visible version */
    await page.evaluate(() => document.getElementById('again').click()); await sleep(500);
    const href2 = await page.evaluate(() => document.querySelector('#jb-cta a').href); const code2 = await waCode(page);
    ok(hashOf(href2).r === code2, 'preview auto: after "another version" the CTA follows the visible route');
    const pc = (await events(page, 'planner_complete')).length;
    await page.evaluate(() => { const a = document.querySelector('#jb-cta a'); a.addEventListener('click', e => e.preventDefault()); a.click(); a.click(); });
    await sleep(200);
    const st = await events(page, 'journal_beta_start');
    ok(st.length === 1 && st[0].entry === 'planner_cta' && st[0].planner_mode === 'auto' && st[0].family_route === 1, 'journal_beta_start once, entry planner_cta ' + JSON.stringify(st));
    ok((await events(page, 'planner_complete')).length === pc && pc === 1, 'planner_complete unchanged by the CTA (' + pc + ')');
    ok(errors.length === 0, 'preview auto: no page errors ' + errors.join(' | '));
    await ctx.close();
  }
  /* 3. teen only: family flag 0 */
  {
    const { ctx, page } = await open('/planner.html?journal_beta=preview');
    await page.evaluate(() => { const c = [...document.querySelectorAll('.chip')].find(x => x.textContent.includes('נוער')); c && c.click(); });
    await page.evaluate(() => document.getElementById('build').click()); await sleep(800);
    ok(hashOf(await page.evaluate(() => document.querySelector('#jb-cta a').href)).f === '0', 'teen only: family flag 0 (same as the strict kids filter)');
    await ctx.close();
  }
  /* 4. manual board: CTA only once a day has two stops; code == manual WhatsApp code */
  {
    const code = [BY['big-ben'].code + BY['westminster-abbey'].code, BY['tate-modern'].code].join('.');
    const { ctx, page, errors } = await open('/planner.html?journal_beta=preview&p=' + code + '&from=share');
    const href = await page.evaluate(() => { const b = document.getElementById('m-jb-cta'); return b && !b.hidden ? b.querySelector('a').href : ''; });
    const h = hashOf(href), wa = await waCode(page);
    ok(h.r === code && wa === code, 'manual/shared: CTA code == shared /t/ code == WhatsApp code (' + h.r + ')');
    ok(h.m === 'manual', 'manual: mode manual');
    ok(errors.length === 0, 'manual: no page errors');
    await ctx.close();
    const one = await open('/planner.html?journal_beta=preview&p=' + BY['big-ben'].code + '.' + BY['tate-modern'].code + '&from=share');
    ok(await one.page.evaluate(() => document.getElementById('m-jb-cta').hidden), 'manual: no CTA while no day has two stops (manual completion rule)');
    await one.ctx.close();
  }
  /* 5. request page states */
  const routeHash = (c, f) => '/kids-journal-beta.html#r=' + c + '&f=' + (f ? 1 : 0) + '&m=auto&e=planner_cta';
  const good = [BY['big-ben'].code + BY['camden-market'].code + BY['chin-chin-labs'].code + BY['poppies-camden'].code, BY['tate-modern'].code].join('.');
  {
    const { ctx, page, errors } = await open('/kids-journal-beta.html');
    const st = await page.evaluate(() => ({ dis: document.getElementById('jb-submit').disabled, route: document.getElementById('jb-route-body').textContent, draft: document.getElementById('jb-draft').textContent }));
    ok(st.dis && /רק ממסלול אמיתי/.test(st.route), 'no route: explanation + planner link, submit disabled');
    ok(/טיוטה/.test(st.draft), 'no backend: honest draft notice shown');
    const v = await events(page, 'journal_beta_view');
    ok(v.length === 1 && v[0].entry === 'direct' && v[0].has_route === 0, 'journal_beta_view direct ' + JSON.stringify(v));
    ok(errors.length === 0, 'page: no errors');
    await ctx.close();
  }
  {
    const { ctx, page, errors, posts } = await open(routeHash(good, true));
    const st = await page.evaluate(() => ({ days: [...document.querySelectorAll('.jb-route-day')].map(e => e.textContent), struck: [...document.querySelectorAll('.jb-route-day s')].map(e => e.textContent), dis: document.getElementById('jb-submit').disabled }));
    ok(st.days.length === 2 && st.days[0].includes(BY['big-ben'].name) && st.days[1].includes(BY['tate-modern'].name), 'route shown: 2 days in Planner order');
    ok(st.struck.length === 1 && st.struck[0] === BY['chin-chin-labs'].name, 'closed stop kept in place and struck through');
    ok(!st.dis, 'valid route: submit enabled');
    const v = await events(page, 'journal_beta_view');
    ok(v.length === 1 && v[0].entry === 'planner_cta' && v[0].has_route === 1 && v[0].route_ok === 1, 'journal_beta_view from planner ' + JSON.stringify(v));
    /* invalid input is refused client side */
    await page.type('#jb-email', 'not-an-email'); await page.click('#jb-ack'); await page.click('#jb-submit'); await sleep(200);
    ok(/מייל/.test(await page.$eval('#jb-error', e => e.textContent)) && posts.length === 0, 'invalid email refused, nothing sent');
    await page.$eval('#jb-email', e => { e.value = ''; }); await page.type('#jb-email', 'parent@example.com');
    await page.type('#jb-name', 'Noa 123'); await page.click('#jb-submit'); await sleep(200);
    ok(/שם פרטי/.test(await page.$eval('#jb-error', e => e.textContent)) && posts.length === 0, 'non-name refused (letters only)');
    await page.$eval('#jb-name', e => { e.value = ''; }); await page.type('#jb-name', 'נועה');
    await page.click('#jb-submit'); await sleep(500);
    ok(posts.length === 1 && /טיוטה: השליחה עדיין לא מחוברת/.test(await page.$eval('#jb-draft', e => e.textContent)), 'no backend: one POST attempt, draft notice, no success');
    ok((await events(page, 'journal_beta_submit')).length === 0, 'no backend: no journal_beta_submit');
    const body = JSON.parse(posts[0]);
    ok(body.route_code === good && body.family_route === true && body.email === 'parent@example.com' && body.first_name === 'נועה' && body.beta_ack === true && Object.keys(body).sort().join() === 'beta_ack,email,family_route,first_name,planner_mode,route_code', 'payload: exactly route_code, family_route, planner_mode, email, first_name, beta_ack ' + Object.keys(body).join(','));
    ok(errors.length === 0, 'page: no errors');
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open(routeHash(good, false), { mock: { get: { status: 200, body: { open: true, remaining: 12 } }, post: { status: 200, body: { ok: true } } } });
    await page.type('#jb-email', 'parent@example.com'); await page.type('#jb-name', 'נועה'); await page.click('#jb-ack');
    await page.click('#jb-submit'); await sleep(500);
    const st = await page.evaluate(() => ({ ok: !document.getElementById('jb-success').hidden, form: document.getElementById('jb-request').hidden, back: document.getElementById('jb-back-route').href }));
    ok(st.ok && st.form && st.back === RC.link(good), 'mock success: success state, link back to the same /t/ route (' + st.back + ')');
    const sub = await events(page, 'journal_beta_submit');
    ok(sub.length === 1 && sub[0].trip_days === 2 && sub[0].first_name_given === 1, 'journal_beta_submit once after server success ' + JSON.stringify(sub));
    const dl = await page.evaluate(() => JSON.stringify(window.dataLayer || []));
    ok(!/parent@example|נועה|example\.com/.test(dl) && dl.indexOf(good) === -1, 'no email, child name or route code in any analytics event');
    ok(errors.length === 0, 'success: no errors');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(routeHash(good, true), { mock: { get: { status: 200, body: { open: false } } } });
    ok(await page.evaluate(() => !document.getElementById('jb-full').hidden && document.getElementById('jb-request').hidden && /ההרצה התמלאה/.test(document.body.innerText)), 'cap reached (status): full message, form hidden, club link');
    await ctx.close();
    const r = await open(routeHash(good, true), { mock: { get: { status: 200, body: { open: true, remaining: 1 } }, post: { status: 409, body: { full: true } } } });
    await r.page.type('#jb-email', 'parent@example.com'); await r.page.click('#jb-ack'); await r.page.click('#jb-submit'); await sleep(500);
    ok(await r.page.evaluate(() => !document.getElementById('jb-full').hidden), 'cap reached on submit (409): full message');
    ok((await events(r.page, 'journal_beta_submit')).length === 0, '409: no journal_beta_submit');
    await r.ctx.close();
  }
  {
    const eight = Array.from({ length: 8 }, (_, i) => DATA.filter(a => !a.closed)[i].code).join('.');
    const { ctx, page } = await open(routeHash(eight, false));
    ok(await page.evaluate(() => document.getElementById('jb-submit').disabled && /עד 7 ימים/.test(document.body.innerText)), 'over 7 days: explained, submit disabled');
    await ctx.close();
  }
  /* 6. mobile layout */
  for (const w of [390, 360]) {
    const { ctx, page, errors } = await open(routeHash(good, true), { width: w });
    const ow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(ow <= 0 && errors.length === 0, 'page @' + w + ': no horizontal overflow, no errors (' + ow + ')');
    await ctx.close();
    const p2 = await open('/planner.html?journal_beta=preview', { width: w });
    await p2.page.evaluate(() => document.getElementById('build').click()); await sleep(800);
    const ow2 = await p2.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(ow2 <= 0 && !(await p2.page.evaluate(() => document.getElementById('jb-cta').hidden)), 'planner CTA @' + w + ': visible, no overflow (' + ow2 + ')');
    await p2.ctx.close();
  }
  await browser.close(); server.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log(fail ? 'FAILED' : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
