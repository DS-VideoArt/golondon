/*
  יומן המסע לילדים, בטא: החיבור בין האתר לעובד ההפקה (DS-VideoArt/golondon-kids-journal)
  ======================================================================================
  1. שליחה: אחרי שבקשה נשמרה, POST של repository_dispatch עם event_type journal_generate ו-client_payload
     של שישה שדות בדיוק (dispatchPayload). בלי מייל, בלי שם מאגר, בלי סוד. ההרשאה רק ממשתנה הסביבה
     בשרת JOURNAL_GITHUB_DISPATCH_TOKEN, שלא נכתב לשום יומן, תשובה או קובץ.
  2. תוצאה: העובד שולח תוצאה חתומה (HMAC-SHA256 על הגוף הגולמי בדיוק, JOURNAL_CALLBACK_SECRET), וגם כותב
     index/<request_id> במאגר המסירה. שני המסלולים עוברים באותה בדיקה ובאותה סגירה (applyWorkerResult).
  3. הורדה: בסגירה הראשונה נוצר אסימון הורדה חדש של האתר. אסימון המסירה של העובד לא יוצא מהשרת לעולם.
  מאגר מסירה מותר אחד בלבד בשלב הזה: journal-delivery-preview. בפריסת production אין מאגר מסירה, ולכן
  השליחה, התוצאה, ההורדה והתיאום כבויים שם (fail closed). אין כאן חיבור קבוע למאגר המסירה של production.
*/
import crypto from 'node:crypto';
import { normStatus, isExpired, effectiveStatus, canTransition, readRecord, updateRecord } from './journal-state.mjs';

export const WORKER_REPO = 'DS-VideoArt/golondon-kids-journal';
export const DISPATCH_EVENT = 'journal_generate';
export const PAYLOAD_FIELDS = ['request_id', 'route_code', 'family_route', 'planner_mode', 'first_name', 'created_at'];
export const ACCEPTED_DELIVERY_STORES = ['journal-delivery-preview'];
export const MAX_DISPATCH_ATTEMPTS = 5;
export const WORKER_FAILURES = ['rejected', 'generation_failed', 'gate_failed', 'upload_failed', 'config_error'];
export const DOWNLOAD_FILENAME = 'golondon-kids-journal.pdf';
export const MAX_CALLBACK_BODY = 16384;
/* תשובה מוזרמת של פונקציה מוגבלת ל-20 MB בתיעוד של נטליפיי. קובץ גדול יותר לא נשלח בחצי */
export const MAX_STREAM_BYTES = 20 * 1000 * 1000;

export const REQUEST_ID = /^r[0-9a-f]{24}$/;
export const DELIVERY_TOKEN = /^[0-9a-f]{64}$/;
export const DOWNLOAD_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SHA256 = /^[0-9a-f]{64}$/;
const WORKER_VERSION = /^journal-worker-\d+\.\d+\.\d+$/;
const CLAIM_MS = 2 * 60 * 1000;

const isPlain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const posInt = v => Number.isInteger(v) && v > 0;
const isoTime = v => typeof v === 'string' && ISO.test(v) && !isNaN(Date.parse(v));

/* מאגר המסירה לפי סביבת הפריסה: production לא מקבל אחד בשלב הזה */
export function deliveryStoreFor(context) {
  return context && context.deploy && context.deploy.context === 'production' ? null : 'journal-delivery-preview';
}
export const deliveryAllowed = name => ACCEPTED_DELIVERY_STORES.indexOf(name) !== -1;

/* ---------------------------------------------------------------- שליחה ל-GitHub */

export function dispatchPayload(rec) {
  return { request_id: rec.request_id, route_code: rec.route_code, family_route: rec.family_route === true,
    planner_mode: rec.planner_mode, first_name: rec.first_name == null ? null : rec.first_name, created_at: rec.created_at };
}

