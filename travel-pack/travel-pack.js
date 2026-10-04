/*
  חוברת הטיול, אב טיפוס מקומי (שלב 1)
  ====================================
  העמוד travel-pack.html?p=<קוד מסלול> בונה מסמך A4 מתוך אותו קוד מסלול שיושב אחרי
  ‎/t/‎ בקישור השיתוף. אין כאן מודל מסלול שני: הקוד מפוענח ב-route-code.js, והמקומות
  נקראים מ-planner-data.json, בדיוק כמו במתכנן.

  הזרימה המתוכננת: קוד מסלול, העמוד הזה, דפדפן Chrome ללא ממשק, PDF. בשלב הזה
  ההמרה ל-PDF רצה מקומית (docs/qa/travel-pack-render.js), ולא בשרת.

  מה בונים: שער, עמוד לכל יום (מפה, עצירות ממוספרות, פרטים מעשיים), והערת סיום.
  העמוד מסמן data-pack-ready="1" על html כשהכל מוכן להדפסה, או data-pack-error.

  שום מידע אישי לא נכנס לכאן. הקלט היחיד הוא קוד המסלול, ושום דבר לא נשמר.
*/
(function () {
  'use strict';

  var RC = window.GoLondonRouteCode;
  var MAP = window.GoLondonMapOverlay;
  var BG = window.GoLondonMapBackground;
  var html = document.documentElement;

  /* המפה בעמוד היום: 184 על 84 מילימטר, ב-96 נקודות לאינץ' */
  var MAP_W = 696, MAP_H = 318, MAP_PAD = 42;
  /* קישור ניווט של גוגל מקבל עד 11 נקודות: מוצא, תשע נקודות ביניים ויעד */
  var NAV_MAX_POINTS = 11;

  var HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  var HOUR_WORDS = {
    1: 'כשעה', 2: 'כשעתיים', 3: 'כשלוש שעות', 4: 'כארבע שעות',
    5: 'כחמש שעות', 6: 'כשש שעות', 7: 'כשבע שעות', 8: 'כשמונה שעות'
  };

  /* אותו ניסוח כמו hoursText במתכנן */
  function hoursText(n) {
    n = Math.round((Number(n) || 0) * 2) / 2;
    if (!n) return 'זמן גמיש';
    if (HOUR_WORDS[n]) return HOUR_WORDS[n];
    if (n === 0.5) return 'כחצי שעה';
    if (n === 1.5) return 'כשעה וחצי';
    if (n === 2.5) return 'כשעתיים וחצי';
    if (n % 1 === 0.5) return 'בערך ' + Math.floor(n) + ' וחצי שעות';
    return n + ' שעות בערך';
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function daysWord(n) { return n === 1 ? 'יום אחד' : n + ' ימים'; }
  function stopsWord(n) { return n === 1 ? 'עצירה אחת' : n + ' עצירות'; }
  function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

  /* כותרת היום לפי האזורים של העצירות, באותו סדר שבו הם מופיעים ביום */
  function dayTitle(items, areas) {
    var keys = [];
    items.forEach(function (it) { if (keys.indexOf(it.area) === -1) keys.push(it.area); });
    var names = keys.map(function (k) { return (areas[k] || {}).name || ''; }).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' ו' + names[1];
    return 'יום שמשלב ' + names.length + ' אזורים';
  }

  /*
    קישורי הניווט של היום. אותם כללים כמו dayMapUrl במתכנן (מקום בלי מיקום מדולג,
    נקודה שחוזרת על עצמה ברצף מדולגת), אבל יום ארוך מ-11 נקודות מתחלק לכמה קישורים
    במקום להיחתך בשקט. בשלב 2 שני המימושים יאוחדו לקובץ אחד.
  */
  function navLinks(items) {
    var pts = items.filter(function (it) { return typeof it.lat === 'number' && typeof it.lng === 'number'; })
      .map(function (it) { return round5(it.lat) + ',' + round5(it.lng); });
    pts = pts.filter(function (p, i) { return i === 0 || p !== pts[i - 1]; });
    if (pts.length < 2) return [];
    var links = [];
    for (var start = 0; start < pts.length - 1; start += NAV_MAX_POINTS - 1) {
      var part = pts.slice(start, start + NAV_MAX_POINTS);
      if (part.length < 2) break;
      var u = 'https://www.google.com/maps/dir/?api=1&origin=' + part[0] + '&destination=' + part[part.length - 1];
      if (part.length > 2) u += '&waypoints=' + part.slice(1, -1).join('%7C');
      links.push(u + '&travelmode=walking');
    }
    return links;
  }
  function round5(n) { return String(Math.round(Number(n) * 100000) / 100000); }

  function qrSvg(text) {
    var q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: '', title: '' });
  }

  function pinBadge(n, approx) {
    return '<span class="tp-pin' + (approx ? ' tp-pin--approx' : '') + '" aria-label="עצירה ' + n + (approx ? ', מיקום משוער' : '') + '">' + n + '</span>';
  }

  /* ---------- שער ---------- */
  function renderCover(days, link, areas) {
    var stops = days.reduce(function (n, d) { return n + d.length; }, 0);
    var areaKeys = {};
    days.forEach(function (d) { d.forEach(function (it) { areaKeys[it.area] = true; }); });
    var book = days.reduce(function (n, d) { return n + d.filter(function (it) { return it.bookAhead; }).length; }, 0);
    var now = new Date();

    var rows = days.map(function (d, i) {
      return '<li><span class="tp-cover-day">יום ' + (i + 1) + '</span><span class="tp-cover-area">' + esc(dayTitle(d, areas)) +
        '</span><span class="tp-cover-count">' + stopsWord(d.length) + '</span></li>';
    }).join('');

    return '' +
      '<section class="tp-sheet tp-cover">' +
        '<header class="tp-cover-top"><img class="tp-logo" src="images/logo.png" alt="גו לונדון" width="172" height="96"/>' +
          '<span class="tp-kicker">חוברת טיול אישית</span></header>' +
        '<div class="tp-cover-main">' +
          '<h1>הטיול שלי בלונדון</h1>' +
          '<p class="tp-cover-sub">' + daysWord(days.length) + ', ' + stopsWord(stops) + '</p>' +
          '<dl class="tp-stats">' +
            '<div><dt>ימים</dt><dd>' + days.length + '</dd></div>' +
            '<div><dt>עצירות</dt><dd>' + stops + '</dd></div>' +
            '<div><dt>אזורים</dt><dd>' + Object.keys(areaKeys).length + '</dd></div>' +
            '<div><dt>להזמין מראש</dt><dd>' + book + '</dd></div>' +
          '</dl>' +
          '<ol class="tp-cover-days">' + rows + '</ol>' +
        '</div>' +
        '<div class="tp-cover-qr">' +
          '<a class="tp-qr" href="' + esc(link) + '">' + qrSvg(link) + '</a>' +
          '<div><strong>המסלול החי באתר</strong><p>סורקים כדי לפתוח את אותו מסלול בבונה המסלול, עם מפה וניווט לכל יום. אפשר גם לערוך אותו ולשלוח הלאה.</p>' +
          '<a class="tp-url" href="' + esc(link) + '" dir="ltr">' + esc(link.replace(/^https:\/\//, '')) + '</a></div>' +
        '</div>' +
        '<footer class="tp-cover-foot">נוצר ב־' + now.getDate() + ' ב' + HE_MONTHS[now.getMonth()] + ' ' + now.getFullYear() +
          ' בבונה המסלול של גו לונדון · golondon.co.il</footer>' +
      '</section>';
  }

  /* ---------- יום ---------- */
  function renderDay(items, index, areas) {
    var view = MAP.fit(items, MAP_W, MAP_H, MAP_PAD);
    var lay = view ? MAP.layout(items, view) : { pins: [], segments: [], unmapped: items.map(function (_, i) { return i + 1; }), hasApprox: false, hasFar: false };
    var free = items.filter(function (it) { return it.free; }).length;
    var hours = items.reduce(function (s, it) { return s + (it.hours || 0); }, 0);

    var map = view
      ? '<figure class="tp-map" data-zoom="' + view.zoom + '" data-center="' + view.lat.toFixed(5) + ',' + view.lng.toFixed(5) + '">' +
          '<div class="tp-map-bg">' + BG.render(view) + '</div>' +
          '<div class="tp-map-ov">' + MAP.svg(view, lay) + '</div>' +
        '</figure>'
      : '<div class="tp-map tp-map--none">אין לעצירות של היום הזה מיקום שאפשר לסמן במפה.</div>';

    var legend = '<ul class="tp-legend">' +
      '<li><span class="tp-pin tp-pin--sm">1</span> מיקום מדויק</li>' +
      (lay.hasApprox ? '<li><span class="tp-pin tp-pin--sm tp-pin--approx">2</span> מיקום משוער של אזור, לא כתובת</li>' : '') +
      '<li><span class="tp-key-line"></span> סדר הביקור: קו ישר בין העצירות, לא מסלול הליכה</li>' +
      (lay.hasFar ? '<li><span class="tp-key-line tp-key-line--far"></span> קטע ארוך, כדאי לנסוע</li>' : '') +
      '</ul>';

    var unmapped = lay.unmapped.length
      ? '<p class="tp-unmapped">לא מסומנות במפה: עצירה ' + lay.unmapped.join(', ') + '.</p>' : '';

    var stops = items.map(function (it, i) {
      var approx = it.precision === 'approx';
      var facts = [
        '<span class="tp-fact"><b>תחנה</b> <bdi dir="ltr">' + esc(it.tube) + '</bdi></span>',
        '<span class="tp-fact"><b>זמן</b> ' + esc(hoursText(it.hours)) + '</span>',
        '<span class="tp-fact ' + (it.free ? 'tp-fact--free' : 'tp-fact--paid') + '">' + esc(it.priceBand || (it.free ? 'כניסה חינם' : 'בתשלום')) + '</span>'
      ];
      if (it.bookAhead) facts.push('<span class="tp-fact tp-fact--book">להזמין מראש</span>');
      if (approx) facts.push('<span class="tp-fact tp-fact--approx">מיקום משוער</span>');
      var site = it.source ? '<a class="tp-link" href="' + esc(it.source) + '">אתר רשמי: <bdi dir="ltr">' + esc(domainOf(it.source)) + '</bdi></a>' : '';
      return '<li class="tp-stop">' + pinBadge(i + 1, approx) +
        '<div class="tp-stop-body">' +
          '<div class="tp-stop-name"><strong>' + esc(it.name) + '</strong> <bdi class="tp-en" dir="ltr">' + esc(it.nameEn) + '</bdi></div>' +
          '<div class="tp-facts">' + facts.join('') + site + '</div>' +
          (it.tip ? '<p class="tp-tip">' + esc(it.tip) + '</p>' : '') +
        '</div></li>';
    }).join('');

    var nav = navLinks(items);
    var navHtml = nav.length
      ? '<p class="tp-nav">' + nav.map(function (u, k) {
          return '<a class="tp-link tp-link--nav" href="' + esc(u) + '">' + (nav.length > 1 ? 'ניווט ביום, חלק ' + (k + 1) + ' מתוך ' + nav.length : 'פתיחת היום בניווט של גוגל מפות, לפי הסדר') + '</a>';
        }).join('') + '</p>'
      : '';

    return '' +
      '<section class="tp-sheet tp-day">' +
        '<header class="tp-day-head"><span class="tp-day-num">' + (index + 1) + '</span>' +
          '<div><p class="tp-day-kicker">יום ' + (index + 1) + '</p><h2>' + esc(dayTitle(items, areas)) + '</h2>' +
          '<p class="tp-day-meta">' + stopsWord(items.length) + ', ' + hoursText(hours) + ', ' +
            (free === items.length ? 'כולן בלי תשלום כניסה' : free + ' מהן בלי תשלום כניסה') + '</p></div></header>' +
        map + legend + unmapped +
        '<ol class="tp-stops">' + stops + '</ol>' + navHtml +
      '</section>';
  }

  /* ---------- סיום ---------- */
  function renderFinal(link, bgAttribution) {
    return '' +
      '<section class="tp-final">' +
        '<h2>לפני שיוצאים</h2>' +
        '<p>המסלול הזה הוא נקודת פתיחה, לא חוזה. שעות הפתיחה והמחירים משתנים מעת לעת, ולכן שווה לוודא באתר הרשמי של כל מקום ביום שלפני. מקומות שמסומנים "להזמין מראש" נגמרים לעיתים שבועות מראש.</p>' +
        '<p class="tp-final-link">המסלול החי, עם מפה וניווט לכל יום: <a href="' + esc(link) + '" dir="ltr">' + esc(link.replace(/^https:\/\//, '')) + '</a></p>' +
        '<p class="tp-final-small">' + esc(bgAttribution) + '. המספרים במפה הם מספרי העצירות ברשימה.</p>' +
      '</section>';
  }

  function fail(code, message) {
    el('pack').innerHTML = '<section class="tp-sheet tp-error"><h1>לא הצלחנו לבנות את החוברת</h1><p>' + esc(message) + '</p>' +
      '<p><a href="/planner">חזרה לבונה המסלול</a></p></section>';
    html.setAttribute('data-pack-error', code);
  }

  function run() {
    var m = /[?&]p=([^&#]*)/.exec(location.search);
    var code = m ? decodeURIComponent(m[1]) : '';
    if (!code || !RC.isWellFormed(code)) { fail('bad_code', 'הקישור לא כולל קוד מסלול תקין.'); return; }

    fetch('planner-data.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('data ' + r.status); return r.json(); })
      .then(function (data) {
        var byCode = {}, byId = {};
        data.attractions.forEach(function (a) { byId[a.id] = a; if (a.code) byCode[a.code] = a.id; });
        var dayIds = RC.decode(code, function (c) { return byCode[c]; });
        if (!dayIds.length) { fail('empty_route', 'המקומות שבקישור הזה כבר לא זמינים.'); return; }
        var days = dayIds.map(function (ids) { return ids.map(function (id) { return byId[id]; }); });
        /* הקוד הקנוני של מה שבאמת הוצג, לקישור ול-QR: אותו מסלול, בלי קודים שלא מוכרים */
        var canonical = RC.encode(days, function (it) { return it.code; });
        var link = RC.link(canonical);

        var out = renderCover(days, link, data.areas);
        days.forEach(function (d, i) { out += renderDay(d, i, data.areas); });
        out += renderFinal(link, BG.attribution);
        el('pack').innerHTML = out;
        document.title = 'הטיול שלי בלונדון, ' + daysWord(days.length) + ' | גו לונדון';
        html.setAttribute('data-route-code', canonical);

        return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
          var imgs = [].slice.call(document.images).map(function (img) {
            return img.complete ? null : new Promise(function (res) { img.onload = img.onerror = res; });
          }).filter(Boolean);
          return Promise.all(imgs);
        }).then(function () { html.setAttribute('data-pack-ready', '1'); });
      })
      .catch(function (err) {
        fail('load_failed', 'נתוני המקומות לא נטענו. נסו לרענן את העמוד.');
        if (window.console) console.error('[travel-pack]', err);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
