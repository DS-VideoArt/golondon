/*
  מפת היום בחוברת הטיול: שכבת העל של גו לונדון
  ==============================================
  המפה בנויה משתי שכבות נפרדות:

  1. רקע. תמונה של המפה עצמה, בלי שום סימון. בגרסה הזאת זה רקע זמני לבדיקה
     (prototype-background.js). בהמשך זה יהיה ספק מפות שאפשר להחליף. הרקע מקבל רק
     מרכז, זום וגודל, בדיוק מה שכל ספק תמונות מפה סטטיות מקבל.
  2. שכבת על, שלנו בלבד, והיא הקובץ הזה: הסיכות הממוספרות, קו סדר הביקור, סימון
     מיקום משוער, טיפול בנקודות כפולות, סרגל קנה מידה וחץ צפון.

  הסיכות לא תלויות באף ספק: אין כאן סמנים של ספק, ולכן החלפת הרקע לא משנה אותן.
  שתי השכבות משתמשות באותה הטלה (Web Mercator, אריחים של 256 פיקסלים), ולכן סיכה
  יושבת על אותה נקודה בכל רקע שמקבל את אותו מרכז וזום.

  כללים שלא מתפשרים עליהם:
  - המספר על הסיכה הוא מספר העצירה ברשימה, תמיד. עצירה בלי מיקום לא מקבלת סיכה,
    והמספר שלה לא עובר לעצירה אחרת.
  - מיקום משוער (precision: "approx") מקבל סיכה חלולה, לא סיכה מלאה.
  - שתי עצירות על אותה נקודה בדיוק מקבלות סיכה אחת עם שני המספרים, למשל 3·4.
  - סיכות שנוגעות זו בזו מוזזות מעט, עם קו דק אל הנקודה האמיתית.
  - הקו בין העצירות הוא קו ישר מקווקו של סדר הביקור. הוא לא מסלול הליכה, והמקרא
    אומר את זה במפורש. קטע ארוך מ-FAR_KM מסומן כקטע נסיעה.

  עובד בדפדפן (window.GoLondonMapOverlay) וב-Node (require), בלי תלויות.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GoLondonMapOverlay = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TILE = 256;
  var MAX_ZOOM = 16;
  var SINGLE_ZOOM = 15;
  var ZOOM_STEP = 0.25;
  var FAR_KM = 2.5;
  var PIN_R = 11;

  /* ---------- הטלה ---------- */

  function worldX(lng) { return (lng + 180) / 360 * TILE; }
  function worldY(lat) {
    var s = Math.sin(lat * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE;
  }
  function lngOf(x) { return x / TILE * 360 - 180; }
  function latOf(y) {
    var n = Math.PI - 2 * Math.PI * y / TILE;
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function hasCoord(p) { return p && typeof p.lat === 'number' && typeof p.lng === 'number' && isFinite(p.lat) && isFinite(p.lng); }

  /*
    מרכז וזום שמכילים את כל הנקודות בתוך width x height פיקסלים, עם שוליים. הזום
    מעוגל כלפי מטה ל-ZOOM_STEP, כדי שהרקע והשכבה יקבלו בדיוק את אותו ערך.
  */
  function fit(points, width, height, padding) {
    var pts = (points || []).filter(hasCoord);
    if (!pts.length) return null;
    var xs = pts.map(function (p) { return worldX(p.lng); });
    var ys = pts.map(function (p) { return worldY(p.lat); });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var zoom;
    if (maxX - minX < 1e-9 && maxY - minY < 1e-9) {
      zoom = SINGLE_ZOOM;
    } else {
      var zx = (maxX - minX) > 0 ? Math.log((width - 2 * padding) / (maxX - minX)) / Math.LN2 : MAX_ZOOM;
      var zy = (maxY - minY) > 0 ? Math.log((height - 2 * padding) / (maxY - minY)) / Math.LN2 : MAX_ZOOM;
      zoom = Math.min(zx, zy, MAX_ZOOM);
      zoom = Math.floor(zoom / ZOOM_STEP) * ZOOM_STEP;
    }
    return { lat: latOf(cy), lng: lngOf(cx), zoom: zoom, width: width, height: height };
  }

  /* מנקודה גיאוגרפית לפיקסל בתוך המפה */
  function project(view, lat, lng) {
    var k = Math.pow(2, view.zoom);
    return {
      x: view.width / 2 + (worldX(lng) - worldX(view.lng)) * k,
      y: view.height / 2 + (worldY(lat) - worldY(view.lat)) * k
    };
  }

  /* מטרים לפיקסל בקו הרוחב של המרכז */
  function metersPerPixel(view) {
    return 156543.03392 * Math.cos(view.lat * Math.PI / 180) / Math.pow(2, view.zoom);
  }

  function km(a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* ---------- פריסה ---------- */

  /*
    stops: העצירות של היום לפי הסדר, כל אחת { lat, lng, precision }. המספר של עצירה
    הוא המיקום שלה ברשימה פלוס אחד, גם אם לחלק מהעצירות אין מיקום.
    מחזיר את הסיכות, הקטעים, ומה שלא סומן במפה.
  */
  function layout(stops, view) {
    var groups = {}, order = [], unmapped = [];
    (stops || []).forEach(function (s, i) {
      var n = i + 1;
      if (!hasCoord(s)) { unmapped.push(n); return; }
      var key = s.lat.toFixed(5) + ',' + s.lng.toFixed(5);
      if (!groups[key]) {
        groups[key] = { key: key, lat: s.lat, lng: s.lng, numbers: [], approx: false };
        order.push(key);
      }
      groups[key].numbers.push(n);
      if (s.precision === 'approx') groups[key].approx = true;
    });

    var pins = order.map(function (k) {
      var g = groups[k];
      var p = project(view, g.lat, g.lng);
      return { numbers: g.numbers, label: g.numbers.join('·'), approx: g.approx, lat: g.lat, lng: g.lng,
        x: p.x, y: p.y, tx: p.x, ty: p.y, moved: false };
    });

    /* סיכות שנוגעות זו בזו: הסיכה המאוחרת זזה החוצה, עם קו אל הנקודה האמיתית */
    for (var i = 0; i < pins.length; i++) {
      for (var guard = 0; guard < 12; guard++) {
        var clash = null;
        for (var j = 0; j < i; j++) {
          var dx = pins[i].x - pins[j].x, dy = pins[i].y - pins[j].y;
          var need = radius(pins[i]) + radius(pins[j]) + 2;
          if (dx * dx + dy * dy < need * need) { clash = { j: j, dx: dx, dy: dy, need: need }; break; }
        }
        if (!clash) break;
        var d = Math.sqrt(clash.dx * clash.dx + clash.dy * clash.dy);
        var ux = d > 0.01 ? clash.dx / d : 0.7071, uy = d > 0.01 ? clash.dy / d : -0.7071;
        pins[i].x = pins[clash.j].x + ux * clash.need;
        pins[i].y = pins[clash.j].y + uy * clash.need;
        pins[i].moved = true;
      }
    }

    /* קטעי סדר הביקור, בין נקודות עוקבות שונות, לפי הסדר */
    var mapped = (stops || []).filter(hasCoord);
    var segments = [];
    for (var s = 1; s < mapped.length; s++) {
      var a = mapped[s - 1], b = mapped[s];
      if (a.lat.toFixed(5) === b.lat.toFixed(5) && a.lng.toFixed(5) === b.lng.toFixed(5)) continue;
      var pa = project(view, a.lat, a.lng), pb = project(view, b.lat, b.lng);
      segments.push({ x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, km: km(a, b), far: km(a, b) > FAR_KM });
    }
    return { pins: pins, segments: segments, unmapped: unmapped, hasApprox: pins.some(function (p) { return p.approx; }),
      hasFar: segments.some(function (g) { return g.far; }) };
  }

  function radius(pin) { return pin.label.length > 2 ? PIN_R + 5 : PIN_R; }

  /* ---------- ציור ---------- */

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function niceScale(view, maxPx) {
    var mpp = metersPerPixel(view), steps = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
    var best = steps[0];
    steps.forEach(function (m) { if (m / mpp <= maxPx) best = m; });
    return { meters: best, px: best / mpp, label: best >= 1000 ? (best / 1000) + ' ק״מ' : best + ' מטר' };
  }

  /* שכבת העל כ-SVG, באותו גודל כמו הרקע */
  function svg(view, lay) {
    var W = view.width, H = view.height, out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" class="tp-overlay" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">');
    out.push('<defs><marker id="tp-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">' +
      '<path d="M1,1 L9,5 L1,9" fill="none" stroke="#3b3a46" stroke-width="1.6"/></marker></defs>');

    /* קו סדר הביקור: קו ישר מקווקו עם חץ באמצע כל קטע, לא מסלול */
    lay.segments.forEach(function (g) {
      var mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
      out.push('<path class="tp-order' + (g.far ? ' tp-order--far' : '') + '" d="M' + r(g.x1) + ',' + r(g.y1) + ' L' + r(mx) + ',' + r(my) + ' L' + r(g.x2) + ',' + r(g.y2) + '" ' +
        'fill="none" stroke="#3b3a46" stroke-opacity="' + (g.far ? '0.45' : '0.7') + '" stroke-width="1.6" stroke-dasharray="' + (g.far ? '2 5' : '6 4') + '" ' +
        'stroke-linecap="round" marker-mid="url(#tp-arrow)"/>');
    });

    /* קווי הובלה מסיכה שזזה אל הנקודה האמיתית */
    lay.pins.forEach(function (p) {
      if (!p.moved) return;
      out.push('<line x1="' + r(p.tx) + '" y1="' + r(p.ty) + '" x2="' + r(p.x) + '" y2="' + r(p.y) + '" stroke="#DC2626" stroke-width="1.2"/>' +
        '<circle cx="' + r(p.tx) + '" cy="' + r(p.ty) + '" r="2.4" fill="#DC2626"/>');
    });

    /* הסיכות: מלאה למיקום מדויק, חלולה עם טבעת מקווקוות למיקום משוער */
    lay.pins.forEach(function (p) {
      var rad = radius(p), w = p.label.length > 2 ? rad * 2 + 8 : rad * 2;
      var shape = p.label.length > 2
        ? '<rect x="' + r(p.x - w / 2) + '" y="' + r(p.y - rad) + '" width="' + r(w) + '" height="' + r(rad * 2) + '" rx="' + rad + '"'
        : '<circle cx="' + r(p.x) + '" cy="' + r(p.y) + '" r="' + rad + '"';
      if (p.approx) {
        out.push(shape + ' fill="#ffffff" stroke="#DC2626" stroke-width="2.2" stroke-dasharray="3.2 2.2"/>');
        out.push('<text x="' + r(p.x) + '" y="' + r(p.y) + '" class="tp-pin-n" fill="#B91C1C">' + esc(p.label) + '</text>');
      } else {
        out.push(shape + ' fill="#DC2626" stroke="#ffffff" stroke-width="2"/>');
        out.push('<text x="' + r(p.x) + '" y="' + r(p.y) + '" class="tp-pin-n" fill="#ffffff">' + esc(p.label) + '</text>');
      }
    });

    /* סרגל קנה מידה וחץ צפון, בפינה השמאלית התחתונה */
    var sc = niceScale(view, W * 0.22), x0 = 14, y0 = H - 16;
    out.push('<g class="tp-scale"><rect x="' + (x0 - 6) + '" y="' + (y0 - 22) + '" width="' + r(sc.px + 12) + '" height="30" rx="4" fill="#ffffff" fill-opacity="0.85"/>' +
      '<path d="M' + x0 + ',' + (y0 - 4) + ' L' + x0 + ',' + y0 + ' L' + r(x0 + sc.px) + ',' + y0 + ' L' + r(x0 + sc.px) + ',' + (y0 - 4) + '" fill="none" stroke="#201f2b" stroke-width="1.4"/>' +
      '<text x="' + r(x0 + sc.px / 2) + '" y="' + (y0 - 9) + '" class="tp-scale-t">' + esc(sc.label) + '</text></g>');
    out.push('<g class="tp-north" transform="translate(' + (W - 24) + ',26)"><path d="M0,-12 L6,6 L0,2 L-6,6 Z" fill="#201f2b"/>' +
      '<text x="0" y="17" class="tp-scale-t">N</text></g>');
    out.push('</svg>');
    return out.join('');
  }

  function r(n) { return Math.round(n * 10) / 10; }

  return {
    FAR_KM: FAR_KM,
    fit: fit,
    project: project,
    metersPerPixel: metersPerPixel,
    layout: layout,
    svg: svg
  };
});
