/*
  תוויות "היום" ו"אתמול" עבור מה חדש בלונדון.

  התאריך עצמו נכתב סטטי ב-HTML, כדי שגוגל וגולש בלי ג'אווהסקריפט
  יראו תאריך מלא ונכון. הסקריפט הזה רק משדרג אותו לתווית יחסית
  בצד הגולש. זו הסיבה שהתווית תמיד נכונה, גם אם הבנייה היומית
  דילגה על יום והעמוד נבנה אתמול.
*/
(function () {
  'use strict';

  var HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                   'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  function midnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function label(iso) {
    var p = iso.split('-');
    var then = new Date(+p[0], +p[1] - 1, +p[2]);
    var days = Math.round((midnight(new Date()) - midnight(then)) / 86400000);
    if (days === 0) return 'היום';
    if (days === 1) return 'אתמול';
    if (days > 1 && days < 7) return 'לפני ' + days + ' ימים';
    return then.getDate() + ' ב' + HE_MONTHS[then.getMonth()] + ' ' + then.getFullYear();
  }

  function run() {
    var els = document.querySelectorAll('[data-wn-date]');
    for (var i = 0; i < els.length; i++) {
      var iso = els[i].getAttribute('data-wn-date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
      try { els[i].textContent = label(iso); } catch (e) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
