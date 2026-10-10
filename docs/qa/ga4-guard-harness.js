/*
  בדיקת שער GA4 (ga4.js)
  ======================
  מוודא שספריית גוגל אנליטיקס נטענת רק ב-https://golondon.co.il, ושבכל כתובת אחרת,
  וגם באתר האמיתי כשמתג הכיבוי של הבדיקות דולק, היא לא נטענת בכלל.

  איך: הדפדפן פותח כתובות אמיתיות (golondon.co.il, golondon.netlify.app, תצוגה מקדימה
  של נטליפיי), אבל כל בקשה ליירטת ומקבלת את הקובץ מהעותק המקומי. בקשה לספריית גוגל
  נרשמת ומקבלת קובץ ריק, כך ששום דבר לא יוצא לרשת ולא מגיע לנכס של האתר.
  127.0.0.1 ו-localhost נבדקים מול שרת מקומי אמיתי.

  שימוש:
    NODE_PATH=<node_modules עם puppeteer-core> node docs/qa/ga4-guard-harness.js
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const { guardPage } = require('./no-analytics');

const ROOT = path.resolve(__dirname, '..', '..');
const ID = 'G-QWWEWYZWCK';
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function localFile(urlPath) {
  let p = decodeURIComponent(urlPath); if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p); if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  return fs.existsSync(f) && !fs.statSync(f).isDirectory() ? f : null;
}
const isGoogle = u => /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|\/g\/collect/.test(u);

/* פותח עמוד בכתובת origin, מגיש אותו מהעותק המקומי, ומחזיר מה נטען */
async function visit(browser, origin, page, opts) {
  const tab = await browser.newPage();
  const google = [];
  await tab.setBypassServiceWorker(true);
  if (opts && opts.killSwitch) await tab.evaluateOnNewDocument(id => { window['ga-disable-' + id] = true; }, ID);
  await tab.setRequestInterception(true);
  tab.on('request', r => {
    const u = r.url();
    if (isGoogle(u)) { google.push(u); return r.respond({ status: 200, contentType: 'text/javascript', body: '' }); }
    if (u.startsWith(origin)) {
      const f = localFile(new URL(u).pathname);
      if (!f) return r.respond({ status: 404, body: '' });
      return r.respond({ status: 200, contentType: T[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    }
    if (u.startsWith('data:')) return r.continue();
    return r.abort();
  });
  await tab.goto(origin + page, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 300));
  const st = await tab.evaluate(id => {
    if (window.glTrack) window.glTrack('qa_probe', { probe: 1 });
    const dl = (window.dataLayer || []).map(a => Array.prototype.slice.call(a));
    return {
      gtagFn: typeof window.gtag === 'function',
      disabled: window['ga-disable-' + id] === true,
      config: dl.some(a => a[0] === 'config' && a[1] === id),
      probe: dl.some(a => a[0] === 'event' && a[1] === 'qa_probe'),
      libTag: !!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')
    };
  }, ID);
  await tab.close();
  return Object.assign(st, { google: google.length });
}

(async () => {
  const server = http.createServer((q, s) => {
    const f = localFile(new URL(q.url, 'http://x').pathname);
    if (!f) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
  const PAGES = ['/', '/guide-winter-markets', '/planner', '/whats-new', '/checklist'];

  const cases = [
    { name: 'production https://golondon.co.il', origin: 'https://golondon.co.il', live: true },
    { name: 'production + QA kill switch', origin: 'https://golondon.co.il', live: false, killSwitch: true },
    { name: 'netlify default host', origin: 'https://golondon.netlify.app', live: false },
    { name: 'netlify deploy preview', origin: 'https://deploy-preview-123--golondon.netlify.app', live: false },
    { name: 'netlify branch deploy', origin: 'https://growth-wave1--golondon.netlify.app', live: false },
    { name: 'http (not https)', origin: 'http://golondon.co.il', live: false },
    { name: 'localhost', origin: 'http://localhost:' + port, live: false, real: true },
    { name: '127.0.0.1', origin: 'http://127.0.0.1:' + port, live: false, real: true }
  ];
  for (const c of cases) {
    for (const p of PAGES) {
      const st = await visit(browser, c.origin, p, c);
      const tag = c.name + ' ' + p;
      ok(st.gtagFn, tag + ': gtag is a function');
      ok(st.config, tag + ': config recorded in dataLayer');
      ok(st.probe, tag + ': glTrack event recorded in dataLayer');
      if (c.live) {
        ok(st.libTag && st.google >= 1, tag + ': GA library requested (' + st.google + ')');
        ok(!st.disabled, tag + ': not disabled');
      } else {
        ok(!st.libTag && st.google === 0, tag + ': no GA request (' + st.google + ')');
        ok(st.disabled, tag + ': ga-disable flag set');
      }
    }
    console.log((c.live ? 'LOADS ' : 'BLOCKS') + '  ' + c.name);
  }

  /* השער של הבדיקות עצמו, מול האתר האמיתי: אפס בקשות לגוגל */
  {
    const tab = await browser.newPage();
    const g = await guardPage(tab, { allow: u => u.startsWith('https://golondon.co.il') });
    tab.removeAllListeners('request');
    tab.on('request', r => {
      const u = r.url();
      if (isGoogle(u)) return r.abort();
      if (u.startsWith('https://golondon.co.il')) {
        const f = localFile(new URL(u).pathname);
        return f ? r.respond({ status: 200, contentType: T[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }) : r.respond({ status: 404, body: '' });
      }
      return r.abort();
    });
    await tab.goto('https://golondon.co.il/guide-winter-christmas', { waitUntil: 'networkidle2' });
    const lib = await tab.evaluate(() => !!document.querySelector('script[src*="googletagmanager.com/gtag/js"]'));
    ok(!lib && g.escaped().length === 0, 'no-analytics.js guard on production host: library not injected');
    await tab.close();
  }

  await browser.close(); server.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log(fail ? 'FAILED' : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