/* השולח לסביבה: רק עם אסימון בשרת וגם מאגר מסירה מותר. production: אין מאגר, ולכן null והמסלול ידני */
export function dispatcherFor(context, token, fetchImpl) {
  return deliveryStoreFor(context) && token ? githubDispatcher({ token, fetchImpl }) : null;
}

/* מחזיר פונקציה payload => { ok } או { ok:false, code }. אף פעם לא זורקת ולא מחזירה את האסימון או את גוף התשובה */
export function githubDispatcher({ token, fetchImpl, timeoutMs }) {
  if (!token) return null;
  return async payload => {
    let res;
    try {
      res = await (fetchImpl || fetch)('https://api.github.com/repos/' + WORKER_REPO + '/dispatches', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
          'content-type': 'application/json', 'user-agent': 'golondon-journal-beta' },
        body: JSON.stringify({ event_type: DISPATCH_EVENT, client_payload: payload }),
        signal: AbortSignal.timeout(timeoutMs || 8000)
      });
    } catch (e) {
      return { ok: false, code: e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'network' };
    }
    if (res.status === 204) return { ok: true };
    const s = res.status;
    return { ok: false, code: s === 401 || s === 403 ? 'auth' : s === 404 ? 'not_found' : s === 422 ? 'invalid' : s === 429 || s >= 500 ? 'unavailable' : 'http_' + s };
  };
}

/*
  שליחה אחת של בקשה קיימת, אידמפוטנטית סביב request_id. קודם תפיסה מותנית של הרשומה (accepted +
  dispatch_claimed_at), ורק מי שתפס שולח. ניסיון חוזר אחרי dispatch_failed עובר באותו מסלול, עם אותו מזהה,
  בלי משבצת חדשה ובלי רשומה חדשה. מחזיר { state, code? }.
*/
export async function dispatchRequest(store, rid, dispatcher, now) {
  if (!dispatcher) return { state: 'manual' };
  const t = now();
  const claimAt = t.toISOString();
  const c = await updateRecord(store, rid, rec => {
    if (isExpired(rec, t)) return null;
    const s = normStatus(rec.status);
    if (s !== 'accepted' && s !== 'dispatch_failed') return null;
    if ((rec.dispatch_attempts || 0) >= MAX_DISPATCH_ATTEMPTS) return null;
    if (s === 'accepted' && rec.dispatch_claimed_at && t - Date.parse(rec.dispatch_claimed_at) < CLAIM_MS) return null;
    return Object.assign({}, rec, { status: 'accepted', dispatch_attempts: (rec.dispatch_attempts || 0) + 1, dispatch_claimed_at: claimAt, dispatch_error: null });
  });
  if (c.code) return { state: 'error', code: c.code };
  if (!c.changed) {
    const s = effectiveStatus(c.record, t);
    if (s === 'dispatch_failed') return { state: s, code: 'attempts_exhausted' };
    return { state: s === 'accepted' ? (c.record.dispatch_claimed_at ? 'in_flight' : 'accepted') : s };
  }

  let out;
  try { out = await dispatcher(dispatchPayload(c.record)); } catch (e) { out = { ok: false, code: 'network' }; }
  if (!out || out.ok !== true) out = { ok: false, code: (out && out.code) || 'network' };

  const done = await updateRecord(store, rid, rec => {
    if (rec.dispatch_claimed_at !== claimAt || normStatus(rec.status) !== 'accepted') return null;   /* התוצאה כבר הגיעה */
    return Object.assign({}, rec, out.ok
      ? { status: 'dispatched', dispatched_at: now().toISOString(), dispatch_claimed_at: null }
      : { status: 'dispatch_failed', dispatch_error: out.code, dispatch_claimed_at: null });
  });
  if (done.code) return { state: 'error', code: done.code };
  const state = effectiveStatus(done.record, now());
  return state === 'dispatch_failed' ? { state, code: done.record.dispatch_error || out.code } : { state };
}

/* ---------------------------------------------------------------- תוצאת העובד */

