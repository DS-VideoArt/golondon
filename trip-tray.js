/*
  שכבת "הוסף למסלול", אוניברסלית לכל האתר
  =======================================
  המשתמש רואה מקום בכל עמוד, לוחץ פלוס, וממשיך לגלוש. המקומות נאספים
  לרשימה אחת, ומשם הוא עובר למתכנן ומחלק אותם לימים. אין צורך לבחור יום
  ברגע ההוספה, וזו בדיוק הנקודה: איסוף קודם, סידור אחר כך.

  למה סקריפט אחד ולא כפתור בכל עמוד
  ---------------------------------
  באתר יש מעל מאה עמודי תוכן, ובהם המקומות מופיעים בשלוש צורות שונות:
  ככרטיס עם data-place, כשם שמקושר אוטומטית בתוך טקסט על ידי
  auto-link-places.js, וכפריט ברשימה ידנית. הסקריפט הזה מטפל בשלושתן
  בלי לגעת באף עמוד, חוץ משורת הטעינה.

  מה הוא לא עושה
  --------------
  הוא לא מציג כפתור למקום שאין לו רשומה ב-planner-data.json. מקום שאי
  אפשר להוסיף למתכנן לא יקבל כפתור שמבטיח שאפשר. מקומות כשרים, למשל,
  עדיין לא נמצאים במאגר המרכזי ולכן לא מקבלים כפתור.

  אחסון
  -----
  מפתח נפרד משלו, golondon_tray_v1. במכוון לא נכנס לתוך המפתח של
  המתכנן, כדי שלא תהיה שום דרך שבה איסוף מקומות ידרוס מסלול שהמשתמש
  כבר בנה וסידר לימים.
*/
(function () {
  'use strict';

  var KEY = 'golondon_tray_v1';
  var DATA = null;          /* מזהה -> מקום, נטען פעם אחת */
  var ids = [];             /* המקומות שנאספו, לפי סדר ההוספה */
  var pill = null;

  /* ---------- אחסון ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var v = JSON.parse(raw);
      if (v && Array.isArray(v.ids)) ids = v.ids.filter(function (x) { return typeof x === 'string'; });
    } catch (e) { /* אחסון חסום או פגום, ממשיכים עם רשימה ריקה */ }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ids: ids })); } catch (e) {}
  }

  /* ---------- עיצוב ---------- */

  function injectStyles() {
    if (document.getElementById('gl-tray-styles')) return;
    var css = [
      '.gl-add{display:inline-flex;align-items:center;gap:6px;font-family:inherit;',
        'font-size:13px;font-weight:800;line-height:1;padding:8px 13px;border-radius:9px;',
        'border:1px solid rgba(220,38,38,.32);background:rgba(220,38,38,.07);color:#B91C1C;',
        'cursor:pointer;transition:background .15s,border-color .15s,color .15s;',
        'white-space:nowrap;vertical-align:middle;}',
      '.gl-add:hover{background:#DC2626;border-color:#DC2626;color:#fff;}',
      '.gl-add:focus-visible{outline:2px solid #DC2626;outline-offset:2px;}',
      '.gl-add.is-in{background:rgba(21,128,61,.09);border-color:rgba(21,128,61,.34);color:#15803D;}',
      '.gl-add.is-in:hover{background:#15803D;border-color:#15803D;color:#fff;}',
      '.gl-add i{font-size:11px;}',
      /* כפתור בתוך כרטיס מקום ברשימה ממוספרת */
      '.gl-add-row{margin-top:9px;}',
      /* כפתור בתוך חלונית המידע */
      '.gl-add-modal{font-size:14px;padding:12px 18px;border-radius:11px;}',
      '.gl-map-modal{font-size:14px;padding:12px 18px;border-radius:11px;text-decoration:none;}',
      '.gl-map-modal:hover{text-decoration:none;}',

      '.gl-tray-pill{position:fixed;z-index:9500;display:inline-flex;align-items:center;gap:9px;',
        'bottom:18px;inset-inline-start:18px;background:#201f2b;color:#fff;',
        'font-size:14px;font-weight:800;padding:12px 18px;border-radius:50px;',
        'box-shadow:0 4px 20px rgba(16,24,40,.28);text-decoration:none !important;',
        'transition:transform .18s ease,opacity .18s ease;transform:translateY(90px);opacity:0;}',
      '.gl-tray-pill.is-on{transform:translateY(0);opacity:1;}',
      '.gl-tray-pill:hover{background:#DC2626;text-decoration:none !important;}',
      '.gl-tray-pill .n{background:rgba(255,255,255,.18);border-radius:50px;',
        'padding:2px 9px;font-size:12.5px;font-variant-numeric:tabular-nums;}',
      '@media (max-width:560px){',
        '.gl-tray-pill{bottom:14px;inset-inline-start:50%;transform:translate(50%,90px);',
          'font-size:13.5px;padding:11px 16px;}',
        '.gl-tray-pill.is-on{transform:translate(50%,0);}',
      '}',
      '@media (prefers-reduced-motion:reduce){',
        '.gl-tray-pill{transition:none;}',
      '}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'gl-tray-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------- מצב ---------- */

  function has(id) { return ids.indexOf(id) !== -1; }

  function add(id, component) {
    if (!DATA || !DATA[id]) return false;   /* אין רשומה במאגר, לא מוסיפים */
    if (has(id)) return false;              /* כפילות, לא מוסיפים פעמיים */
    ids.push(id);
    save();
    refreshAll();
    var p = DATA[id];
    if (window.glTrack) {
      glTrack('add_to_trip', {
        place_id: id,
        place: p.name || '',
        source_component: component || 'unknown',
        area: p.area || '',
        hood: p.hood || ''
      });
    }
    return true;
  }

  function remove(id) {
    var i = ids.indexOf(id);
    if (i === -1) return false;
    ids.splice(i, 1);
    save();
    refreshAll();
    return true;
  }

  function toggle(id, component) {
    return has(id) ? (remove(id), false) : (add(id, component), true);
  }

  /* ---------- כפתורים ---------- */

  function paint(btn) {
    var id = btn.getAttribute('data-gl-add');
    var inTray = has(id);
    btn.classList.toggle('is-in', inTray);
    btn.setAttribute('aria-pressed', String(inTray));
    btn.innerHTML = inTray
      ? '<i class="fas fa-check" aria-hidden="true"></i> נוסף למסלול'
      : '<i class="fas fa-plus" aria-hidden="true"></i> הוסף למסלול';
    btn.title = inTray ? 'לחיצה נוספת מסירה מהמסלול' : 'הוספה לרשימת המקומות שלכם';
  }

  function makeButton(id, component, extraClass) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'gl-add' + (extraClass ? ' ' + extraClass : '');
    b.setAttribute('data-gl-add', id);
    b.setAttribute('data-gl-src', component || '');
    paint(b);
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();   /* כרטיס data-place לחיץ בשלמותו, אסור לפתוח את החלונית */
      toggle(id, b.getAttribute('data-gl-src'));
    });
    return b;
  }

  function refreshAll() {
    var all = document.querySelectorAll('[data-gl-add]');
    for (var i = 0; i < all.length; i++) paint(all[i]);
    refreshPill();
    /* מי שמציג את הרשימה במקום אחר בעמוד, למשל תיבת המקומות במתכנן */
    try { document.dispatchEvent(new CustomEvent('gl:tray-change', { detail: { ids: ids.slice() } })); } catch (e) {}
  }

  /* ---------- הגלולה הצפה ---------- */

  function onPlanner() {
    return /\/planner(\.html?)?$/i.test(location.pathname);
  }

  function buildPill() {
    if (pill) return;
    if (onPlanner()) return;   /* כבר שם, אין טעם בקיצור דרך לעצמו */
    pill = document.createElement('a');
    pill.className = 'gl-tray-pill';
    pill.href = 'planner.html';
    pill.setAttribute('aria-live', 'polite');
    pill.addEventListener('click', function () {
      if (window.glTrack) glTrack('planner_open', { source_component: 'tray_pill', places: ids.length });
    });
    document.body.appendChild(pill);
  }

  function refreshPill() {
    if (!pill) return;
    var n = ids.length;
    pill.innerHTML = '<span aria-hidden="true">🧭</span> המסלול שלי <span class="n">' + n + '</span>';
    pill.setAttribute('aria-label', 'המסלול שלי, ' + n + ' מקומות');
    pill.classList.toggle('is-on', n > 0);
  }

  /* ---------- חיבור לעמוד ---------- */

  /*
    כרטיסי data-place אינם מקבלים עוד כפתור הוספה ישיר. הכרטיס
    עצמו פותח את חלון המקום, ושם הקורא רואה קודם את המידע ואת
    המחיר ורק אחר כך את פעולות ההוספה וההזמנה. ההוספה הישירה
    נשארת רק ברשימות ידניות עם data-trip-add ובכפתורי יום מלא.
  */
  function wireDataPlace() {
    /* בכוונה ריק. ההוספה מכרטיס עוברת דרך חלון המקום בלבד. */
  }

  /* סימון ידני בעמוד, למשל ברשימת "יום מושלם" במדריכי האזורים */
  function wireExplicit() {
    var els = document.querySelectorAll('[data-trip-add]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var id = el.getAttribute('data-trip-add');
      if (!DATA[id] || el.querySelector('[data-gl-add]')) continue;
      el.appendChild(makeButton(id, el.getAttribute('data-trip-src') || 'list', 'gl-add-row'));
    }
  }

  /*
    "הוסיפו את היום המושלם", לחיצה אחת
    ==================================
    קודם המשתמש היה צריך ללחוץ פלוס על כל עצירה בנפרד, וזה הפך את
    ההשראה למשימה. הכפתור הזה מוסיף את כל היום בבת אחת.

    הכפתורים הבודדים נשארים במקומם בכוונה, למי שרוצה רק מקום אחד.
    זה רכיב תבנית: כל עמוד אזור מקבל אותו על ידי הוספת data-pday-add
    עם רשימת המזהים, בלי שורת קוד נוספת.
  */
  function wirePerfectDay() {
    var els = document.querySelectorAll('[data-pday-add]');
    for (var i = 0; i < els.length; i++) {
      (function (btn) {
        var raw = (btn.getAttribute('data-pday-add') || '').split(',');
        var area = btn.getAttribute('data-pday-area') || '';
        /* מזהה שאין לו רשומה במאגר לא ייכנס, כדי שהמונה לא ישקר */
        var list = raw.map(function (x) { return x.trim(); })
                      .filter(function (x) { return x && DATA[x]; });
        if (!list.length) { btn.style.display = 'none'; return; }

        var label = btn.textContent.trim();

        function paint() {
          var missing = list.filter(function (id) { return !has(id); });
          if (missing.length) {
            btn.textContent = label;
            btn.classList.remove('is-done');
            btn.disabled = false;
          } else {
            btn.textContent = '✓ כל היום נמצא במסלול שלכם';
            btn.classList.add('is-done');
            btn.disabled = true;
          }
        }

        btn.addEventListener('click', function () {
          var added = 0;
          list.forEach(function (id) { if (add(id, 'perfect_day_all')) added++; });
          if (window.glTrack) {
            glTrack('add_day_to_trip', {
              area: area, stops: list.length, added: added,
              source_component: 'perfect_day_all'
            });
          }
          paint();
        });

        document.addEventListener('gl:tray-change', paint);
        paint();
      })(els[i]);
    }
  }

  /*
    חלונית המקום. place-info.js משדר אירוע בכל פתיחה, ואנחנו משתילים
    את הפעולה לצד כפתור ההזמנה הקיים. אם למקום אין רשומה במאגר המרכזי,
    לא מוצג כלום, וזה המצב אצל מקומות שמגיעים מקבצים אחרים.
  */
  /*
    פעולות חלון המידע
    =================
    שתי פעולות מוזרקות לחלון של מקום שממופה במאגר: הוספה למסלול
    וקישור אל מפת המתכנן. שתיהן נבנות ב-DOM APIs בלבד, בלי HTML
    ממחרוזות, כדי ששם מקום לעולם לא יתפרש כתגית.

    עמידות למרוץ טעינה: האזנה ל-gl:place-open נרשמת מיד עם טעינת
    הסקריפט, לפני ש-planner-data.json הגיע. אם חלון נפתח לפני
    שהמאגר מוכן, המזהה נשמר, וכשהמאגר נטען הפעולות מוזרקות לחלון
    שעדיין פתוח. מזהה שאינו במאגר, למשל מקום כשר או אירוע, אינו
    מקבל פעולות ואינו מדווח שגיאה.
  */
  var lastOpenId = null;

  function makeMapLink(id, name) {
    var a = document.createElement('a');
    a.className = 'gl-add gl-map-modal';
    a.setAttribute('data-gl-map', id);
    a.href = '/planner?mode=nearby&place=' + encodeURIComponent(id) + '&from=place_info';
    a.setAttribute('aria-label', 'הראו את ' + name + ' על המפה');
    var ic = document.createElement('i');
    ic.className = 'fas fa-map-location-dot';
    ic.setAttribute('aria-hidden', 'true');
    a.appendChild(ic);
    a.appendChild(document.createTextNode(' הראו לי על המפה'));
    return a;
  }

  function renderModalActions(id) {
    if (!id || !DATA) return;
    var wrap = document.querySelector('.pi-cta-wrap');
    if (!wrap) return;
    /* מסירים רק את הפעולות שלנו. CTA של מידע, אתר רשמי או הזמנה נשאר */
    var mine = wrap.querySelectorAll('[data-gl-add], [data-gl-map]');
    for (var i = 0; i < mine.length; i++) mine[i].parentNode.removeChild(mine[i]);
    var p = DATA[id];
    if (!p) return;
    var frag = document.createDocumentFragment();
    frag.appendChild(makeButton(id, 'place_modal', 'gl-add-modal'));
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      frag.appendChild(makeMapLink(id, p.name || id));
    }
    wrap.insertBefore(frag, wrap.firstChild);
  }

  function wireModal() {
    document.addEventListener('gl:place-open', function (e) {
      lastOpenId = (e.detail && e.detail.id) || null;
      renderModalActions(lastOpenId);
    });
  }

  /* ---------- אתחול ---------- */

  function init() {
    load();
    wireModal();
    fetch('planner-data.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('planner-data'); return r.json(); })
      .then(function (json) {
        DATA = {};
        (json.attractions || []).forEach(function (p) { DATA[p.id] = p; });
        /* מזהה שנמחק מהמאגר לא ישבור את הרשימה */
        ids = ids.filter(function (x) { return !!DATA[x]; });
        save();
        injectStyles();
        buildPill();
        wireDataPlace();
        wireExplicit();
        wirePerfectDay();
        /* חלון שנפתח לפני שהמאגר הגיע מקבל את הפעולות עכשיו */
        if (lastOpenId && document.querySelector('.pi-overlay.pi-open')) {
          renderModalActions(lastOpenId);
        }
        refreshAll();
      })
      .catch(function () { /* בלי נתונים אין כפתורים, וזה עדיף על כפתור שבור */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.GoLondonTray = {
    add: add,
    remove: remove,
    has: has,
    list: function () { return ids.slice(); },
    count: function () { return ids.length; },
    clear: function () { ids = []; save(); refreshAll(); },
    button: makeButton
  };
})();
