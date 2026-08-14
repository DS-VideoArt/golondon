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
    { file: 'kosher-places.json', kind: 'kosher' }
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
        if (r.src.kind === 'kosher') {
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

  function processTextNode(node, matcher) {
    var text = node.nodeValue;
    matcher.re.lastIndex = 0;
    if (!matcher.re.test(text)) return;
    matcher.re.lastIndex = 0;

    var frag = document.createDocumentFragment();
    var lastIndex = 0;
    var m;
    while ((m = matcher.re.exec(text))) {
      if (m.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      var entry = matcher.byName[m[0]];
      var span = document.createElement('span');
      span.className = 'gl-place-link';
      span.setAttribute('role', 'button');
      span.setAttribute('tabindex', '0');
      span.textContent = m[0];
      span.addEventListener('click', function () { openEntry(entry); });
      span.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEntry(entry); }
      });
      frag.appendChild(span);
      lastIndex = matcher.re.lastIndex;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    node.parentNode.replaceChild(frag, node);
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, A: 1, BUTTON: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1 };

  function walk(root, matcher) {
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
    nodes.forEach(function (node) { processTextNode(node, matcher); });
  }

  var TARGET_SELECTOR = '.content, .post-card-text';

  function scan(matcher) {
    document.querySelectorAll(TARGET_SELECTOR).forEach(function (el) {
      if (el.__glScanned) return;
      el.__glScanned = true;
      walk(el, matcher);
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
