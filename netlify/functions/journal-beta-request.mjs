/*
  יומן המסע לילדים, בטא חינמית: קבלת בקשה ומכסה של 25 משפחות
  =============================================================
  GET   ‎/.netlify/functions/journal-beta-request‎   { enabled, open }      בלי שום מידע אישי
  POST  אותה כתובת, JSON:
        { route_code, family_route, planner_mode, email, first_name?, beta_ack, website }
        website הוא שדה מלכודת שנסתר מבני אדם. אם מולא, הבקשה נדחית ושום דבר לא נכתב.

  כבוי כברירת מחדל. נפתח רק כשמשתני הסביבה בנטליפיי מוגדרים:
    JOURNAL_BETA_ENABLED = true
    JOURNAL_BETA_SECRET  = מחרוזת אקראית ארוכה (מפתח HMAC לזיהוי בקשה כפולה)
  בלעדיהם GET מחזיר enabled:false ו-POST מחזיר 503, כך שפריסה של הקוד לבד לא פותחת את הבטא.

  אחסון: Netlify Blobs, מאגר אחד "journal-beta" ברמת האתר, עקביות חזקה. מפתחות:
    slots/01 .. slots/25    { request_id, created_at }      המכסה. בלי מידע אישי. נשאר לתמיד
    requests/<request_id>   הבקשה עצמה (ראו record למטה)    נמחק אחרי 7 ימים לכל המאוחר
    dedupe/<hmac>           { request_id, created_at }      hmac של המייל והמסלול, לא המייל עצמו
  request_id אקראי לחלוטין ואין לו קשר לילד, למסלול או לתאריך.

  המכסה: כל משבצת נכתבת ב-onlyIfNew, כתיבה מותנית אטומית של Netlify Blobs ("the write will only
  succeed if the entry does not exist"). בקשה תופסת את המשבצת הפנויה הראשונה שהכתיבה אליה הצליחה.
  כשכל 25 קיימות, התשובה 409 full. אין נעילה שהומצאה כאן, רק הכתיבה המותנית של הפלטפורמה.

  בקשה כפולה (אותו מייל, אחרי נרמול, ואותו מסלול) לא תופסת משבצת נוספת: מפתח ה-dedupe נכתב
  גם הוא ב-onlyIfNew לפני תפיסת משבצת, והתשובה לכפולה היא already_received. אין כאן חיפוש
  לפי מייל ואין דרך לברר אם מייל אחר קיים במערכת.

  לא נשמרים: כתובת IP, שם משפחה, תאריך לידה, גיל, בית ספר, מלון, כתובת, מיקום או תמונה.
  מחיקה: journal-beta-purge.mjs, פעם ביום. פירוט ב-docs/journal-beta/BETA_PLAN.md.
*/
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import JournalRoute from '../../journal-beta-route.js';

