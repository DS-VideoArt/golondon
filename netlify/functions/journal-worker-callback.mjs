/*
  יומן המסע לילדים, בטא: תוצאה חתומה מעובד ההפקה
  ===============================================
  POST ‎/.netlify/functions/journal-worker-callback‎
    X-Journal-Signature: sha256=<HMAC-SHA256 של הגוף הגולמי בדיוק, במפתח JOURNAL_CALLBACK_SECRET>
    X-Journal-Worker:    journal-worker-<גרסה>
  החתימה נבדקת על הבתים לפני פענוח, בהשוואה בזמן קבוע. תוצאה מוכנה ותקינה מעבירה את הבקשה ל-ready
  ויוצרת יכולת הורדה אחת. תוצאה חוזרת לא משנה דבר. אסימון המסירה לא יוצא בתשובה ולא ביומן.
  בלי JOURNAL_CALLBACK_SECRET, או בפריסת production (אין מאגר מסירה מותר), הכול נדחה. פירוט ב-BETA_PLAN.md.
*/
import { getStore } from '@netlify/blobs';
import { storeNameFor } from './journal-beta-request.mjs';
import { handleCallback, deliveryStoreFor } from '../journal-lib/journal-automation.mjs';

const env = k => (globalThis.Netlify && Netlify.env ? Netlify.env.get(k) : process.env[k]);

export default async (req, context) => {
  const name = deliveryStoreFor(context);
  const res = await handleCallback(req, {
    store: getStore({ name: storeNameFor(context), consistency: 'strong' }),
    deliveryStore: name ? getStore({ name, consistency: 'strong' }) : null,
    deliveryStoreName: name,
    secret: env('JOURNAL_CALLBACK_SECRET') || '',
    now: () => new Date()
  });
  console.log('journal callback', res.status);   /* קוד HTTP בלבד */
  return res;
};
