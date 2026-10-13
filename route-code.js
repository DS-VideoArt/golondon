/*
  קוד המסלול, המקור היחיד לייצוג של מסלול
  ========================================
  מסלול הוא רשימה מסודרת של ימים, וכל יום הוא רשימה מסודרת של מקומות. לכל מקום ב
  planner-data.json יש קוד קבוע בן שני תווים (build_plan_codes.py), שלעולם לא משתנה
  ולא ממוחזר. הקוד של מסלול הוא הקודים של כל יום ברצף, והימים מופרדים בנקודה:

    AAABAC.ADAE   יום 1: AA, AB, AC   יום 2: AD, AE

  זה מה שיושב אחרי ‎/t/‎ בקישור השיתוף, וזה גם הקלט של כל פלט אחר: המתכנן שעל המסך,
  הודעת הוואטסאפ, ההעתקה וההדפסה, וכל פלט שיתווסף בהמשך. כך כולם מציגים את אותו מסלול בדיוק.

  שלושה כללים:
  1. סדר הימים וסדר המקומות בתוך יום נשמרים כמו שהם.
  2. יום ריק לא קיים בפלט. הוא יוצא לפני המספור, ולכן תוכנית פנימית של יום 1, יום 2
     ריק ויום 3 יוצאת בכל הפלטים כיום 1 ויום 2 (normalizeDays).
  3. קישור ישן ממשיך לעבוד. הפענוח סלחני בדיוק כמו קודם: קוד שלא מוכר מדולג, תו
     בודד בסוף יום מדולג, ויום שלא נשאר בו כלום יוצא.

  עובד בדפדפן (window.GoLondonRouteCode) וב-Node (require), בלי תלויות.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GoLondonRouteCode = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CODE_LENGTH = 2;
  var SHORT_BASE = 'https://golondon.co.il/t/';
  /*
    הקישור מתוך חוברת הטיול (QR וקישור מודפס). אותו קוד בדיוק, נתיב אחר: ההפניה של
    ‎/t/‎ מתייגת כל כניסה כוואטסאפ, ו-‎/tp/‎ מתייגת אותה כחוברת הטיול (_redirects).
  */
  var PACK_BASE = 'https://golondon.co.il/tp/';
  var PLANNER_URL = 'https://golondon.co.il/planner';

  /* ימים ריקים יוצאים, הסדר נשמר. המספור של הפלט הוא המיקום ברשימה שחוזרת, פלוס אחד */
  function normalizeDays(days) {
    return (days || []).filter(function (d) { return Array.isArray(d) && d.length > 0; });
  }

  /*
    days: מערך של ימים, כל יום מערך של מקומות (אובייקטים או מזהים).
    codeOf: מחזיר את הקוד של מקום, או ריק אם אין לו קוד. מקום בלי קוד לא נכנס לקישור,
    ויום שלא נשאר בו קוד לא נכנס בכלל, כמו קודם.
  */
  function encode(days, codeOf) {
    return (days || []).map(function (d) {
      return (d || []).map(function (x) { return codeOf(x) || ''; }).join('');
    }).filter(function (chunk) { return chunk; }).join('.');
  }

  /*
    str: הקוד שאחרי ‎/t/‎ (או הפרמטר p במתכנן). idOf: מחזיר מזהה מקום לפי קוד, או ריק.
    מחזיר מערך של ימים, כל יום מערך של מזהים, בלי ימים ריקים.
  */
  function decode(str, idOf) {
    return normalizeDays(String(str || '').split('.').map(function (chunk) {
      var ids = [];
      for (var i = 0; i + CODE_LENGTH <= chunk.length; i += CODE_LENGTH) {
        var id = idOf(chunk.substr(i, CODE_LENGTH));
        if (id) ids.push(id);
      }
      return ids;
    }));
  }

  /* הקישור הקצר למסלול, או למתכנן הריק כשאין מה לקודד. channel "pack" לקישורים מתוך החוברת */
  function link(code, channel) {
    if (!code) return PLANNER_URL;
    return (channel === 'pack' ? PACK_BASE : SHORT_BASE) + code;
  }

  /* הצורה שהמתכנן מקבל בפרמטר p. בודק צורה בלבד, לא שהקודים קיימים */
  function isWellFormed(str) {
    return /^[A-Za-z0-9.]+$/.test(String(str || ''));
  }

  return {
    CODE_LENGTH: CODE_LENGTH,
    normalizeDays: normalizeDays,
    encode: encode,
    decode: decode,
    link: link,
    isWellFormed: isWellFormed
  };
});
