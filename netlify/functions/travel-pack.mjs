/*
  חוברת הטיול כ-PDF: /pack/<קוד מסלול>
  =====================================
  הקוד הוא אותו קוד מסלול שאחרי ‎/t/‎ (route-code.js). הפונקציה פותחת ב-Chrome ללא ממשק
  את התבנית של האתר עצמו, ‎/travel-pack?p=<קוד>‎, ומחזירה את ה-PDF ישירות.

  - קלט: רק קוד המסלול. בודקים צורה (route-code.js), ולא יותר מ-MAX_DAYS ימים,
    MAX_STOPS_PER_DAY עצירות ביום ו-MAX_STOPS עצירות בסך הכל. קוד פגום מחזיר 400,
    מסלול שאין בו אף מקום מוכר מחזיר 404.
  - הדפדפן טוען רק את האתר שעליו רצה הפונקציה (אותו מקור), וכל בקשה אחרת נחסמת.
    המקור עצמו חייב להיות כתובת של גו לונדון (ALLOWED_HOST).
  - שום דבר לא נשמר ושום מידע אישי לא נאסף. ה-PDF חוזר בתשובה. ה-CDN רשאי לשמור
    עותק ליום (אותו קוד, אותו PDF), והמטמון מתרוקן בכל פריסה.
  - מגבלת קצב של Netlify (rateLimit): 20 בקשות לדקה לכתובת IP, ואז 429.
  - ?dl=1 מבקש הורדה (attachment) במקום פתיחה בדפדפן.
*/
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import RC from '../../route-code.js';

const MAX_DAYS = 14;
const MAX_STOPS_PER_DAY = 20;
const MAX_STOPS = 100;
const MAX_CODE_LENGTH = 2 * MAX_STOPS + MAX_DAYS;
const ALLOWED_HOST = /^(golondon\.co\.il|www\.golondon\.co\.il|golondon\.netlify\.app|[a-z0-9-]+--golondon\.netlify\.app)$/;
const RENDER_TIMEOUT_MS = 25000;

function plain(status, message, extra) {
  return new Response(message + '\n', {
    status,
    headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, extra || {})
  });
}

/* צורת הקוד והגבולות. מחזיר הודעת שגיאה, או ריק אם הקוד תקין */
function checkCode(code) {
  if (code.length > MAX_CODE_LENGTH) return 'route code too long';
  if (!code || !RC.isWellFormed(code)) return 'malformed route code';
  const days = code.split('.');
  if (days.length > MAX_DAYS) return 'too many days (max ' + MAX_DAYS + ')';
  let stops = 0;
  for (const d of days) {
    if (!d || d.length % RC.CODE_LENGTH !== 0) return 'malformed route code';
    const n = d.length / RC.CODE_LENGTH;
    if (n > MAX_STOPS_PER_DAY) return 'too many stops in a day (max ' + MAX_STOPS_PER_DAY + ')';
    stops += n;
  }
  if (stops > MAX_STOPS) return 'too many stops (max ' + MAX_STOPS + ')';
  return '';
}

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, 'method not allowed', { Allow: 'GET, HEAD' });
  const url = new URL(req.url);
  if (!ALLOWED_HOST.test(url.hostname)) return plain(400, 'unknown host');

  let code = '';
  try { code = decodeURIComponent(url.pathname.replace(/^\/pack\/?/, '')).replace(/\.pdf$/i, ''); } catch (e) { code = ''; }
  const problem = checkCode(code);
  if (problem) return plain(400, problem);

  const t0 = Date.now();
  let browser;
  try {
    browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      defaultViewport: { width: 1100, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: 'shell'
    });
    const tLaunch = Date.now();
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', r => {
      const u = r.url();
      if (u.startsWith(url.origin + '/') || u.startsWith('data:')) r.continue(); else r.abort();
    });
    await page.goto(url.origin + '/travel-pack?p=' + encodeURIComponent(code), { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
    await page.waitForSelector('html[data-pack-ready="1"], html[data-pack-error]', { timeout: RENDER_TIMEOUT_MS });
    const error = await page.evaluate(() => document.documentElement.getAttribute('data-pack-error'));
    if (error) return plain(error === 'empty_route' ? 404 : 400, error === 'empty_route' ? 'route has no known places' : 'route could not be built');
    const tRender = Date.now();
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const tPdf = Date.now();
    const rss = Math.round(process.memoryUsage().rss / 1048576);
    const download = url.searchParams.get('dl') === '1';
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': (download ? 'attachment' : 'inline') + '; filename="golondon-travel-pack.pdf"',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400',
        'Netlify-Vary': 'query=dl',
        'X-Robots-Tag': 'noindex',
        'Server-Timing': `launch;dur=${tLaunch - t0}, render;dur=${tRender - tLaunch}, pdf;dur=${tPdf - tRender}, total;dur=${tPdf - t0}, rss;desc="${rss}MB"`
      }
    });
  } catch (e) {
    console.error('[travel-pack]', e && e.message);
    return plain(500, 'pdf generation failed');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

export const config = {
  path: '/pack/*',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