/* null כשהחתימה תקינה, אחרת קוד. החישוב על הבתים הגולמיים, לפני כל פענוח, בהשוואה בזמן קבוע */
export function verifySignature(raw, header, secret) {
  if (!secret) return 'not_configured';
  if (typeof header !== 'string' || !header) return 'missing_signature';
  const m = /^sha256=([0-9a-f]{64})$/.exec(header.trim());
  if (!m) return 'malformed_signature';
  const want = crypto.createHmac('sha256', secret).update(raw).digest();
  return crypto.timingSafeEqual(want, Buffer.from(m[1], 'hex')) ? null : 'bad_signature';
}

export function checkWorkerHeader(v) { return typeof v === 'string' && WORKER_VERSION.test(v.trim()); }

/* בדיקת תוצאה מוכנה מול מאגר המסירה שמותר לסביבה הזאת. רק שדות שהעובד המאושר שולח באמת */
export function checkReadyResult(r, expectedStore, now) {
  if (!isPlain(r)) return 'malformed_result';
  if (typeof r.request_id !== 'string' || !REQUEST_ID.test(r.request_id)) return 'malformed_request_id';
  if (r.status !== 'ready') return 'not_ready';
  if (!deliveryAllowed(expectedStore) || r.delivery_store !== expectedStore) return 'wrong_store';
  if (typeof r.delivery_token !== 'string' || !DELIVERY_TOKEN.test(r.delivery_token)) return 'malformed_token';
  if (!isoTime(r.expires_at)) return 'malformed_result';
  if (r.created_at !== undefined && !isoTime(r.created_at)) return 'malformed_result';
  if (r.pdf_size !== undefined && !posInt(r.pdf_size)) return 'malformed_result';
  if (r.page_count !== undefined && !posInt(r.page_count)) return 'malformed_result';
  if (r.pdf_sha256 !== undefined && !(typeof r.pdf_sha256 === 'string' && SHA256.test(r.pdf_sha256))) return 'malformed_result';
  if (Date.parse(r.expires_at) <= now.getTime()) return 'delivery_expired';
  return null;
}

export const newDownloadToken = () => crypto.randomBytes(32).toString('base64url');
export const downloadKey = tok => 'downloads/' + tok;

async function recordWorkerFailure(store, rid, workerStatus, t) {
  return updateRecord(store, rid, rec => {
    if (isExpired(rec, t) || !canTransition(rec.status, 'failed')) return null;
    return Object.assign({}, rec, { status: 'failed', worker_status: workerStatus, failed_at: t.toISOString(), dispatch_claimed_at: null });
  });
}

/*
  סגירה ל-ready: יכולת הורדה אחת בדיוק. קודם נכתב המיפוי downloads/<אסימון חדש> (onlyIfNew), ואז הרשומה
  בכתיבה מותנית. מי שהפסיד במרוץ מוחק את המיפוי שלו, כך שנשאר אסימון אחד. רשומה שכבר ready לא מקבלת אסימון
  חדש (אין סיבוב אסימונים), גם כשמגיעה תוצאה חוזרת או תוצאה עם אסימון מסירה אחר.
*/
async function finalizeReady(store, rid, result, t, makeToken) {
  for (let i = 0; i < 6; i++) {
    const cur = await readRecord(store, rid);
    if (!cur) return { code: 'unknown_request' };
    const rec = cur.record;
    if (isExpired(rec, t)) return { code: 'expired' };
    const s = normStatus(rec.status);
    if ((s === 'ready' || s === 'delivered') && rec.download_token) return { status: s, created: false };
    if (!canTransition(s, 'ready')) return { code: 'bad_state' };
    if (!cur.etag) return { code: 'conflict' };
    const expires = new Date(Math.min(Date.parse(rec.expires_at), Date.parse(result.expires_at))).toISOString();
    const tok = makeToken();
    const mapping = { request_id: rid, delivery_store: result.delivery_store, delivery_token: result.delivery_token, expires_at: expires, created_at: t.toISOString() };
    const m = await store.set(downloadKey(tok), JSON.stringify(mapping), { onlyIfNew: true, metadata: { expires_at: expires } });
    if (!m || !m.modified) continue;
    const next = Object.assign({}, rec, { status: 'ready', ready_at: t.toISOString(), download_token: tok, download_expires_at: expires,
      dispatch_claimed_at: null, pdf_size: posInt(result.pdf_size) ? result.pdf_size : null, page_count: posInt(result.page_count) ? result.page_count : null,
      worker_version: typeof result.worker_version === 'string' && WORKER_VERSION.test(result.worker_version) ? result.worker_version : null });
    const w = await store.set('requests/' + rid, JSON.stringify(next), { onlyIfMatch: cur.etag, metadata: { created_at: rec.created_at, expires_at: rec.expires_at } });
    if (w && w.modified) return { status: 'ready', created: true };
    await store.delete(downloadKey(tok));
  }
  return { code: 'conflict' };
}

