/*
  בדיקה קפדנית של קוד מסלול לבקשת יומן המסע (בטא)
  ================================================
  הפענוח של ‎/t/‎ (route-code.js) סלחני בכוונה: קוד שלא מוכר מדולג, תו בודד בסוף יום מדולג,
  כדי שקישור ישן ימשיך להיפתח. לבקשת יומן זה אסור: יומן שחסר בו מקום בשקט הוא יומן של מסלול אחר.
  לכן כאן כל קוד חייב להיות מוכר, ושום דבר לא מדולג. אותו קובץ רץ בעמוד ובשרת, כך שהבדיקה זהה.

  כללים:
    מבנה    ימים מופרדים בנקודה, כל יום רצף של קודים בני שני תווים (אותיות ספרות), בלי יום ריק,
            בלי תו עודף ובלי תו אחר
    מקומות  כל קוד קיים בנתוני המתכנן. מקום סגור נשאר במקומו ומסומן סגור
    גבולות  1 עד 7 ימים, עד 12 עצירות ביום, אותו מקום פעמיים באותו יום אסור, לפחות מקום פתוח אחד
  מחזיר { ok: true, days: [[{ id, code, name, closed }]] } או { ok: false, reason }.

  עובד בדפדפן (window.GoLondonJournalRoute) וב-Node (require), בלי תלויות.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GoLondonJournalRoute = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMITS = { minDays: 1, maxDays: 7, maxStopsPerDay: 12, maxLength: 7 * (12 * 2 + 1) };
  var DAY = /^(?:[A-Za-z0-9]{2})+$/;

  function validate(code, attractions) {
    if (typeof code !== 'string' || !code || code.length > LIMITS.maxLength) return { ok: false, reason: 'malformed' };
    var chunks = code.split('.');
    if (chunks.some(function (c) { return !DAY.test(c); })) return { ok: false, reason: 'malformed' };
    if (chunks.length < LIMITS.minDays || chunks.length > LIMITS.maxDays) return { ok: false, reason: 'trip_length' };
    var byCode = {};
    (attractions || []).forEach(function (a) { if (a && a.code) byCode[a.code] = a; });
    var days = [], open = 0;
    for (var d = 0; d < chunks.length; d++) {
      var stops = [], seen = {};
      for (var i = 0; i < chunks[d].length; i += 2) {
        var a = byCode[chunks[d].substr(i, 2)];
        if (!a) return { ok: false, reason: 'unknown_place' };
        if (seen[a.id]) return { ok: false, reason: 'repeated_in_day' };
        seen[a.id] = true;
        if (!a.closed) open++;
        stops.push({ id: a.id, code: a.code, name: a.name, closed: !!a.closed });
      }
      if (stops.length > LIMITS.maxStopsPerDay) return { ok: false, reason: 'stops_per_day' };
      days.push(stops);
    }
    if (!open) return { ok: false, reason: 'no_open_place' };
    return { ok: true, days: days };
  }

  return { validate: validate, LIMITS: LIMITS };
});
