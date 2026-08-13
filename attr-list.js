/*
  רשימת אטרקציות מוטמעת בתוך עמוד תוכן.
  ================================
  משמש להראות רשימה אמיתית של אטרקציות רלוונטיות בתוך עמוד קטגוריה,
  במקום כפתור יחיד שמפנה החוצה לספק חיצוני. כל האתר צריך להיות
  עקבי: מי שנכנס לכל עמוד ועמוד מקבל את אותה רמת פירוט.

  שימוש:
    <div class="attr-list" data-attr-ids="big-ben,tower-bridge,london-eye"></div>
    <script src="attr-list.js" defer></script>

  חייב להיטען יחד עם place-info.js עם data-source="attractions-info.json"
  באותו עמוד, כדי שהלחיצה על כרטיס תפתח את חלון המידע המלא עם התיאור,
  הוידאו והמחיר. attr-list.js רק בונה את הכרטיסים, הקליק מטופל שם.
*/
(function () {
  'use strict';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function renderList(box, ids, data) {
    var html = '';
    var n = 0;
    ids.forEach(function (id) {
      var item = data[id];
      if (!item) return;
      n++;
      var isFree = (item.tags || []).some(function (t) { return t.type === 'free'; });
      var badge = isFree ? '<span class="attr-free-badge">חינם</span>' : '';
      var short = (item.body || '').split('.')[0];
      if (short) short += '.';
      html +=
        '<div class="attr-item" data-place="' + esc(id) + '">' +
          '<div class="attr-num">' + n + '</div>' +
          '<div><h4>' + esc(item.title) + badge + '</h4><p>' + esc(short) + '</p></div>' +
        '</div>';
    });
    box.innerHTML = html || '<p class="attr-list-loading">אין כרגע רשימה זמינה כאן.</p>';
  }

  function init() {
    var boxes = document.querySelectorAll('.attr-list[data-attr-ids]');
    if (!boxes.length) return;

    boxes.forEach(function (b) { b.innerHTML = '<p class="attr-list-loading">טוען רשימה…</p>'; });

    /*
      רוב העמודים מציגים אטרקציות מ attractions-info.json, אבל עמודי
      כדורגל מציגים קבוצות מ football-info.json. כל תיבה יכולה להצהיר
      data-attr-source משלה, ומקבצים לפי קובץ כדי לא לטעון פעמיים.
    */
    var bySource = {};
    boxes.forEach(function (box) {
      var src = box.getAttribute('data-attr-source') || 'attractions-info.json';
      (bySource[src] = bySource[src] || []).push(box);
    });

    Object.keys(bySource).forEach(function (src) {
      fetch(src, { cache: 'no-cache' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          bySource[src].forEach(function (box) {
            var ids = (box.getAttribute('data-attr-ids') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            renderList(box, ids, data);
          });
        })
        .catch(function (err) {
          bySource[src].forEach(function (b) { b.innerHTML = '<p class="attr-list-loading">לא הצלחנו לטעון את הרשימה כרגע.</p>'; });
          if (window.console) console.warn('[attr-list]', src, err.message);
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
