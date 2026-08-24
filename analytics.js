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
      planner_start, planner_complete, planner_mode, route_created,
      add_to_trip, add_day_to_trip, place_open, kosher_place_open,
      search_query, guide_search, checklist_open, checklist_category_done,
      month_hub_open, whats_new_click, toc_jump, navigation_click,
      form_error, area_guide_open

    מפת הכשרות ומצב סביבי במתכנן:
      map_open          פתיחת מפה, עם האזור ומספר המקומות בו
      filter_used       שימוש בסינון, עם השדה, הערך ומספר התוצאות
      navigation_click  לחיצה על ניווט למקום
      location_selected בחירת נקודת עוגן במצב סביבי. אירוע שנוצר ב-21.8.2026.
                        שולח את שיטת הבחירה, gps או tap, ואם היא בתוך אזור
                        הכיסוי. לעולם אינו שולח קואורדינטות של המשתמש.
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
    /*
      source הוא שם עמום: גוגל משתמשת בו גם למקור תנועה בהקשרי קמפיין,
      ובדוחות הופיע בגללו מקור לא צפוי. ההקשר הפנימי של רכיב עובר
      לשם source_component, וההגנה כאן מוודאת שהשם הגולמי לא יגיע
      לגוגל גם משימוש עתידי בטעות.
    */
    if (Object.prototype.hasOwnProperty.call(payload, 'source')) {
      if (!payload.source_component) payload.source_component = payload.source;
      delete payload.source;
    }
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
     סינון מידע אישי לפני שליחה
     ============================================================
     שדה החיפוש הוא שדה טקסט חופשי, וגולשים מדביקים לתוכו לפעמים
     דברים שאין להם שום קשר לחיפוש: כתובת מייל, מספר טלפון, מספר
     כרטיס. אסור שדבר כזה יגיע למערכת המדידה. הפונקציה הזאת בודקת
     את השאילתה לפני השליחה, ואם היא נראית כמו מידע אישי מוחזר
     סימון גנרי במקום הטקסט עצמו. מספר התוצאות נשלח בכל מקרה,
     כי הוא מה שמלמד על פערי תוכן ואין בו שום מידע מזהה.
  */
  var PII = [
    { id: 'מייל',        re: /[^\s@]+@[^\s@]+\.[^\s@]+/ },
    { id: 'טלפון',       re: /(?:\+?\d[\d\-().\s]{7,}\d)/ },
    { id: 'רצף ספרות',   re: /\d{7,}/ },
    { id: 'כתובת רשת',   re: /https?:\/\/|www\./i }
  ];

  function safeTerm(raw) {
    var q = String(raw || '').trim();
    if (!q) return '';
    for (var i = 0; i < PII.length; i++) {
      if (PII[i].re.test(q)) return '[הוסר, ' + PII[i].id + ']';
    }
    /* שאילתה ארוכה בחריגה היא כמעט תמיד הדבקה של טקסט שלם ולא חיפוש */
    if (q.length > 60) return '[הוסר, טקסט ארוך]';
    return q.slice(0, 60);
  }

  window.glSafeTerm = safeTerm;

  /* ============================================================
     מדידה אוטומטית של לחיצות על קישורים
     ============================================================
     האזנה אחת ברמת המסמך, במקום קוד מדידה מפוזר בעשרות עמודים.
     עובד גם על קישורים שנוצרים בג'אווהסקריפט אחרי טעינת העמוד.
  */
  /*
    שימו לב לסיומת האופציונלית בכל הביטויים כאן. נטליפיי מגישה את
    האתר בכתובות ללא סיומת, כלומר href של planner.html מוגש בפועל
    כ /planner. ביטוי שדורש .html עובד מצוין בבדיקה מקומית ומת
    לגמרי באתר החי. זה בדיוק מה שקרה, ולכן הסיומת אופציונלית.
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

    /*
      כרטיס במקטע "מה חדש" נבדק ראשון ויוצא מיד. זה מה שמבטיח ירייה
      אחת בלבד: בלי זה, כרטיס שמוביל לעמוד אשכול היה נספר גם כאן
      וגם כ-category_open, ואותה לחיצה הייתה נמדדת פעמיים.
      הכתובת נשלחת בלי מחרוזת שאילתה, כדי שלא ייסחב לשם מידע אישי.
    */
    var wn = a.closest ? a.closest('.wnc') : null;
    if (wn) {
      track('whats_new_click', {
        item_title: (wn.getAttribute('data-wn-title') || '').slice(0, 100),
        destination_url: href.split('?')[0],
        item_type: wn.getAttribute('data-wn-type') || '',
        published_date: wn.getAttribute('data-wn-pubdate') || ''
      });
      return;
    }

    var file = href.split('?')[0].split('#')[0].split('/').pop() || '';

    if (/^planner(\.html?)?$/i.test(file)) {
      track('planner_open', { link_text: (a.textContent || '').trim().slice(0, 60) });
      return;
    }

    if (/^kosher-map(\.html?)?$/i.test(file)) {
      track('kosher_map_open', { link_text: (a.textContent || '').trim().slice(0, 60) });
      return;
    }

    /* הצ'קליסט הוא כלי שלישי לצד בונה המסלול ומפת הכשרות, ולכן הוא
       מקבל אירוע משלו באותה תבנית ולא נספר כאשכול תוכן. */
    if (/^checklist(\.html?)?$/i.test(file)) {
      track('checklist_open', { link_text: (a.textContent || '').trim().slice(0, 60) });
      return;
    }

    var m = file.match(/^london-([a-z]+)(\.html?)?$/i);
    if (m && MONTHS[m[1].toLowerCase()]) {
      track('month_select', { month: m[1].toLowerCase(), month_he: MONTHS[m[1].toLowerCase()] });
      return;
    }

    if (/^london-by-month(\.html?)?$/i.test(file)) {
      track('month_hub_open', {});
      return;
    }

    /*
      חריג נקודתי אחד. עמוד הווסט אנד הוא תת עמוד לפי שם הקובץ, אבל
      מבחינת הניווט הוא אשכול לכל דבר: הוא היעד של "הצגות ומופעים"
      בכותרת התחתונה. בלי השורה הזאת הקטגוריה היחידה שהוספנו הייתה
      גם היחידה שאי אפשר למדוד. הכלל הכללי שמתחת לא משתנה.
    */
    if (/^guide-attractions-westend(\.html?)?$/i.test(file)) {
      track('category_open', { cluster: 'shows' });
      return;
    }

    /* עמוד ראשי של אשכול תוכן, לדוגמה guide-transport.html אבל לא guide-transport-tube.html */
    var g = file.match(/^guide-([a-z]+)(\.html?)?$/i);
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