/*
  הבדיקה והסגירה המשותפות לתוצאה חתומה ולתיאום מ-index. מחזיר { status, created } או { code }.
  deps: { store, deliveryStore, deliveryStoreName, now, newDownloadToken }
*/
export async function applyWorkerResult(result, deps) {
  const t = deps.now();
  if (!isPlain(result)) return { code: 'malformed_result' };
  const rid = result.request_id;
  if (typeof rid !== 'string' || !REQUEST_ID.test(rid)) return { code: 'malformed_request_id' };
  if (!deps.deliveryStore || !deliveryAllowed(deps.deliveryStoreName)) return { code: 'delivery_not_configured' };
  const cur = await readRecord(deps.store, rid);
  if (!cur) return { code: 'unknown_request' };
  if (isExpired(cur.record, t)) return { code: 'expired' };
  if (result.status !== 'ready') {
    if (WORKER_FAILURES.indexOf(result.status) !== -1) await recordWorkerFailure(deps.store, rid, result.status, t);
    return { code: 'not_ready' };
  }
  const bad = checkReadyResult(result, deps.deliveryStoreName, t);
  if (bad) return { code: bad };
  /* הקובץ שהאסימון מצביע עליו קיים ושייך לבקשה הזאת */
  const meta = await deps.deliveryStore.getMetadata('pdf/' + result.delivery_token);
  if (!meta || !meta.metadata || meta.metadata.request_id !== rid) return { code: 'delivery_missing' };
  return finalizeReady(deps.store, rid, result, t, deps.newDownloadToken || newDownloadToken);
}

/*
  POST /.netlify/functions/journal-worker-callback. הגוף נקרא כבתים גולמיים ונבדק בחתימה לפני כל פענוח.
  התשובה לעולם לא מכילה אסימון. deps: { store, deliveryStore, deliveryStoreName, secret, now, newDownloadToken }
*/
const CALLBACK_HTTP = { not_configured: 503, delivery_not_configured: 503, conflict: 503, too_large: 413,
  missing_signature: 401, malformed_signature: 401, bad_signature: 401, bad_worker: 400, bad_json: 400,
  malformed_result: 400, malformed_request_id: 400, unknown_request: 404, expired: 410, not_ready: 422, wrong_store: 422,
  malformed_token: 422, delivery_expired: 422, delivery_missing: 409, bad_state: 409 };
