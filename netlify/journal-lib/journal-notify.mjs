/*
  יומן המסע לילדים, בטא: התראות למפעיל דרך Netlify Forms
  =====================================================
  המסלול הידני תלוי במפעיל שרואה כל בקשה בזמן, כי בקשה שלא טופלה נמחקת אחרי 7 ימים. במקום שירות מייל
  (אין SES, אין שירות בתשלום) משתמשים בערוץ שכבר קיים באתר: לכל טופס Netlify מוגדרת התראת מייל לתיבת
  Go London (submission_created, כל הטפסים). הפונקציות שולחות submission לשני טפסים נסתרים שמוגדרים
  ב-index.html, ונטליפיי שולח את המייל:
    journal-beta-alert    מיד אחרי שבקשה התקבלה (מזהה, תאריכים, סביבה)
    journal-beta-digest   פעם ביום מהמחיקה המתוזמנת, כל עוד יש בקשות פתוחות (כמות, המוקדמת לתפוגה, מזהים)
  בלי שום מידע אישי: לא מייל, לא שם פרטי, לא קוד מסלול. רק מזהים אקראיים ותאריכים.
  כישלון בשליחה לעולם לא מפיל את הבקשה ולא את המחיקה: נרשם ביומן הריצה וממשיכים.
*/

/* שולח submission לטופס בשם formName באתר baseUrl (DEPLOY_PRIME_URL של אותה פריסה, או URL) */
export function formNotifier(baseUrl, formName, fetchImpl) {
  if (!baseUrl || !formName) return null;
  const f = fetchImpl || fetch;
  return async fields => {
    const body = new URLSearchParams({ 'form-name': formName });
    for (const k of Object.keys(fields || {})) body.set(k, fields[k] == null ? '' : String(fields[k]));
    const res = await f(new URL('/', baseUrl), {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    if (!res.ok) throw new Error('form ' + formName + ' ' + res.status);
    return true;
  };
}

/* שליחה שלא נכשלת החוצה: false אם אין מודיע או אם השליחה נכשלה */
export async function notifySafely(notify, fields, log) {
  if (!notify) return false;
  try { await notify(fields); return true; }
  catch (e) { (log || console.log)('journal-beta notify failed: ' + (e && e.message)); return false; }
}

/* תמונת מצב של הבקשות הפתוחות, בלי מידע אישי: כמות, הבקשה שתפוג ראשונה, ומזהים */
export async function pendingDigest(store, now) {
  const t = (now || new Date()).getTime();
  const { blobs } = await store.list({ prefix: 'requests/' });
  const items = [];
  for (const { key } of blobs) {
    const v = await store.get(key, { type: 'json' });
    if (!v) continue;
    items.push({ id: key.slice('requests/'.length), expires_at: v.expires_at || null, created_at: v.created_at || null });
  }
  items.sort((a, b) => String(a.expires_at || '').localeCompare(String(b.expires_at || '')));
  const soonest = items.length ? items[0].expires_at : null;
  const daysLeft = soonest ? Math.max(0, Math.floor((new Date(soonest).getTime() - t) / 864e5)) : null;
  return { pending: items.length, soonest_expires_at: soonest, days_left: daysLeft, ids: items.map(i => i.id).join(' ') };
}
