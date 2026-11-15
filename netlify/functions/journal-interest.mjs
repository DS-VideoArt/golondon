/*
  חוברת הטיול לילדים, ניסוי ביקוש: טופס התעניינות
  ================================================
  GET   ‎/.netlify/functions/journal-interest‎   { enabled }                      בלי שום מידע אישי
  POST  אותה כתובת, JSON:
        { email, trip_month?, child_age?, willing, consent, website }
        website הוא שדה מלכודת שנסתר מבני אדם. אם מולא, הבקשה נדחית ושום דבר לא נכתב.

  זה לא טופס הזמנה: אין סליקה, אין הזמנה, אין הפעלת עובד ההפקה, אין מייל אוטומטי. נשמרת רק הבעת
  התעניינות עם הסכמה מפורשת לעדכון חד-פעמי על זמינות המוצר, כדי למדוד ביקוש.

  מתג אחד, בשרת: JOURNAL_INTEREST_ENABLED=true (משתנה סביבה רגיל, לא סוד). בלעדיו GET מחזיר enabled:false,
  POST מחזיר 503, ושום דבר לא נכתב. כך הניסוי נפתח ונסגר (אחרי 21 יום) בלי שינוי קוד.

  אחסון: Netlify Blobs, מאגר לפי הקשר הפריסה (מאגרים ברמת האתר משותפים לכל הפריסות):
    production -> journal-interest    כל השאר (תצוגה מקדימה, ענף, פיתוח) -> journal-interest-preview
  מפתח: interest/<sha256 של המייל המנורמל>, כתיבה ב-onlyIfNew, כך שאותו מייל נספר פעם אחת (already).
  ערך: { created_at, expires_at, email, trip_month, child_age, willing, consent_at, price_shown }. נמחק אחרי 90 ימים
  במחיקה היומית (journal-interest-purge.mjs), או מוקדם יותר אחרי שליחת העדכון החד-פעמי.
  לא נשמרים: שם, כתובת IP, מסלול, פרטי ילד מעבר לגיל אופציונלי, שום דבר אחר. ביומן: קוד HTTP בלבד.
*/
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

export const STORE_NAME = 'journal-interest';
export const PREVIEW_STORE_NAME = 'journal-interest-preview';
export const RETENTION_DAYS = 90;
export const FIELDS = ['email', 'trip_month', 'child_age', 'willing', 'consent', 'website'];
export const WILLING = ['yes', 'maybe', 'no'];
export const OFFER_PRICE = 14.9;   /* המחיר שהוצג בניסוי, בשקלים; נשמר ברשומה כדי שכל תשובה תשויך למחיר שהוצג */
const MAX_BODY = 2048;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const MONTH = /^(202[6-9]|203\d)-(0[1-9]|1[0-2])$/;
const MIN_AGE = 2, MAX_AGE = 16;

export function storeNameFor(context) {
  return context && context.deploy && context.deploy.context === 'production' ? STORE_NAME : PREVIEW_STORE_NAME;
}
export function normalizeEmail(s) { return String(s || '').normalize('NFC').trim().toLowerCase(); }
export const interestKey = email => 'interest/' + crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/* deps: { store, enabled, now } */
export async function handle(req, deps) {
  const now = deps.now || (() => new Date());
  if (req.method === 'GET') return json(200, { enabled: deps.enabled === true });
  if (req.method !== 'POST') return json(405, { code: 'method' });
  if (deps.enabled !== true) return json(503, { code: 'not_open' });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { code: 'too_large' });
  let b;
  try { b = JSON.parse(raw); } catch (e) { return json(400, { code: 'bad_json' }); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json(400, { code: 'bad_json' });
  if (Object.keys(b).some(k => FIELDS.indexOf(k) === -1)) return json(400, { code: 'unexpected_field' });
  if (b.website) return json(400, { code: 'rejected' });                       /* מלכודת: בלי כתיבה */

  const email = normalizeEmail(b.email);
  if (!EMAIL.test(email) || email.length > 254) return json(400, { code: 'invalid_email' });
  const month = b.trip_month == null || b.trip_month === '' ? null : String(b.trip_month);
  if (month !== null && !MONTH.test(month)) return json(400, { code: 'invalid_month' });
  const age = b.child_age == null || b.child_age === '' ? null : b.child_age;
  if (age !== null && !(Number.isInteger(age) && age >= MIN_AGE && age <= MAX_AGE)) return json(400, { code: 'invalid_age' });
  if (WILLING.indexOf(b.willing) === -1) return json(400, { code: 'invalid_willing' });
  if (b.consent !== true) return json(400, { code: 'consent_required' });

  const t = now();
  const record = { created_at: t.toISOString(), expires_at: new Date(t.getTime() + RETENTION_DAYS * 864e5).toISOString(),
    email, trip_month: month, child_age: age, willing: b.willing, consent_at: t.toISOString(), price_shown: OFFER_PRICE };
  const w = await deps.store.set(interestKey(email), JSON.stringify(record), { onlyIfNew: true, metadata: { created_at: record.created_at, expires_at: record.expires_at } });
  if (!w || !w.modified) return json(200, { ok: true, status: 'already' });
  return json(200, { ok: true, status: 'received' });
}

/* מחיקה: רשומות התעניינות שפג תוקפן (90 ימים), או בלי תאריך. ספירה בלבד */
export async function purgeInterest(store, now) {
  let deleted = 0;
  const { blobs } = await store.list({ prefix: 'interest/' });
  for (const { key } of blobs) {
    const v = await store.get(key, { type: 'json' });
    const exp = v && Date.parse(v.expires_at);
    if (!exp || exp <= now.getTime()) { await store.delete(key); deleted++; }
  }
  return deleted;
}

const env = k => (globalThis.Netlify && Netlify.env ? Netlify.env.get(k) : process.env[k]);

export default async (req, context) => {
  const res = await handle(req, {
    store: getStore({ name: storeNameFor(context), consistency: 'strong' }),
    enabled: env('JOURNAL_INTEREST_ENABLED') === 'true'
  });
  if (req.method === 'POST') console.log('journal interest', res.status);   /* קוד HTTP בלבד */
  return res;
};
