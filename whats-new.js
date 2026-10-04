/*
  מה חדש בלונדון, הצד של הדפדפן
  =============================
  שלושה תפקידים:

  1. תוויות תאריך. תאריך פרסום הופך ל"היום", "אתמול" או "לפני N ימים". תאריך אירוע
     שכבר התחיל הופך ל"עכשיו, עד ...". בארכיון, אירוע שהסתיים מקבל תווית "האירוע הסתיים".

  2. שמירה שנייה על הטריות בדף הבית. build_whats_new.py כותב לכל כרטיס את החלון שלו,
     data-wn-from (מאיזה יום, כולל) ו-data-wn-expires (היום הראשון שבו כבר לא). כאן רק
     משווים אליהם את תאריך הגולש, באותם כללים: כרטיס תקף אם from <= היום < expires, קודם
     אירועים לפי מועד ההתחלה הקרוב, אחר כך חדשות מהחדשה לישנה, עד ארבעה. כך כרטיס שפג
     תוקפו נעלם גם אם אף אחד לא בנה את האתר מחדש. המקטע מוסתר ב-HTML ומוצג רק אם יש
     לפחות כרטיס תקף אחד. אם אין, הוא נשאר מוסתר (hidden_fallback): מקטע החודשים שמעליו
     הוא ממשק התכנון החודשי, ולא מוצג כאן זוג חודשים כפול.

  3. מדידה. whats_new_view נשלח פעם אחת בכל צפייה בעמוד, כשהמקטע המוצג נכנס לראשונה
     למסך, עם items_shown ו-display_mode=fresh_items. כשהמקטע מוסתר אין צפייה ואין אירוע.
     לחיצה על כרטיס נמדדת כבר כ-whats_new_click ב-analytics.js. כאן לא נוסף אירוע לחיצה.
*/
(function () {
  'use strict';

  var HOME_CARDS = 4;
  var HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                   'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* היום של הגולש בפורמט YYYY-MM-DD. מחרוזות ISO באותו פורמט משתוות נכון כמחרוזות */
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parts(iso) { var p = iso.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function heDate(iso) { var p = parts(iso); return p.d + ' ב' + HE_MONTHS[p.m - 1] + ' ' + p.y; }
  function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }

  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

  /* תאריך פרסום */
  function pubLabel(iso) {
    var p = parts(iso);
    var then = new Date(p.y, p.m - 1, p.d);
    var days = Math.round((midnight(new Date()) - midnight(then)) / 86400000);
    if (days === 0) return 'היום';
    if (days === 1) return 'אתמול';
    if (days > 1 && days < 7) return 'לפני ' + days + ' ימים';
    return heDate(iso);
  }

  /* תאריך אירוע: לפני שהתחיל נשאר המועד, תוך כדי אירוע של כמה ימים "עכשיו, עד ..." */
  function eventLabel(el) {
    var start = el.getAttribute('data-wn-event-start'), end = el.getAttribute('data-wn-event-end');
    if (!isIso(start) || !isIso(end)) return null;
    var t = todayIso();
    if (start !== end && start <= t && t <= end) return 'עכשיו, עד ' + heDate(end);
    return null;   /* התווית הסטטית שהבונה כתב נכונה בכל מצב אחר */
  }

  function labels(root) {
    var els = root.querySelectorAll('[data-wn-date]');
    for (var i = 0; i < els.length; i++) {
      var iso = els[i].getAttribute('data-wn-date');
      if (isIso(iso)) { try { els[i].textContent = pubLabel(iso); } catch (e) {} }
    }
    var ev = root.querySelectorAll('[data-wn-event-start]');
    for (var j = 0; j < ev.length; j++) {
      var l = eventLabel(ev[j]);
      if (l) ev[j].textContent = l;
    }
  }

  /* בארכיון: אירוע שהסתיים מסומן גם אם העמוד נבנה לפני שהסתיים */
  function markPast() {
    var t = todayIso();
    var items = document.querySelectorAll('.wn-item[data-wn-kind="upcoming_event"][data-wn-expires]');
    for (var i = 0; i < items.length; i++) {
      var exp = items[i].getAttribute('data-wn-expires');
      if (!isIso(exp) || t < exp || items[i].querySelector('.wn-past')) continue;
      var meta = items[i].querySelector('.wn-meta');
      if (!meta) continue;
      var b = document.createElement('span');
      b.className = 'wn-past';
      b.textContent = 'האירוע הסתיים';
      meta.appendChild(b);
    }
  }

  /* אותם כללים כמו home_selection ב-build_whats_new.py */
  function selectCards(cards, t) {
    var valid = [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], from = c.getAttribute('data-wn-from'), exp = c.getAttribute('data-wn-expires');
      if (isIso(from) && isIso(exp) && from <= t && t < exp) valid.push(c);
    }
    var events = valid.filter(function (c) { return c.getAttribute('data-wn-kind') === 'upcoming_event'; });
    var news = valid.filter(function (c) { return c.getAttribute('data-wn-kind') === 'news'; });
    /* data-wn-sort הוא מפתח מלא עם המזהה, כך שאין תיקו: אירועים מהקרוב, חדשות מהחדשה */
    function key(c) { return c.getAttribute('data-wn-sort') || ''; }
    events.sort(function (a, b) { return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0; });
    news.sort(function (a, b) { return key(a) > key(b) ? -1 : key(a) < key(b) ? 1 : 0; });
    return events.concat(news).slice(0, HOME_CARDS);
  }

  function home() {
    var section = document.getElementById('whats-new');
    var tpl = document.getElementById('wn-items');
    if (!section || !tpl || !tpl.content) return null;
    var picked = selectCards(tpl.content.querySelectorAll('.wnc'), todayIso());
    if (!picked.length) {
      section.hidden = true;
      section.setAttribute('data-wn-mode', 'hidden_fallback');
      return null;   /* מוסתר: אין מה למדוד */
    }
    var grid = section.querySelector('[data-wn-grid]');
    grid.innerHTML = '';
    for (var i = 0; i < picked.length; i++) grid.appendChild(picked[i].cloneNode(true));
    labels(grid);
    section.setAttribute('data-wn-mode', 'fresh_items');
    section.hidden = false;
    return { section: section, shown: picked.length, mode: 'fresh_items' };
  }

  /* whats_new_view, פעם אחת בכל צפייה בעמוד. analytics.js נטען ב-defer, ולכן ממתינים לו קצת */
  function send(params) {
    var tries = 0;
    (function go() {
      if (window.glTrack) { window.glTrack('whats_new_view', params); return; }
      if (++tries > 100) return;
      setTimeout(go, 100);
    })();
  }

  function watch(state) {
    if (!state || !('IntersectionObserver' in window)) return;
    var sent = false;
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting || sent) continue;
        sent = true;
        io.disconnect();
        send({ items_shown: state.shown, display_mode: state.mode });
      }
    }, { threshold: 0.25 });
    io.observe(state.section);
  }

  function run() {
    labels(document);
    markPast();
    var state = null;
    try { state = home(); } catch (e) {}
    watch(state);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
