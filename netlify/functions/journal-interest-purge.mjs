/*
  חוברת הטיול לילדים, ניסוי ביקוש: מחיקה יומית של רשומות ההתעניינות
  ===================================================================
  ל-Netlify Blobs אין תפוגה מובנית, ולכן פעם ביום (scheduled function) נמחקות רשומות interest/<hash> שפג
  תוקפן (90 יום מהמילוי, expires_at ברשומה) או שאין להן תאריך. רק במאגר ההתעניינות של הקשר הפריסה הזה
  (production: journal-interest; כל השאר: journal-interest-preview). ביומן: ספירה בלבד.
  פונקציות מתוזמנות רצות רק בפריסה שפורסמה; בתצוגה מקדימה מפעילים ידנית (Run now).
*/
import { getStore } from '@netlify/blobs';
import { purgeInterest, storeNameFor } from './journal-interest.mjs';

export default async (req, context) => {
  const deleted = await purgeInterest(getStore({ name: storeNameFor(context), consistency: 'strong' }), new Date());
  console.log('journal-interest purge', JSON.stringify({ interest: deleted }));
  return new Response(null, { status: 204 });
};

export const config = { schedule: '@daily' };
