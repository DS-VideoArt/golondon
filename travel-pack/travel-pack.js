/*
  חוברת הטיול, אב טיפוס מקומי (שלב 1, סבב עיצוב 2)
  ================================================
  העמוד travel-pack.html?p=<קוד מסלול> בונה מסמך A4 מתוך אותו קוד מסלול שיושב אחרי
  ‎/t/‎ בקישור השיתוף. אין כאן מודל מסלול שני: הקוד מפוענח ב-route-code.js, והמקומות
  נקראים מ-planner-data.json, בדיוק כמו במתכנן.

  מבנה המסמך: שער אחד (תמונת מצב של הטיול וסקירת הימים), ואחריו עמוד לכל יום. אין
  עמוד סיום נפרד: ההערה על שעות ומחירים, הקישור החי, ייחוס המפה ושורת "נוצר בגו
  לונדון" יושבים בבלוק סגירה קומפקטי בתחתית היום האחרון. יום אחד הוא שני עמודים,
  ו-N ימים הם בערך 1 ועוד N עמודים. יום ארוך ממשיך לעמוד הבא רק בין עצירות.

  כדי שבלוק הסגירה לא ייצור עמוד ריק, אחרי הבנייה מודדים את היום האחרון. אם הוא
  חורג מעמוד רק בגלל בלוק הסגירה, המפה של היום הזה מתקצרת (עד MAP_MIN_MM), ולא
  הטקסט של העצירות.

  העמוד מסמן data-pack-ready="1" על html כשהכל מוכן להדפסה, או data-pack-error.
  שום מידע אישי לא נכנס לכאן. הקלט היחיד הוא קוד המסלול, ושום דבר לא נשמר.

  הערה פנימית, לא סופית: ה-QR מוביל לקישור ‎/t/‎, וההפניה ‎/t/*‎ בפרודקשן מתייגת כל
  כניסה כ-utm_source=whatsapp. סריקה מהחוברת תיספר לכן כוואטסאפ. לפני עלייה לאתר
  צריך מקור נפרד לחוברת (כלל הפניה משלה או תיוג אחר). לא משנים את ההפניות במשימה הזו.
*/
(function () {
  'use strict';

  var RC = window.GoLondonRouteCode;
  var MAP = window.GoLondonMapOverlay;
  var BG = window.GoLondonMapBackground;
  var html = document.documentElement;

  /* המפה בעמוד היום: 184 מ"מ רוחב. גובה רגיל 84 מ"מ, ובעמוד האחרון עד 64 מ"מ לכל הפחות */
  var MAP_W = 696, MAP_PAD = 42;
  var PX_PER_MM = MAP_W / 184;
  var MAP_MM = 84, MAP_MIN_MM = 64;
  /* שטח התוכן של עמוד A4 לפי @page בגיליון: 297 פחות 12 למעלה ו-14 למטה */
  var PAGE_MM = 271;
  /* מרווח ביטחון לשבירת עמוד בין עצירות */
  var SAFETY_MM = 5;
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
  function isUrl(u) { return /^https?:\/\//.test(String(u || '')); }
  function shortLink(u) { return u.replace(/^https:\/\//, ''); }
  /*
    מצב התשלום של עצירה, לפי מה שהעצירה עצמה מציגה. בנתונים free=true מסמן שאפשר לבקר
    בלי לשלם, אבל אצל שישה מקומות טקסט המחיר אומר במפורש שחלק בתשלום, למשל בקינגהאם
    ("החילופים חינם, הארמון בתשלום") או גשר המגדלים. מקום כזה הוא "בתשלום חלקי", ולעולם
    לא נספר כחינם בסיכום. partlyPaid בנתונים לא משמש כאן, כי הוא מסמן גם מקומות שהכניסה
    אליהם חינם ורק תערוכות בתשלום (המוזיאון הבריטי, טייט מודרן), ושם הטקסט "כניסה חינם".
      free   free=true, וטקסט המחיר לא מזכיר תשלום
      mixed  free=true, וטקסט המחיר אומר שחלק בתשלום
      paid   free=false
  */
  function payState(it) {
    if (!it.free) return 'paid';
    return /בתשלום/.test(it.priceBand || '') ? 'mixed' : 'free';
  }

  /* סיכום התשלום של קבוצת עצירות. מסלול נראה חינמי רק אם כל עצירה בו חינם בלי סייג */
  function freeText(items) {
    var n = { free: 0, mixed: 0, paid: 0 };
    items.forEach(function (it) { n[payState(it)]++; });
    var one = items.length === 1;
    if (n.free === items.length) return one ? 'בלי תשלום כניסה' : 'כולן בלי תשלום כניסה';
    if (n.paid === items.length) return one ? 'כניסה בתשלום' : 'כולן בתשלום';
    if (n.mixed === items.length) return one ? 'בתשלום חלקי' : 'כולן בתשלום חלקי';
    var parts = [];
    if (n.free) parts.push(n.free + ' בחינם');
    if (n.paid) parts.push(n.paid + ' בתשלום');
    if (n.mixed) parts.push(n.mixed + ' בתשלום חלקי');
    return parts.join(' · ');
  }
  function sum(arr, f) { return arr.reduce(function (n, x) { return n + f(x); }, 0); }

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

  /* QR לקישור החי. ראו בראש הקובץ: מקור המדידה של הסריקה עדיין לא סופי */
  function qrSvg(text) {
    var q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: '', title: '' });
  }

  function pinBadge(n, approx) {
    return '<span class="tp-pin' + (approx ? ' tp-pin--approx' : '') + '" aria-label="עצירה ' + n + (approx ? ', מיקום משוער' : '') + '">' + n + '</span>';
  }

  /* אייקון קטן של סיכת מפה, לכפתור הניווט */
  var NAV_ICON = '<svg class="tp-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>';

  /* ---------- שער ---------- */
  function renderCover(days, link, areas) {
    var stops = sum(days, function (d) { return d.length; });
    var areaKeys = {};
    days.forEach(function (d) { d.forEach(function (it) { areaKeys[it.area] = true; }); });
    var bookList = [];
    days.forEach(function (d, i) { d.forEach(function (it) { if (it.bookAhead) bookList.push({ name: it.name, day: i + 1 }); }); });
    var now = new Date();
    var dense = days.length >= 5;
    var roomy = days.length <= 2;

    /*
      שורה לכל יום. מסלול של יום אחד מקבל את כל העצירות בסדר, כי אין בו ימים אחרים
      לסכם. במסלול של כמה ימים רק שלוש העצירות הראשונות, כדי שהשער לא יהפוך לרשימה.
      שורת הפרטים (תחנת ההתחלה, זמן, כניסה חינם) נשמטת בשבעה ימים, שם צריך מקום.
    */
    var rows = days.map(function (d, i) {
      var names = d.map(function (it) { return it.name; });
      var preview = days.length === 1
        ? names.map(function (n, k) { return (k + 1) + ' ' + n; }).join(' · ')
        : names.slice(0, 3).join(' · ') + (names.length > 3 ? ' ועוד ' + (names.length - 3) : '');
      var book = d.filter(function (it) { return it.bookAhead; }).length;
      var start = d.filter(function (it) { return it.tube; })[0];
      var details = (start ? 'מתחילים בתחנת <bdi dir="ltr">' + esc(start.tube) + '</bdi> · ' : '') +
        hoursText(sum(d, function (it) { return it.hours || 0; })) + ' · ' + freeText(d);
      return '<li class="tp-ov-row">' +
        '<span class="tp-ov-num">' + (i + 1) + '</span>' +
        '<div class="tp-ov-body"><div class="tp-ov-title"><strong>' + esc(dayTitle(d, areas)) + '</strong>' +
          '<span class="tp-ov-meta">' + stopsWord(d.length) + (book ? ' · <b>' + book + ' להזמין מראש</b>' : '') + '</span></div>' +
          '<p class="tp-ov-stops">' + esc(preview) + '</p>' +
          (dense ? '' : '<p class="tp-ov-details">' + details + '</p>') + '</div>' +
      '</li>';
    }).join('');

    var bookBlock = bookList.length
      ? '<div class="tp-book"><strong>להזמין מראש</strong><p>' + bookList.map(function (b) {
          return esc(b.name) + (days.length > 1 ? ' <span class="tp-book-day">(יום ' + b.day + ')</span>' : '');
        }).join(' · ') + '</p></div>'
      : '<div class="tp-book tp-book--none"><strong>להזמין מראש</strong><p>אין במסלול הזה מקומות שחובה להזמין מראש. כדאי בכל זאת לבדוק שעות פתיחה ביום שלפני.</p></div>';

    return '' +
      '<section class="tp-sheet tp-cover' + (dense ? ' tp-cover--dense' : '') + (roomy ? ' tp-cover--roomy' : '') + '">' +
        '<header class="tp-cover-top">' +
          '<img class="tp-logo" src="images/originals/logo.png" alt="גו לונדון" width="600" height="334"/>' +
          '<div class="tp-cover-tag"><span>golondon.co.il</span><span class="tp-cover-date">נוצר ב־' +
            now.getDate() + ' ב' + HE_MONTHS[now.getMonth()] + ' ' + now.getFullYear() + '</span></div>' +
        '</header>' +
        '<div class="tp-hero">' +
          '<p class="tp-hero-kicker">חוברת טיול אישית</p>' +
          '<h1>הטיול שלי בלונדון</h1>' +
          '<p class="tp-hero-sub">' + (days.length === 1
            ? 'יום אחד · ' + stopsWord(stops) + ' · מסלול מסודר לפי אזור'
            : daysWord(days.length) + ', ' + stopsWord(stops) + ', כל יום מסודר לפי אזור') + '</p>' +
          '<dl class="tp-stats">' +
            '<div><dt>ימים</dt><dd>' + days.length + '</dd></div>' +
            '<div><dt>עצירות</dt><dd>' + stops + '</dd></div>' +
            '<div><dt>אזורים</dt><dd>' + Object.keys(areaKeys).length + '</dd></div>' +
            /* ספירה של אפס היא חדשות טובות, ולכן היא לא מודגשת באדום */
            '<div' + (bookList.length ? ' class="tp-stat--alert"' : '') + '><dt>להזמין מראש</dt><dd>' + bookList.length + '</dd></div>' +
          '</dl>' +
        '</div>' +
        '<h2 class="tp-ov-head">המסלול בקצרה</h2>' +
        '<ol class="tp-ov">' + rows + '</ol>' +
        bookBlock +
        '<div class="tp-cover-qr">' +
          '<a class="tp-qr" href="' + esc(link) + '">' + qrSvg(link) + '</a>' +
          '<div><strong>המסלול החי באתר</strong><p>סורקים כדי לפתוח את אותו מסלול בבונה המסלול של גו לונדון, עם ניווט לכל יום. אפשר לערוך אותו ולשלוח הלאה.</p>' +
          '<a class="tp-url" href="' + esc(link) + '" dir="ltr">' + esc(shortLink(link)) + '</a></div>' +
        '</div>' +
      '</section>';
  }

  /* ---------- יום ---------- */
  function mapHtml(items, mapMm) {
    var h = Math.round(mapMm * PX_PER_MM);
    var view = MAP.fit(items, MAP_W, h, MAP_PAD);
    var lay = view ? MAP.layout(items, view) : { pins: [], segments: [], unmapped: items.map(function (_, i) { return i + 1; }), hasApprox: false, hasFar: false };
    var map = view
      ? '<figure class="tp-map" style="aspect-ratio:' + MAP_W + ' / ' + h + '" data-map-mm="' + mapMm + '" data-zoom="' + view.zoom + '">' +
          '<div class="tp-map-bg">' + BG.render(view) + '</div>' +
          '<div class="tp-map-ov">' + MAP.svg(view, lay) + '</div>' +
        '</figure>'
      : '<div class="tp-map tp-map--none">אין לעצירות של היום הזה מיקום שאפשר לסמן במפה.</div>';
    /* המקרא מדבר בשפה של מטייל: מה הסיכה אומרת ומה הקו לא אומר */
    var legend = '<ul class="tp-legend">' +
      '<li><span class="tp-pin tp-pin--sm">1</span><span><b>מיקום מדויק</b></span></li>' +
      (lay.hasApprox ? '<li><span class="tp-pin tp-pin--sm tp-pin--approx">2</span><span><b>מיקום משוער:</b> האזור הכללי, לא כתובת מדויקת</span></li>' : '') +
      (lay.segments.length ? '<li><span class="tp-key-line"></span><span><b>סדר הביקור:</b> קו ישר בין העצירות, לא מסלול הליכה</span></li>' : '') +
      (lay.hasFar ? '<li><span class="tp-key-line tp-key-line--far"></span><span><b>קטע ארוך:</b> כדאי לנסוע</span></li>' : '') +
      '</ul>';
    var unmapped = lay.unmapped.length ? '<p class="tp-unmapped">לא מסומנות במפה: עצירה ' + lay.unmapped.join(', ') + '.</p>' : '';
    return '<div class="tp-map-wrap">' + map + legend + unmapped + '</div>';
  }

  function renderDay(items, index, total, areas, mapMm) {
    var hours = sum(items, function (it) { return it.hours || 0; });

    var stops = items.map(function (it, i) {
      var approx = it.precision === 'approx';
      var facts = [
        '<span class="tp-fact"><b>תחנה</b> <bdi dir="ltr">' + esc(it.tube) + '</bdi></span>',
        '<span class="tp-fact"><b>זמן</b> ' + esc(hoursText(it.hours)) + '</span>',
        '<span class="tp-fact tp-fact--' + payState(it) + '">' + esc(it.priceBand || (it.free ? 'כניסה חינם' : 'בתשלום')) + '</span>'
      ];
      if (it.bookAhead) facts.push('<span class="tp-fact tp-fact--book">להזמין מראש</span>');
      if (approx) facts.push('<span class="tp-fact tp-fact--approx">מיקום משוער</span>');
      /* source הוא לפעמים מקור הקואורדינטות ("nominatim/osm") ולא אתר, ואז אין קישור */
      var site = isUrl(it.source) ? '<a class="tp-link" href="' + esc(it.source) + '">אתר רשמי <bdi dir="ltr">' + esc(domainOf(it.source)) + '</bdi></a>' : '';
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
          return '<a class="tp-cta" href="' + esc(u) + '">' + NAV_ICON + '<span>' +
            (nav.length > 1 ? 'ניווט ביום, חלק ' + (k + 1) + ' מתוך ' + nav.length : 'ניווט ביום הזה בגוגל מפות, לפי הסדר') + '</span></a>';
        }).join('') + '</p>'
      : '';

    return '' +
      '<section class="tp-sheet tp-day" data-day="' + (index + 1) + '">' +
        '<header class="tp-day-head"><span class="tp-day-num">' + (index + 1) + '</span>' +
          '<div><p class="tp-day-kicker">יום ' + (index + 1) + (total > 1 ? ' מתוך ' + total : '') + '</p><h2>' + esc(dayTitle(items, areas)) + '</h2>' +
          '<p class="tp-day-meta">' + stopsWord(items.length) + ', ' + hoursText(hours) + ', ' + freeText(items) + '</p></div></header>' +
        mapHtml(items, mapMm) +
        '<ol class="tp-stops">' + stops + '</ol>' + navHtml +
      '</section>';
  }

  /* ---------- בלוק הסגירה, בתחתית היום האחרון ---------- */
  function renderClose(link, bgAttribution) {
    return '' +
      '<aside class="tp-close">' +
        '<a class="tp-close-qr" href="' + esc(link) + '">' + qrSvg(link) + '</a>' +
        '<div class="tp-close-text">' +
          '<p><b>לפני שיוצאים:</b> שעות הפתיחה והמחירים משתנים מעת לעת. שווה לוודא באתר הרשמי ביום שלפני, ולהזמין מראש מקומות שמסומנים כך.</p>' +
          '<p><b>המסלול החי:</b> <a href="' + esc(link) + '" dir="ltr">' + esc(shortLink(link)) + '</a></p>' +
          '<p class="tp-close-small">' + esc(bgAttribution) + ' · נוצר בבונה המסלול של גו לונדון, golondon.co.il</p>' +
        '</div>' +
      '</aside>';
  }

  function fail(code, message) {
    el('pack').innerHTML = '<section class="tp-sheet tp-error"><h1>לא הצלחנו לבנות את החוברת</h1><p>' + esc(message) + '</p>' +
      '<p><a href="/planner">חזרה לבונה המסלול</a></p></section>';
    html.setAttribute('data-pack-error', code);
  }

  /* גובה התוכן של גיליון במילימטרים, בלי הריפוד של תצוגת המסך */
  function contentMm(section) {
    var cs = getComputedStyle(section);
    var px = section.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return px * 25.4 / 96;
  }

  /*
    היום האחרון והבלוק שלו. אם הם חורגים מעמוד רק במעט, המפה מתקצרת כדי שלא ייווצר
    עמוד שכמעט ריק. יום שארוך מעמוד גם עם מפה מקוצרת ממשיך כרגיל לעמוד הבא, ושם יש
    מקום לבלוק. המדידה נעשית בתצוגת הגיליונות (רוחב תוכן 184 מ"מ, כמו בהדפסה), ולכן
    לא במסך צר של טלפון.
  */
  function fitLastDay(render) {
    if (window.innerWidth < 820) return;
    var last = document.querySelector('.tp-day:last-of-type');
    if (!last) return;
    var h = contentMm(last);
    var over = h + SAFETY_MM - PAGE_MM;
    if (over <= 0) return;
    if (over > MAP_MM - MAP_MIN_MM) return;
    render(Math.max(MAP_MIN_MM, Math.floor(MAP_MM - over)));
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

        function build(lastMapMm) {
          var out = renderCover(days, link, data.areas);
          days.forEach(function (d, i) {
            var isLast = i === days.length - 1;
            var section = renderDay(d, i, days.length, data.areas, isLast ? lastMapMm : MAP_MM);
            if (isLast) section = section.replace(/<\/section>$/, renderClose(link, BG.attribution) + '</section>');
            out += section;
          });
          el('pack').innerHTML = out;
          html.setAttribute('data-last-map-mm', String(lastMapMm));
        }

        build(MAP_MM);
        document.title = 'הטיול שלי בלונדון, ' + daysWord(days.length) + ' | גו לונדון';
        html.setAttribute('data-route-code', canonical);

        return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
          var imgs = [].slice.call(document.images).map(function (img) {
            return img.complete ? null : new Promise(function (res) { img.onload = img.onerror = res; });
          }).filter(Boolean);
          return Promise.all(imgs);
        }).then(function () {
          fitLastDay(build);
          return document.fonts && document.fonts.ready;
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
