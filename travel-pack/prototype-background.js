/*
  רקע זמני למפת היום, לבדיקה בלבד. לא עולה לאתר.
  ===============================================
  הקובץ הזה קיים רק כדי לבדוק את החוברת לפני שנבחר ספק מפות: את הקומפוזיציה, את
  הסיכות הממוספרות, את סדר הביקור ואת הקריאות בהדפסה. הוא לא מפה ולא מתיימר להיות
  מפה, והוא כותב את זה על עצמו בתוך הרקע.

  מה יש בו: רקע ניטרלי, רשת קווי אורך ורוחב כל 0.005 מעלות, וקו סכמטי של התמזה
  שהוקלד ידנית מכמה נקודות מקורבות. אין בו שום נתון מספק מפות, אין בו אריחים ואין בו
  פנייה לרשת, ולכן אין בו בעיית רישיון.

  נרשם כספק "prototype" בממשק של map-background.js, אותו ממשק שספק אמיתי יקבל, כדי
  שאפשר יהיה להחליף אותו בלי לגעת בשכבת העל.
*/
(function (root) {
  'use strict';

  /* התמזה, סכמטית: נקודות מקורבות מערב למזרח, מצ'לסי ועד גריניץ' */
  var THAMES = [
    [51.4815, -0.1800], [51.4835, -0.1640], [51.4845, -0.1500], [51.4870, -0.1330], [51.4900, -0.1240],
    [51.4955, -0.1215], [51.5008, -0.1210], [51.5062, -0.1195], [51.5086, -0.1160], [51.5097, -0.1080],
    [51.5099, -0.1000], [51.5087, -0.0930], [51.5078, -0.0860], [51.5058, -0.0760], [51.5045, -0.0640],
    [51.5030, -0.0520], [51.5068, -0.0400], [51.5065, -0.0290], [51.4990, -0.0250], [51.4880, -0.0200],
    [51.4840, -0.0080], [51.4880, 0.0000], [51.4990, 0.0040], [51.5070, 0.0080]
  ];

  function render(view) {
    var M = root.GoLondonMapOverlay;
    var W = view.width, H = view.height, out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" class="tp-bg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">');
    out.push('<rect width="' + W + '" height="' + H + '" fill="#f1efe9"/>');

    /* רשת: מה שנכנס למסגרת, כל 0.005 מעלות */
    var nw = latlngAt(view, 0, 0), se = latlngAt(view, W, H), step = 0.005;
    for (var lat = Math.ceil(se.lat / step) * step; lat <= nw.lat; lat += step) {
      var y = M.project(view, lat, view.lng).y;
      out.push('<line x1="0" y1="' + y.toFixed(1) + '" x2="' + W + '" y2="' + y.toFixed(1) + '" stroke="#ddd8cc" stroke-width="0.8"/>');
    }
    for (var lng = Math.ceil(nw.lng / step) * step; lng <= se.lng; lng += step) {
      var x = M.project(view, view.lat, lng).x;
      out.push('<line x1="' + x.toFixed(1) + '" y1="0" x2="' + x.toFixed(1) + '" y2="' + H + '" stroke="#ddd8cc" stroke-width="0.8"/>');
    }

    /* התמזה: רוחב של כמאתיים מטר בקנה המידה של המפה */
    var w = Math.max(4, 200 / M.metersPerPixel(view));
    var d = THAMES.map(function (p, i) { var q = M.project(view, p[0], p[1]); return (i ? 'L' : 'M') + q.x.toFixed(1) + ',' + q.y.toFixed(1); }).join(' ');
    out.push('<path d="' + d + '" fill="none" stroke="#c9dceb" stroke-width="' + w.toFixed(1) + '" stroke-linecap="round" stroke-linejoin="round"/>');

    /* חותמת: זה רקע לבדיקה, לא מפה */
    out.push('<g class="tp-bg-stamp"><rect x="' + (W - 232) + '" y="' + (H - 30) + '" width="222" height="20" rx="4" fill="#ffffff" fill-opacity="0.9" stroke="#b9b3a5" stroke-width="0.8"/>' +
      '<text x="' + (W - 121) + '" y="' + (H - 16) + '" text-anchor="middle" font-size="10.5" fill="#6b6a76" direction="rtl">רקע זמני לבדיקה, לא מפה. התמזה סכמטית</text></g>');
    out.push('</svg>');
    return out.join('');
  }

  /* הנקודה הגיאוגרפית שמתחת לפיקסל, להיפוך ההטלה של השכבה */
  function latlngAt(view, px, py) {
    var k = Math.pow(2, view.zoom), T = 256;
    var cx = (view.lng + 180) / 360 * T, s = Math.sin(view.lat * Math.PI / 180);
    var cy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * T;
    var wx = cx + (px - view.width / 2) / k, wy = cy + (py - view.height / 2) / k;
    var n = Math.PI - 2 * Math.PI * wy / T;
    return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: wx / T * 360 - 180 };
  }

  root.GoLondonMapBackgrounds.register({ id: 'prototype', attribution: 'רקע זמני לבדיקה בלבד, לא מבוסס על נתוני מפה', render: render });
})(typeof self !== 'undefined' ? self : this);
