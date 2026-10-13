/*
  עלות הכניסה למקום, מקור אחד לכל האתר
  =====================================
  מחזיר מצב קבוע לכל מקום ב-planner-data.json, בלי לקרוא טקסט בעברית:

    free         אפשר לבקר בלי לשלם (כולל "צפייה מבחוץ" ו"כניסה חינם בהזמנה מראש")
    partly_paid  חלק מהמקום חינם וחלק בתשלום, למשל בקינגהאם: החילופים חינם, הארמון בתשלום
    paid         כרטיס בתשלום, או מקום שהביקור בו כרוך בהוצאה (מסעדה, בר, בית קפה)

  מקור המצב:
  1. השדה access במקום, אם קיים ותקין. כרגע הוא קיים רק בחמשת המקומות שבהם החלק
     החינמי והחלק שבתשלום שונים מהותית (access: "partly_paid").
  2. אחרת השדה free: true הוא free, false הוא paid.

  השדות partlyPaid ו-attrs "partly-paid" לא משמשים כאן: הם מסמנים גם מוזיאונים שהכניסה
  אליהם חינם ורק תערוכות מסוימות בתשלום, ואינם עקביים בין עצמם.
  ההתאמה בין access לטקסט המחיר נבדקת בבדיקת נתונים (docs/qa/access-cost-lint.js),
  לא כאן. מקום חדש שהטקסט שלו אומר "חלק בתשלום" בלי access ייכשל שם.

  משמש את חוברת הטיול, ובהמשך גם את סיכומי המתכנן. דפדפן: window.GoLondonAccessCost,
  Node: require('./access-cost.js').
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GoLondonAccessCost = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATES = ['free', 'partly_paid', 'paid'];

  function status(place) {
    if (place && STATES.indexOf(place.access) !== -1) return place.access;
    return place && place.free ? 'free' : 'paid';
  }

  /* ספירה לפי מצב, לסיכומים של יום או של מסלול */
  function count(places) {
    var n = { free: 0, partly_paid: 0, paid: 0 };
    (places || []).forEach(function (p) { n[status(p)]++; });
    return n;
  }

  /* מסלול נחשב חינמי רק אם כל המקומות בו free */
  function allFree(places) {
    var n = count(places);
    return n.partly_paid === 0 && n.paid === 0 && (places || []).length > 0;
  }

  return { STATES: STATES, status: status, count: count, allFree: allFree };
});
