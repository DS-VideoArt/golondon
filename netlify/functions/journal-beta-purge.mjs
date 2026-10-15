/*
  יומן המסע לילדים, בטא: מחיקה יומית של מידע הבקשות
  ==================================================
  ל-Netlify Blobs אין תפוגה מובנית, ולכן הפונקציה הזאת רצה פעם ביום (scheduled function) ומוחקת:
    requests/<id>   הבקשה: מייל, שם פרטי, קוד מסלול, דגל משפחה, מצב        אחרי 7 ימים מיצירתה
    dedupe/<hmac>   מפתח הבקשה הכפולה                                       אחרי 7 ימים מיצירתו
    downloads/<token>  מיפוי אסימון ההורדה לקובץ                            כשפג expires_at שלו
  ובמאגר המסירה של העובד, רק המאגר המותר לסביבה (תצוגה מקדימה: journal-delivery-preview; production: אף אחד):
    pdf/<token>     היומן עצמו                                              כשפג expires_at שבמטא-דאטה
    index/<id>      רשומת המסירה של העובד                                    כשפג expires_at שבה
  תוקף ההורדה לעולם לא מאוחר מתוקף הקובץ ומתוקף הבקשה, ולכן קובץ שעוד אפשר להוריד לא נמחק.
  לא נמחק: slots/NN, שמכיל רק מזהה אקראי ותאריך ומשמש כספירת המכסה.
  המפעיל מוחק בקשה מיד אחרי שהיומן נשלח (docs/journal-beta/BETA_PLAN.md), והמחיקה כאן היא הרשת
  שמבטיחה שגם בקשה שנשכחה לא נשמרת יותר מ-7 ימים ועוד יום ריצה אחד לכל היותר.
*/
import { getStore } from '@netlify/blobs';
import { storeNameFor, RETENTION_DAYS } from './journal-beta-request.mjs';
import { purgeDownloads, purgeDelivery, deliveryStoreFor } from '../journal-lib/journal-automation.mjs';

export async function purge(store, now) {
  const limit = (now || new Date()).getTime() - RETENTION_DAYS * 864e5;
  const deleted = { requests: 0, dedupe: 0, downloads: 0 };
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
  deleted.downloads = await purgeDownloads(store, now || new Date());
  return deleted;
}

/* בפריסה האמיתית המחיקה רצה על journal-beta; בתצוגה מקדימה (Run now) על מאגר הבדיקות */
export default async (req, context) => {
  const now = new Date();
  const deleted = await purge(getStore({ name: storeNameFor(context), consistency: 'strong' }), now);
  const dName = deliveryStoreFor(context);
  deleted.delivery = await purgeDelivery(dName ? getStore({ name: dName, consistency: 'strong' }) : null, dName, now);
  /* ספירה בלבד, בלי מפתחות ובלי תוכן, כדי שאין מידע אישי ביומן הריצה */
  console.log('journal-beta purge', JSON.stringify(deleted));
  return new Response(null, { status: 204 });
};

export const config = { schedule: '@daily' };
