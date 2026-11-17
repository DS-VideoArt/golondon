/*
  יומן המסע לילדים, בטא: תיאום מול מאגר המסירה
  =============================================
  העובד מנסה callback פעם אחת בלבד. הפונקציה המתוזמנת הזאת עוברת רק על בקשות בטא שממתינות להפקה, קוראת
  index/<request_id> במאגר המסירה של הסביבה בלבד (תצוגה מקדימה: journal-delivery-preview), וסוגרת תוצאה
  מוכנה באותה בדיקה ובאותה סגירה של ה-callback. שליחה שנכשלה נשלחת שוב עם אותו request_id.
  בפריסת production אין מאגר מסירה מותר, ולכן היא לא עושה דבר. ביומן: ספירות בלבד.
  כל 15 דקות (UTC). פונקציות מתוזמנות רצות רק בפריסה שפורסמה; בתצוגה מקדימה מפעילים ידנית (Run now).
*/
import { getStore } from '@netlify/blobs';
import { storeNameFor } from './journal-beta-request.mjs';
import { reconcile, deliveryStoreFor, dispatcherFor } from '../journal-lib/journal-automation.mjs';

const env = k => (globalThis.Netlify && Netlify.env ? Netlify.env.get(k) : process.env[k]);

export default async (req, context) => {
  const name = deliveryStoreFor(context);
  const counts = await reconcile({
    store: getStore({ name: storeNameFor(context), consistency: 'strong' }),
    deliveryStore: name ? getStore({ name, consistency: 'strong' }) : null,
    deliveryStoreName: name,
    dispatcher: dispatcherFor(context, env('JOURNAL_GITHUB_DISPATCH_TOKEN')),
    now: () => new Date(),
    deadline: Date.now() + 20000
  });
  console.log('journal-beta reconcile', JSON.stringify(counts));
  return new Response(null, { status: 204 });
};

export const config = { schedule: '*/15 * * * *' };
