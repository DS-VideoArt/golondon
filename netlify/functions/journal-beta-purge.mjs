/*
  יומן המסע לילדים, בטא: מחיקה יומית של מידע הבקשות
  ==================================================
  ל-Netlify Blobs אין תפוגה מובנית, ולכן הפונקציה הזאת רצה פעם ביום (scheduled function) ומוחקת:
    requests/<id>   הבקשה: מייל, שם פרטי, קוד מסלול, דגל משפחה, מצב        אחרי 7 ימים מיצירתה
    dedupe/<hmac>   מפתח הבקשה הכפולה                                       אחרי 7 ימים מיצירתו
  לא נמחק: slots/NN, שמכיל רק מזהה אקראי ותאריך ומשמש כספירת המכסה.
  המפעיל מוחק בקשה מיד אחרי שהיומן נשלח (docs/journal-beta/BETA_PLAN.md), והמחיקה כאן היא הרשת
  שמבטיחה שגם בקשה שנשכחה לא נשמרת יותר מ-7 ימים ועוד יום ריצה אחד לכל היותר.
*/
import { getStore } from '@netlify/blobs';
import { storeNameFor, RETENTION_DAYS } from './journal-beta-request.mjs';

export async function purge(store, now) {
  const limit = (now || new Date()).getTime() - RETENTION_DAYS * 864e5;
  const deleted = { requests: 0, dedupe: 0 };
  for (const prefix of ['requests/', 'dedupe/']) {
    const { blobs } = await store.list({ prefix });
    for (const { key } of blobs) {
      const v = await store.get(key, { type: 'json' });
      const created = v && v.created_at ? new Date(v.created_at).getTime() : 0;   /* בלי תאריך: נמחק */
      if (!created || created <= limit) {
        await store.delete(key);
        deleted[prefix === 'requests/' ? 'requests' : 'dedupe']++;
      }
    }
  }
  return deleted;
}

/* בפריסה האמיתית המחיקה רצה על journal-beta; בתצוגה מקדימה (Run now) על מאגר הבדיקות */
export default async (req, context) => {
  const deleted = await purge(getStore({ name: storeNameFor(context), consistency: 'strong' }));
  /* ספירה בלבד, בלי מפתחות ובלי תוכן, כדי שאין מידע אישי ביומן הריצה */
  console.log('journal-beta purge', JSON.stringify(deleted));
  return new Response(null, { status: 204 });
};

export const config = { schedule: '@daily' };
