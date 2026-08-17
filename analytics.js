/*
  שכבת המדידה של גו לונדון
  =========================
  קוד גוגל אנליטיקס כבר מותקן בכל עמוד, אבל הוא מודד רק צפיות בעמודים.
  צפייה בעמוד לא מספרת אם מישהו באמת בנה מסלול, פתח את מפת הכשרות
  או לחץ על קישור שמכניס כסף. הקובץ הזה מוסיף את המדידה הזאת.

  איך משתמשים:
    glTrack('planner_complete', { days: 4 });

  אם אין גוגל אנליטיקס בעמוד, או שהגולש חסם אותו, שום דבר לא נשבר.
  הפונקציה פשוט לא עושה כלום.

  מה נמדד לבד, בלי לגעת באף עמוד:
    planner_open      לחיצה על כל קישור לבונה המסלול, כולל מאיפה באתר
    kosher_map_open   לחיצה על כל קישור למפת הכשרות
    month_select      לחיצה על חודש, כולל שם החודש
    category_open     כניסה לאשכול תוכן מדף הבית
    video_click       לחיצה על סרטון יוטיוב
    affiliate_click   לחיצה על קישור הכנסה, כולל הספק והמיקום בעמוד

  מה נמדד בקריאה מפורשת מתוך העמודים:
    planner_start, planner_complete, add_to_trip,
    place_open, kosher_place_open, search_query
*/

(function () {
  'use strict';

  /* שם העמוד הנוכחי, כדי לדעת מאיפה באתר הגיעה כל פעולה */
  function pageId() {
    var name = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/i, '');
    return name || 'index';
  }

  var MONTHS = {
    january: 'ינואר', february: 'פברואר', march: 'מרץ', april: 'אפריל',
    may: 'מאי', june: 'יוני', july: 'יולי', august: 'אוגוסט',
    september: 'ספטמבר', october: 'אוקטובר', november: 'נובמבר', december: 'דצמבר'
  };

  function track(name, params) {
    if (typeof window.gtag !== 'function') return;
    var payload = params ? Object.assign({}, params) : {};
    /* מאיזה עמוד יצאה הפעולה. זה מה שיאפשר לדעת אילו עמודים מזינים את הכלים */
    if (!payload.source_page) payload.source_page = pageId();
    try {
      window.gtag('event', name, payload);
    } catch (e) {
      /* מדידה לעולם לא מפילה עמוד */
    }
  }

  window.glTrack = track;

  /* ============================================================
     מדידה אוטומטית של לחיצות על קישורים
     ============================================================
     האזנה אחת ברמת המסמך, במקום קוד מדידה מפוזר בעשרות עמודים.
     עובד גם על קישורים שנוצרים בג'אווהסקריפט אחרי טעינת העמוד.
  */
  function hrefOf(a) {
    var raw = a.getAttribute('href') || '';
    if (!raw || raw.charAt(0) === '#') return '';
    return raw;
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;

    var href = hrefOf(a);
    if (!href) return;

    var file = href.split('?')[0].split('#')[0].split('/').pop() || '';

    if (/^planner\.html?$/i.test(file)) {
      track('planner_open', { link_text: (a.textContent || '').trim().slice(0, 60) });
      return;
    }

    if (/^kosher-map\.html?$/i.test(file)) {
      track('kosher_map_open', { link_text: (a.textContent || '').trim().slice(0, 60) });
      return;
    }

    var m = file.match(/^london-([a-z]+)\.html?$/i);
    if (m && MONTHS[m[1].toLowerCase()]) {
      track('month_select', { month: m[1].toLowerCase(), month_he: MONTHS[m[1].toLowerCase()] });
      return;
    }

    if (/^london-by-month\.html?$/i.test(file)) {
      track('month_hub_open', {});
      return;
    }

    /* עמוד ראשי של אשכול תוכן, לדוגמה guide-transport.html אבל לא guide-transport-tube.html */
    var g = file.match(/^guide-([a-z]+)\.html?$/i);
    if (g) {
      track('category_open', { cluster: g[1].toLowerCase() });
      return;
    }

    if (/youtube\.com|youtu\.be/i.test(href)) {
      track('video_click', { video_url: href.slice(0, 100) });
      return;
    }
  }, true);

  /*
    קישורי ההכנסה כבר משדרים אירוע פנימי משלהם מתוך affiliate.js.
    כאן רק מחברים אותו למדידה, בלי לגעת בקובץ ההוא.
  */
  document.addEventListener('golondon:affiliate-click', function (e) {
    var d = (e && e.detail) || {};
    track('affiliate_click', {
      offer: d.offer || '',
      slot: d.slot || '',
      brand: d.brand || '',
      source_page: d.page || pageId()
    });
  });
})();
