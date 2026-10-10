/*
  טעינת גוגל אנליטיקס (GA4) רק באתר האמיתי
  =========================================
  זה המקום היחיד שבו מוגדר תג GA4 של האתר. כל עמוד טוען את הקובץ הזה בראש ה-head,
  בסקריפט רגיל, לא async ולא defer, כדי ש-gtag יהיה מוגדר לפני כל סקריפט אחר בעמוד.

  מה הוא עושה:
    1. מגדיר את dataLayer ואת gtag בכל כתובת, כמו התג המקורי. כל קריאה ל-gtag
       בעמוד, כולל analytics.js, ממשיכה לעבוד ופשוט נרשמת ב-dataLayer.
    2. את ספריית גוגל, היחידה ששולחת נתונים, הוא טוען רק ב-https://golondon.co.il.
       www.golondon.co.il ו-http מפנים לשם ב-301, ולכן זו הכתובת היחידה שגולשים
       אמיתיים רואים. golondon.netlify.app, תצוגות מקדימות של נטליפיי, localhost
       ו-127.0.0.1 לא טוענים את הספרייה ולא שולחים כלום.
    3. מתג כיבוי לבדיקות: אם window['ga-disable-G-QWWEWYZWCK'] כבר הוגדר לפני
       שהקובץ נטען, הספרייה לא נטענת גם באתר האמיתי. docs/qa/no-analytics.js
       מגדיר אותו לפני כל עמוד שבדיקה אוטומטית פותחת.

  בכתובת שאינה האתר האמיתי המתג מוגדר גם הוא, כך שגם אם הספרייה תיטען בדרך
  אחרת, gtag לא ישלח.
*/
(function () {
  var ID = 'G-QWWEWYZWCK';
  var PRODUCTION_HOST = 'golondon.co.il';

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  var live = location.protocol === 'https:' && location.hostname === PRODUCTION_HOST;
  if (!live) window['ga-disable-' + ID] = true;

  window.gtag('js', new Date());
  window.gtag('config', ID);

  if (window['ga-disable-' + ID]) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);
})();