const cbJson = (code, body) => new Response(JSON.stringify(body), { status: code,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function handleCallback(req, deps) {
  const fail = code => cbJson(CALLBACK_HTTP[code] || 400, { ok: false, code });
  if (req.method !== 'POST') return cbJson(405, { ok: false, code: 'method' });
  if (!deps.secret) return fail('not_configured');
  if (!deps.deliveryStore || !deliveryAllowed(deps.deliveryStoreName)) return fail('delivery_not_configured');
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_CALLBACK_BODY) return fail('too_large');
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.length > MAX_CALLBACK_BODY) return fail('too_large');
  const sig = verifySignature(raw, req.headers.get('x-journal-signature'), deps.secret);
  if (sig) return fail(sig);
  if (!checkWorkerHeader(req.headers.get('x-journal-worker'))) return fail('bad_worker');
  let result;
  try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch (e) { return fail('bad_json'); }
  const r = await applyWorkerResult(result, deps);
  if (r.code) return fail(r.code);
  return cbJson(200, { ok: true, status: r.status, created: r.created });
}

/* ---------------------------------------------------------------- תיאום */

/*
  העובד מנסה callback פעם אחת. כאן, לבקשות שממתינות להפקה בלבד (accepted שכבר נשלחה, dispatched,
  dispatch_failed), נבדק index/<request_id> במאגר המסירה של הסביבה ונסגר באותו קוד. dispatch_failed שלא נמצא
  לו index נשלח שוב, עד MAX_DISPATCH_ATTEMPTS. בקשה במצב ידני (accepted בלי ניסיון שליחה) לא נוגעים בה.
*/
export async function reconcile(deps) {
  const counts = { checked: 0, finalized: 0, already_ready: 0, waiting: 0, redispatched: 0, dispatch_failed: 0, errors: 0, deferred: 0 };
  if (!deps.deliveryStore || !deliveryAllowed(deps.deliveryStoreName)) return { skipped: 'no_delivery_store' };
  const { blobs } = await deps.store.list({ prefix: 'requests/' });
  for (const { key } of blobs) {
    if (deps.deadline && Date.now() > deps.deadline) { counts.deferred++; continue; }
    const rid = key.slice('requests/'.length);
    if (!REQUEST_ID.test(rid)) continue;
    const cur = await readRecord(deps.store, rid);
    if (!cur) continue;
    const s = effectiveStatus(cur.record, deps.now());
    const awaiting = s === 'dispatched' || s === 'dispatch_failed' || (s === 'accepted' && cur.record.dispatch_attempts > 0);
    if (!awaiting) continue;
    counts.checked++;
    const idx = await deps.deliveryStore.get('index/' + rid, { type: 'json' });
    if (idx && idx.status === 'ready') {
      if (idx.request_id !== rid) { counts.errors++; continue; }
      const r = await applyWorkerResult(idx, deps);
      if (r.status) counts[r.created ? 'finalized' : 'already_ready']++; else counts.errors++;
      continue;
    }
    if (s === 'dispatch_failed' || s === 'accepted') {
      const d = await dispatchRequest(deps.store, rid, deps.dispatcher, deps.now);
      if (d.state === 'dispatched') counts.redispatched++;
      else if (d.state === 'dispatch_failed') counts.dispatch_failed++;
      else counts.waiting++;
      continue;
    }
    counts.waiting++;
  }
  return counts;
}

/* ---------------------------------------------------------------- הורדה */

const MSG = { 404: 'הקישור להורדה לא נמצא.', 410: 'תוקף הקישור להורדה פג. אפשר לכתוב לנו ונשלח יומן מחדש.',
  503: 'ההורדה לא זמינה כרגע.', 405: 'הבקשה לא נתמכת.' };
