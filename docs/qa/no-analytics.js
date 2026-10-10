/*
  בדיקות אוטומטיות לא שולחות נתונים לגוגל אנליטיקס
  ===================================================
  כל עמוד באתר טוען את תג GA4 ‏(G-QWWEWYZWCK) בתוך ה-head, בלי תנאי. דפדפן אוטומטי
  שפותח את golondon.co.il, תצוגה מקדימה של נטליפיי או golondon.netlify.app נספר
  לכן כגולש אמיתי בנכס של האתר.

  הקובץ הזה הוא השער של כל בדיקה בפאפטיר שפותחת עמוד אמיתי. הוא פועל רק בתוך
  הבדיקה, לא משנה שום קובץ של האתר ולא נוגע בגולשים.

  שתי שכבות:
    1. לפני שהעמוד נטען: window['ga-disable-G-QWWEWYZWCK'] = true. זה מתג הכיבוי
       הרשמי של gtag, והוא עוצר שליחה גם אם הסקריפט כן נטען.
    2. יירוט בקשות: כל בקשה ל-googletagmanager.com, google-analytics.com
       או לנתיב g/collect נחסמת ונספרת.

  שימוש:
    const { guardPage } = require('./no-analytics');
    const guard = await guardPage(page);            // לפני page.goto
    ...
    guard.assertClean();                            // בסוף: זורק שגיאה אם משהו יצא

  guardPage מפעיל setRequestInterception בעצמו. אם הבדיקה צריכה לחסום גם בקשות
  אחרות, מעבירים לה פונקציה: guardPage(page, { allow: url => ... }).

  בדיקה עצמית, מול שרת מקומי של העותק הזה (בלי רשת חיצונית):
    NODE_PATH=<node_modules עם puppeteer-core> node docs/qa/no-analytics.js --selftest
*/
'use strict';

const GA_ID = 'G-QWWEWYZWCK';
const ANALYTICS = /^https?:\/\/([a-z0-9-]+\.)*(googletagmanager\.com|google-analytics\.com|analytics\.google\.com)\/|\/g\/collect(\?|$)/i;

function isAnalytics(url) { return ANALYTICS.test(url); }

async function guardPage(page, opts) {
  const allow = (opts && opts.allow) || (() => true);
  const blocked = [], escaped = [];
  await page.evaluateOnNewDocument(id => { window['ga-disable-' + id] = true; }, GA_ID);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (isAnalytics(u)) { blocked.push(u); return r.abort(); }
    return allow(u) ? r.continue() : r.abort();
  });
  /* בקשה שעברה בכל זאת, למשל מ-service worker, נרשמת כאן ומפילה את הבדיקה */
  page.on('requestfinished', r => { if (isAnalytics(r.url())) escaped.push(r.url()); });
  return {
    blocked: () => blocked.length,
    escaped: () => escaped.slice(),
    assertClean() {
      if (escaped.length) throw new Error('GA4 request escaped the QA guard: ' + escaped[0]);
    }
  };
}

module.exports = { guardPage, isAnalytics, GA_ID };

/* ---------- בדיקה עצמית ---------- */
if (require.main === module && process.argv.includes('--selftest')) {
  const http = require('http'), fs = require('fs'), path = require('path');
  const puppeteer = require('puppeteer-core');
  const ROOT = path.resolve(__dirname, '..', '..');
  const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  const server = http.createServer((q, s) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    let f = path.join(ROOT, p); if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
  });
  (async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = 'http://127.0.0.1:' + server.address().port;
    const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
    let fail = 0;
    for (const p of ['/guide-winter-markets', '/guide-winter-christmas', '/london-december', '/planner']) {
      const page = await browser.newPage();
      /* רק השרת המקומי עובר. כל השאר נחסם, כך שהבדיקה לא פונה לאינטרנט */
      const guard = await guardPage(page, { allow: u => u.startsWith(BASE) || u.startsWith('data:') });
      await page.goto(BASE + p, { waitUntil: 'networkidle2' });
      const st = await page.evaluate(id => ({ off: window['ga-disable-' + id] === true, h1: !!document.querySelector('h1') }), GA_ID);
      const ok = st.off && st.h1 && guard.blocked() > 0 && guard.escaped().length === 0;
      if (!ok) fail++;
      console.log((ok ? 'PASS ' : 'FAIL ') + p + '  ga-disable=' + st.off + ' blocked=' + guard.blocked() + ' escaped=' + guard.escaped().length);
      await page.close();
    }
    await browser.close(); server.close();
    console.log(fail ? fail + ' FAILED' : 'ALL PASS');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.error(e); process.exit(1); });
}