export const CAP = 25;
export const RETENTION_DAYS = 7;
export const STORE_NAME = 'journal-beta';
const STALE_CLAIM_MS = 2 * 60 * 1000;
const MAX_BODY = 4096;
const FIELDS = ['route_code', 'family_route', 'planner_mode', 'email', 'first_name', 'beta_ack', 'website'];
const NAME = /^[֐-׿A-Za-z][֐-׿A-Za-z '׳’-]{0,23}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const slotKey = n => 'slots/' + String(n).padStart(2, '0');
const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export function normalizeEmail(s) { return String(s || '').normalize('NFC').trim().toLowerCase(); }
export function dedupeKey(secret, email, routeCode) {
  return 'dedupe/' + crypto.createHmac('sha256', secret).update(normalizeEmail(email) + '\n' + routeCode).digest('hex');
}

async function countSlots(store) {
  const { blobs } = await store.list({ prefix: 'slots/' });
  return blobs.length;
}

async function claimSlot(store, value) {
  const { blobs } = await store.list({ prefix: 'slots/' });
  const taken = new Set(blobs.map(b => b.key));
  for (let n = 1; n <= CAP; n++) {
    const key = slotKey(n);
    if (taken.has(key)) continue;
    const res = await store.set(key, JSON.stringify(value), { onlyIfNew: true });
    if (res && res.modified) return key;
  }
  return null;
}

/* deps: { store, secret, enabled, loadPlaces, now, newId } */
export async function handle(req, deps) {
  const now = deps.now || (() => new Date());
  if (req.method === 'GET') {
    if (!deps.enabled || !deps.secret) return json(200, { enabled: false, open: false });
    return json(200, { enabled: true, open: (await countSlots(deps.store)) < CAP });
  }
  if (req.method !== 'POST') return json(405, { code: 'method' });
  if (!deps.enabled) return json(503, { code: 'not_open' });
  if (!deps.secret) return json(503, { code: 'not_configured' });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { code: 'too_large' });
  let b;
  try { b = JSON.parse(raw); } catch (e) { return json(400, { code: 'bad_json' }); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json(400, { code: 'bad_json' });
  if (Object.keys(b).some(k => FIELDS.indexOf(k) === -1)) return json(400, { code: 'unexpected_field' });
  if (b.website) return json(400, { code: 'rejected' });                       /* מלכודת: בלי כתיבה, בלי משבצת */

  const email = normalizeEmail(b.email);
  if (!EMAIL.test(email) || email.length > 254) return json(400, { code: 'invalid_email' });
  const firstName = b.first_name == null || b.first_name === '' ? null : String(b.first_name).normalize('NFC').trim();
  if (firstName !== null && !NAME.test(firstName)) return json(400, { code: 'invalid_first_name' });
  if (b.beta_ack !== true) return json(400, { code: 'ack_required' });
  if (b.family_route !== true) return json(422, { code: 'not_family' });
  const mode = b.planner_mode === 'auto' || b.planner_mode === 'manual' ? b.planner_mode : null;
  if (!mode) return json(400, { code: 'invalid_mode' });

  const places = await deps.loadPlaces();
  const route = JournalRoute.validate(b.route_code, places);
  if (!route.ok) return json(422, { code: 'route_invalid', reason: route.reason });
  const routeCode = b.route_code;

  const store = deps.store;
  const t = now();
  const created = t.toISOString();
  const dKey = dedupeKey(deps.secret, email, routeCode);

  /* בקשה כפולה, או ניסיון קודם שנתקע באמצע */
  const prior = await store.get(dKey, { type: 'json' });
  if (prior) {
    const done = prior.request_id && await store.get('requests/' + prior.request_id);
    if (done || now() - new Date(prior.created_at) < STALE_CLAIM_MS) return json(200, { ok: true, status: 'already_received' });
    await store.delete(dKey);
  }

  const requestId = deps.newId ? deps.newId() : 'r' + crypto.randomBytes(12).toString('hex');
  const claim = await store.set(dKey, JSON.stringify({ request_id: requestId, created_at: created }), { onlyIfNew: true });
  if (!claim || !claim.modified) return json(200, { ok: true, status: 'already_received' });

  const slot = await claimSlot(store, { request_id: requestId, created_at: created });
  if (!slot) {
    await store.delete(dKey);
    return json(409, { code: 'full', full: true });
  }

  const expires = new Date(t.getTime() + RETENTION_DAYS * 864e5).toISOString();
  const record = { request_id: requestId, created_at: created, expires_at: expires, status: 'received',
    email, first_name: firstName, route_code: routeCode, family_route: true, planner_mode: mode };
  try {
    await store.set('requests/' + requestId, JSON.stringify(record), { metadata: { created_at: created, expires_at: expires } });
  } catch (e) {
    await store.delete(slot); await store.delete(dKey);
    return json(500, { code: 'store_failed' });
  }
  return json(200, { ok: true, status: 'received' });
}

/* נתוני המתכנן של אותה פריסה, מהאתר עצמו, עם מטמון קצר בזיכרון */
let cache = { at: 0, places: null };
async function loadPlacesFrom(req) {
  if (cache.places && Date.now() - cache.at < 5 * 60 * 1000) return cache.places;
  const res = await fetch(new URL('/planner-data.json', req.url), { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('planner-data ' + res.status);
  cache = { at: Date.now(), places: (await res.json()).attractions };
  return cache.places;
}

const env = k => (globalThis.Netlify && Netlify.env ? Netlify.env.get(k) : process.env[k]);

export default async (req) => handle(req, {
  store: getStore({ name: STORE_NAME, consistency: 'strong' }),
  secret: env('JOURNAL_BETA_SECRET') || '',
  enabled: env('JOURNAL_BETA_ENABLED') === 'true',
  loadPlaces: () => loadPlacesFrom(req)
});
