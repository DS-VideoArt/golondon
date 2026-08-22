/*
  קישור אוטומטי למקומות בתוך טקסט חופשי
  ================================
  בכל מאמר ופוסט באתר מוזכרים שמות של אטרקציות, קבוצות כדורגל, אירועים
  ומסעדות כשרות בתוך משפטים רגילים, בלי שום קישור. הסקריפט הזה סורק
  את גוף המאמר ואת כרטיסי הפוסטים, מוצא אזכורים כאלה, ועוטף אותם
  בסימון לחיץ שפותח בדיוק את אותו חלון מידע שנפתח מרשימה מסודרת:
  תיאור, תג מחיר, וידאו כשיש, ובמסעדות כשרות גם ניווט וטלפון.

  לא נדרשת שום הכנה בעמוד עצמו. הסקריפט טוען בעצמו את קבצי הנתונים,
  בונה מילון של כל השמות הידועים, וסורק בכל עמוד את .content
  (גוף מאמר) ואת .post-card-text (גוף פוסט בעמוד קטגוריה).

  תלוי ב place-info.js וב kosher-places-modal.js, ששניהם חושפים ממשק
  ציבורי לפתיחת החלון. אם אחד מהם לא נטען בעמוד, פשוט לא נפתח חלון
  עבור סוג המקומות שלו, שום דבר אחר לא נשבר.
*/
(function () {
  'use strict';

  var SOURCES = [
    { file: 'attractions-info.json', kind: 'place' },
    { file: 'football-info.json', kind: 'place' },
    { file: 'events-info.json', kind: 'place' },
    { file: 'kosher-places.json', kind: 'kosher' },
    /*
      המאגר המרכזי של המתכנן. נטען אחרון בכוונה: מקום שקיים גם כאן וגם
      ב-attractions-info יישאר עם התוכן העשיר משם, וזה ממלא רק את המקומות
      שנוספו למאגר ואין להם עדיין רשומת תוכן מלאה.
    */
    { file: 'planner-data.json', kind: 'planner' }
  ];

  var MIN_LEN = 3; /* שמות קצרים מזה לא נכנסים למילון, כדי למנוע התאמות מקריות */

  function decode(s) {
    var t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  }

  function loadDictionary() {
    return Promise.all(
      SOURCES.map(function (src) {
        return fetch(src.file, { cache: 'no-cache' })
          .then(function (r) { if (!r.ok) throw new Error(src.file); return r.json(); })
          .then(function (json) { return { src: src, json: json }; })
          .catch(function () { return null; }); /* קובץ שלא קיים בעמוד הזה, ממשיכים בלי */
      })
    ).then(function (results) {
      var entries = [];
      results.forEach(function (r) {
        if (!r) return;
        if (r.src.kind === 'planner') {
          /* המרה לצורה שחלונית המידע יודעת להציג */
          (r.json && r.json.attractions ? r.json.attractions : []).forEach(function (p) {
            if (!p.name || p.name.length < MIN_LEN) return;
            var tags = [];
            if (p.free) tags.push({ label: 'כניסה חינם', type: 'free' });
            else if (p.priceBand) tags.push({ label: p.priceBand });
            if (p.bookAhead) tags.push({ label: 'הזמנה מראש' });
            entries.push({
              name: p.name, kind: 'place', id: p.id,
              item: { title: p.name, body: p.desc || '', tip: p.tip || '', tags: tags }
            });
          });
        } else if (r.src.kind === 'kosher') {
          (r.json || []).forEach(function (p) {
            if (p.name && p.name.length >= MIN_LEN) entries.push({ name: p.name, kind: 'kosher', item: p });
          });
        } else {
          Object.keys(r.json || {}).forEach(function (id) {
            if (id.charAt(0) === '_') return;
            var item = r.json[id];
            if (item.title && item.title.length >= MIN_LEN) {
              entries.push({ name: item.title, kind: 'place', id: id, item: item });
            }
          });
        }
      });
      /* התאמה ארוכה קודם, כדי ש"מוזיאון הטבע" ייתפס לפני "מוזיאון" */
      entries.sort(function (a, b) { return b.name.length - a.name.length; });
      return entries;
    });
  }

  /* בונה regex יחיד מכל השמות, נמלט מתווים מיוחדים, ומריץ אותו על כל טקסט בבת אחת */
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildMatcher(entries) {
    var byName = {};
    entries.forEach(function (e) { if (!byName[e.name]) byName[e.name] = e; });
    var names = Object.keys(byName);
    if (!names.length) return null;
    var re = new RegExp('(' + names.map(escapeRe).join('|') + ')', 'g');
    return { re: re, byName: byName };
  }

  function openEntry(e) {
    if (e.kind === 'kosher') {
      if (window.GoLondonKosherInfo) window.GoLondonKosherInfo.open(e.item);
    } else {
      if (window.GoLondonPlaceInfo) window.GoLondonPlaceInfo.openItem(e.item, e.id);
    }
  }

  /*
    seen הוא מפת השמות שכבר קיבלו קישור בתוך אותו אזור סריקה.
    ------------------------------------------------------------------
    למה זה נדרש: במדריך שורדיץ' "בריק ליין" הופיע תשע עשרה פעמים,
    וכל הופעה קיבלה קו מקווקו. קורא שרואה את אותו סימון חוזר שוב ושוב
    מפסיק לראות אותו, וזה פוגע דווקא בקישורים שמופיעים פעם אחת.

    ההיקף הוא לכל אזור סריקה בנפרד ולא לכל העמוד, וזה במכוון: בעמודי
    קטגוריה כל כרטיס פוסט הוא .post-card-text נפרד, ושם קישור לאותו
    מקום בשני כרטיסים שונים הוא התנהגות נכונה ולא כפילות.

    הטקסט עצמו לא משתנה, רק העטיפה. לכן זה לא נוגע ב-SEO, והחלונית,
    המדידה וההוספה למסלול ממשיכות לעבוד דרך ההופעה הראשונה.
  */
  function processTextNode(node, matcher, seen) {
    var text = node.nodeValue;
    matcher.re.lastIndex = 0;
    if (!matcher.re.test(text)) return;
    matcher.re.lastIndex = 0;

    var frag = document.createDocumentFragment();
    var lastIndex = 0;
    var m;
    var linked = false;
    while ((m = matcher.re.exec(text))) {
      if (m.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      var name = m[0];
      if (seen[name]) {
        /* הופעה חוזרת, נשארת טקסט רגיל */
        frag.appendChild(document.createTextNode(name));
      } else {
        seen[name] = 1;
        linked = true;
        frag.appendChild(makeLink(name, matcher.byName[name]));
      }
      lastIndex = matcher.re.lastIndex;
    }
    if (!linked && !lastIndex) return;   /* לא נוצר כלום, לא נוגעים בצומת */
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    node.parentNode.replaceChild(frag, node);
  }

  function makeLink(name, entry) {
    var span = document.createElement('span');
    span.className = 'gl-place-link';
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '0');
    span.textContent = name;
    span.addEventListener('click', function () { openEntry(entry); });
    span.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEntry(entry); }
    });
    return span;
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, A: 1, BUTTON: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1 };

  function walk(root, matcher, seen) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentElement;
        if (!p || SKIP_TAGS[p.tagName] || p.classList.contains('gl-place-link')) return NodeFilter.FILTER_REJECT;
        /* [data-place] ו .place מסמנים פריט רשימה שכבר לחיץ בשלמותו
           (attr-item, num-item, club-item, כרטיס מסעדה כשרה),
           אין טעם לעטוף שוב טקסט בתוכו */
        if (p.closest('a, button, .gl-place-link, [data-place], .place')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) { processTextNode(node, matcher, seen); });
  }

  var TARGET_SELECTOR = '.content, .post-card-text';

  function scan(matcher) {
    document.querySelectorAll(TARGET_SELECTOR).forEach(function (el) {
      if (el.__glScanned) return;
      el.__glScanned = true;
      walk(el, matcher, {});   /* מפה חדשה לכל אזור סריקה */
    });
  }

  function init() {
    /*
      בלי בדיקה מוקדמת אם היעד כבר קיים: בעמודי קטגוריה כמו
      category.html, כרטיסי הפוסטים (.post-card-text) נבנים דרך
      JavaScript אחרי הטעינה, ולכן בלי המשקיף על body מהרגע הראשון
      הסריקה הראשונה שלהם הייתה מפספסת אותם לצמיתות.
    */
    loadDictionary().then(function (entries) {
      var matcher = buildMatcher(entries);
      if (!matcher) return;
      scan(matcher);
      /* עמודי קטגוריה בונים מחדש את רשימת הפוסטים כשמסננים חיפוש */
      var mo = new MutationObserver(function () { scan(matcher); });
      mo.observe(document.body, { childList: true, subtree: true });
    }).catch(function (err) { if (window.console) console.warn('[auto-link-places]', err.message); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
