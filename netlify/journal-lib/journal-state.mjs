/*
  יומן המסע לילדים, בטא: מכונת המצבים של בקשה
  ============================================
  רשומת הבקשה requests/<request_id> במאגר הבטא היא המקור היחיד למצב. כל שינוי מצב נכתב בכתיבה מותנית
  (onlyIfMatch על ה-etag שנקרא), כך ששתי פונקציות שרצות במקביל לא דורסות זו את זו.

    accepted         נשמרה ותפסה משבצת. עוד לא נשלחה לעובד, או שהשליחה בדרך (dispatch_claimed_at)
    dispatch_failed  השליחה ל-GitHub נכשלה. dispatch_error מסוג קבוע. ניסיון חוזר עם אותו request_id
    dispatched       GitHub קיבל את ה-repository_dispatch (204)
    ready            תוצאת עובד תקינה אומתה, ונוצרה יכולת הורדה אחת (download_token)
    delivered        נשלחה ללקוח. רק צעד מפורש (markDelivered), אף פעם לא אוטומטית. אין עדיין מייל
    failed           העובד דיווח בחתימה תקינה על כישלון (worker_status), בלי קובץ
    expired          עבר expires_at. מחושב מהשעון ולא נכתב; המחיקה היומית מוחקת את הרשומה

  received הוא השם הישן של accepted ברשומות שנוצרו לפני השלב הזה.
*/

export const STATES = ['accepted', 'dispatch_failed', 'dispatched', 'ready', 'delivered', 'failed', 'expired'];

const NEXT = {
  accepted: ['accepted', 'dispatched', 'dispatch_failed', 'ready', 'failed'],
  dispatch_failed: ['accepted', 'dispatched', 'dispatch_failed', 'ready', 'failed'],
  dispatched: ['ready', 'failed'],
  failed: ['ready'],              /* הרצה חוזרת של המפעיל שהצליחה */
  ready: ['delivered'],
  delivered: [],
  expired: []
};

export const normStatus = s => (s === 'received' ? 'accepted' : s);

export function canTransition(from, to) {
  const f = normStatus(from);
  return !!(NEXT[f] && NEXT[f].indexOf(to) !== -1);
}

export function isExpired(record, now) {
  const t = record && Date.parse(record.expires_at);
  return !t || now.getTime() >= t;
}

export function effectiveStatus(record, now) {
  if (!record) return null;
  return isExpired(record, now) ? 'expired' : normStatus(record.status);
}

/* מה מותר להראות מחוץ לשרת: מצב בלבד. בלי מייל, שם, מסלול, מזהה או אסימון */
export function publicStatus(record, now) {
  const status = effectiveStatus(record, now);
  return { status, download_ready: status === 'ready' || status === 'delivered' };
}

export const requestKey = rid => 'requests/' + rid;

export async function readRecord(store, rid) {
  const r = await store.getWithMetadata(requestKey(rid), { type: 'json' });
  return r && r.data ? { record: r.data, etag: r.etag, metadata: r.metadata || {} } : null;
}

/*
  שינוי מותנה של רשומה. mutate(record) מחזיר רשומה חדשה, או null כשאין מה לשנות.
  כל כתיבה היא onlyIfMatch על ה-etag שנקרא. אם הקריאה לא החזירה etag, לא כותבים (fail closed).
  התוצאה: { record, changed } או { code: 'unknown_request' | 'conflict' }.
*/
export async function updateRecord(store, rid, mutate, tries) {
  for (let i = 0; i < (tries || 6); i++) {
    const cur = await readRecord(store, rid);
    if (!cur) return { code: 'unknown_request' };
    const next = mutate(cur.record);
    if (!next) return { record: cur.record, changed: false };
    if (!cur.etag) return { code: 'conflict' };      /* בלי etag אין כתיבה מותנית, ולכן לא כותבים בכלל */
    const metadata = { created_at: cur.record.created_at, expires_at: cur.record.expires_at };
    const w = await store.set(requestKey(rid), JSON.stringify(next), { onlyIfMatch: cur.etag, metadata });
    if (w && w.modified) return { record: next, changed: true };
  }
  return { code: 'conflict' };
}

/* הצעד של המייל העתידי. לא נקרא משום מקום בשלב הזה */
export async function markDelivered(store, rid, now) {
  return updateRecord(store, rid, rec => {
    if (isExpired(rec, now) || !canTransition(rec.status, 'delivered')) return null;
    return Object.assign({}, rec, { status: 'delivered', delivered_at: now.toISOString() });
  });
}
