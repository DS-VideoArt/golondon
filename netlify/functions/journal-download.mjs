/*
  יומן המסע לילדים, בטא: הורדת היומן
  ===================================
  GET /journal-download/<download_token>
  אסימון ההורדה של האתר (לא אסימון המסירה של העובד) מתורגם בשרת לקובץ במאגר המסירה המותר לסביבה,
  והקובץ מוזרם כ-application/pdf, attachment, בשם קובץ כללי. אין הפניה לכתובת של Blob, אין מידע אישי
  בכתובת, ואין אסימון בכותרות או ביומן. אסימון חסר, לא מוכר או שפג תוקפו: 404 או 410.
*/
import { getStore } from '@netlify/blobs';
import { storeNameFor } from './journal-beta-request.mjs';
import { handleDownload, deliveryStoreFor } from '../journal-lib/journal-automation.mjs';

export default async (req, context) => {
  const name = deliveryStoreFor(context);
  return handleDownload(req, {
    store: getStore({ name: storeNameFor(context), consistency: 'strong' }),
    deliveryStore: name ? getStore({ name, consistency: 'strong' }) : null,
    deliveryStoreName: name,
    now: () => new Date()
  });
};

export const config = { path: '/journal-download/:token', method: 'GET' };
