/*
  שכבת האחסון המקומי של גו לונדון
  ================================
  מאפשרת לאתר לעבוד גם בלי חיבור, אבל בלי להציג תוכן ישן למי שכן מחובר.

  שתי בעיות שתוקנו בגרסה הזו:

  1. גרסת המטמון לא השתנתה אף פעם, ולכן קבצים ישנים נשארו במכשיר גם
     אחרי עדכון האתר. משתמשים ראו עמודים שכבר תוקנו מזמן.

  2. כשטעינה של עמוד כלשהו נכשלה, הוגש במקומה דף הבית. המשמעות: מי
     שלחץ על מפת הכשרות ברשת חלשה קיבל את דף הבית בלי שום הסבר,
     ונראה היה שהקישור שבור. עכשיו מוגשת רק הגרסה השמורה של אותו
     עמוד עצמו, ואם אין כזו מוצגת הודעת נתק ברורה.
*/

const CACHE_NAME = 'golondon-v4';

const OFFLINE_ASSETS = [
  '/index.html',
  '/style.css',
  '/script.js',
  '/images/logo.png',
  '/images/icon-192.png',
];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>אין חיבור לאינטרנט | גו לונדון</title>
<style>
  body{font-family:system-ui,-apple-system,'Heebo',sans-serif;direction:rtl;background:#FAF9F6;color:#201f2b;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
  .box{max-width:420px;text-align:center;background:#fff;border:1px solid rgba(32,31,43,.1);
       border-radius:20px;padding:34px 26px;box-shadow:0 12px 30px rgba(16,24,40,.08);}
  h1{font-size:21px;margin:0 0 10px;}
  p{font-size:15px;line-height:1.75;color:#55596b;margin:0 0 18px;}
  a{display:inline-block;background:linear-gradient(135deg,#DC2626,#EA580C);color:#fff;
    text-decoration:none;font-weight:800;padding:12px 22px;border-radius:11px;}
</style></head>
<body><div class="box">
  <div style="font-size:40px;margin-bottom:10px">📡</div>
  <h1>אין חיבור לאינטרנט</h1>
  <p>העמוד הזה עדיין לא נשמר במכשיר, ולכן אי אפשר להציג אותו במצב לא מקוון. ברגע שהחיבור יחזור, הכל יעבוד כרגיל.</p>
  <a href="/index.html">חזרה לדף הבית</a>
</div></body></html>`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   /* משאבים חיצוניים לא נשמרים */

  /*
    קובצי נתונים חייבים להיות עדכניים תמיד. תפריט מסעדות או רשימת
    אטרקציות שמוגשים מגרסה ישנה זו תקלה, לא נוחות.
  */
  const isData = url.pathname.endsWith('.json');

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (!isData && response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          }
          return Response.error();
        })
      )
  );
});