const plain = status => new Response(MSG[status], { status, headers: {
  'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store, private', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' } });

/*
  GET /journal-download/<download_token>. האסימון נבדק ומתורגם בשרת לאסימון המסירה, והקובץ מוזרם
  מ-journal-delivery-preview/pdf/<delivery_token>. אין הפניה לכתובת של Blob, אין מידע אישי בכתובת, ואין
  אסימון בכותרות או ביומן. חסר, לא תקין או שפג: נסגר.
  deps: { store, deliveryStore, deliveryStoreName, now }
*/
export async function handleDownload(req, deps) {
  if (req.method !== 'GET') return plain(405);
  const tok = new URL(req.url).pathname.split('/').pop() || '';   /* בלי פענוח: אסימון תקין הוא base64url בלבד */
  if (!DOWNLOAD_TOKEN.test(tok)) return plain(404);
  if (!deps.deliveryStore || !deliveryAllowed(deps.deliveryStoreName)) return plain(404);
  const t = deps.now();
  const map = await deps.store.get(downloadKey(tok), { type: 'json' });
  if (!isPlain(map) || !REQUEST_ID.test(map.request_id || '') || !DELIVERY_TOKEN.test(map.delivery_token || '')) return plain(404);
  if (!(Date.parse(map.expires_at) > t.getTime())) return plain(410);
  if (map.delivery_store !== deps.deliveryStoreName) return plain(404);
  const rec = (await readRecord(deps.store, map.request_id) || {}).record;
  if (!rec || rec.download_token !== tok) return plain(404);
  if (isExpired(rec, t)) return plain(410);
  const st = normStatus(rec.status);
  if (st !== 'ready' && st !== 'delivered') return plain(404);
  const pdfKey = 'pdf/' + map.delivery_token;
  const meta = await deps.deliveryStore.getMetadata(pdfKey);
  const md = meta && meta.metadata;
  if (!md || md.request_id !== map.request_id) return plain(404);
  if (!(Date.parse(md.expires_at) > t.getTime())) return plain(410);
  if (posInt(md.pdf_size) && md.pdf_size > MAX_STREAM_BYTES) return plain(503);
  const body = await deps.deliveryStore.get(pdfKey, { type: 'stream' });
  if (!body) return plain(404);
  const headers = { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="' + DOWNLOAD_FILENAME + '"',
    'cache-control': 'no-store, private', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };
  if (posInt(md.pdf_size)) headers['content-length'] = String(md.pdf_size);
  return new Response(body, { status: 200, headers });
}

/* ---------------------------------------------------------------- מחיקה */

/* מיפויי הורדה במאגר הבטא: נמחקים כשפג expires_at שלהם (או כשאין להם תאריך) */
export async function purgeDownloads(store, now) {
  let deleted = 0;
  const { blobs } = await store.list({ prefix: 'downloads/' });
  for (const { key } of blobs) {
    const v = await store.get(key, { type: 'json' });
    const exp = v && Date.parse(v.expires_at);
    if (!exp || exp <= now.getTime()) { await store.delete(key); deleted++; }
  }
  return deleted;
}

/*
  מאגר המסירה של העובד, רק המאגר המותר לסביבה: pdf/<token> נמחק כשפג expires_at שבמטא-דאטה שלו, index/<id>
  כשפג expires_at שבו. תוקף ההורדה לעולם לא מאוחר מתוקף הקובץ, ולכן קובץ שעוד אפשר להוריד לא נמחק כאן.
  קובץ בלי מטא-דאטה תקין לא ניתן להורדה בכלל (handleDownload דורש אותו), ולכן הוא נמחק.
*/
export async function purgeDelivery(deliveryStore, deliveryStoreName, now) {
  if (!deliveryStore || !deliveryAllowed(deliveryStoreName)) return { skipped: 'no_delivery_store' };
  const deleted = { pdf: 0, index: 0 };
  for (const { key } of (await deliveryStore.list({ prefix: 'pdf/' })).blobs) {
    const m = await deliveryStore.getMetadata(key);
    const exp = m && m.metadata && Date.parse(m.metadata.expires_at);
    if (!exp || exp <= now.getTime()) { await deliveryStore.delete(key); deleted.pdf++; }
  }
  for (const { key } of (await deliveryStore.list({ prefix: 'index/' })).blobs) {
    const v = await deliveryStore.get(key, { type: 'json' });
    const exp = v && Date.parse(v.expires_at);
    if (!exp || exp <= now.getTime()) { await deliveryStore.delete(key); deleted.index++; }
  }
  return deleted;
}
