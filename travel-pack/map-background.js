/*
  רקע המפה בחוברת הטיול: נקודת חיבור אחת לספק
  =============================================
  הספק נותן רק את רקע המפה. כל מה שמסומן על המפה (סיכות ממוספרות, סיכה משוערת, קו סדר
  הביקור, נקודות כפולות, קנה מידה וחץ צפון) שייך לגו לונדון ויושב ב-map-overlay.js. לכן
  החלפת ספק לא נוגעת בסימון, ואין כאן שום סמן של ספק.

  ספק הוא אובייקט:
    id           מזהה קצר
    attribution  שורת הייחוס שמודפסת בבלוק הסגירה (חובה לכל ספק שמבוסס על נתוני מפה)
    render(view) מחזיר HTML של הרקע בגודל view.width על view.height פיקסלים, מתוך
                 view.lat, view.lng, view.zoom בלבד (הטלת Web Mercator, אריחים של 256).

  staticImage יוצר ספק מכל שירות תמונות מפה סטטיות: מקבל פונקציה שבונה כתובת תמונה
  מהמרכז, הזום והגודל. המפתח של שירות כזה לא יגיע לדפדפן: הכתובת תצביע על נתיב שרת
  של האתר שמוסיף אותו. אף ספק אמיתי לא מחובר עד שיש אישור רישוי בכתב.

  הספק הפעיל נבחר ב-travel-pack.html (data-map-provider על html). ברירת המחדל היא
  "prototype", הרקע הזמני לבדיקה.
*/
(function (root) {
  'use strict';

  var providers = {};

  function register(p) {
    if (!p || !p.id || typeof p.render !== 'function') throw new Error('map provider needs id and render(view)');
    providers[p.id] = p;
    return p;
  }

  function get(id) {
    return providers[id] || providers.prototype || null;
  }

  /* ספק גנרי לתמונת מפה סטטית. ‎@2x כשהשירות תומך, כדי שההדפסה תהיה חדה */
  function staticImage(opts) {
    return {
      id: opts.id,
      attribution: opts.attribution,
      render: function (view) {
        var src = opts.url({ lat: view.lat, lng: view.lng, zoom: view.zoom, width: view.width, height: view.height, scale: opts.scale || 2 });
        return '<img class="tp-bg-img" src="' + String(src).replace(/"/g, '&quot;') + '" width="' + view.width + '" height="' + view.height + '" alt="" decoding="sync"/>';
      }
    };
  }

  root.GoLondonMapBackgrounds = { register: register, get: get, staticImage: staticImage };
})(typeof self !== 'undefined' ? self : this);
