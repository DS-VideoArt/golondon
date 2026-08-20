/*
  תפריט קיצורי דרך למדריכים הארוכים
  ==================================
  עמוד כמו guide-attractions הוא 35 מסכים בגובה במובייל, והדבר היחיד
  שאפשר לעשות בו הוא לגלול. מי שנכנס לחמישים שניות לא מגיע לשליש שלו.
  התפריט הזה נותן לקורא לקפוץ ישר למקטע שמעניין אותו.

  הקובץ עובד לבד ולא דורש שינוי בשום עמוד מלבד שורת הטעינה: הוא מוצא
  את כותרות המקטעים, מייצר להן מזהים יציבים, ובונה את התפריט. בעמוד
  עם פחות מחמישה מקטעי תוכן הוא לא עושה כלום, כי שם אין בעיה לפתור.
*/
(function () {
  'use strict';

  var MIN_SECTIONS = 5;

  /*
    מקטעי שירות שמופיעים בסוף כל מדריך. הם לא חלק מהתוכן ואין טעם
    לקפוץ אליהם, אז הם לא נכנסים לתפריט.
  */
  var BOILERPLATE = /^(נגישות|מקורות|המשך קריאה|חיפשתם משהו|כל מה שכתבנו|שאלות נפוצות|גילוי נאות)/;

  /* הסרת אמוג׳י מתחילת הכותרת לצורך המזהה בלבד. בתפריט הוא נשאר */
  function slug(text) {
    return text
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️‍]/gu, '')
      .trim()
      .replace(/["'׳״,.()]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);
  }

  function injectStyles() {
    if (document.getElementById('gl-toc-styles')) return;
    var css = [
      '.gl-toc{margin:22px 0 30px;padding:18px 20px 20px;border-radius:14px;',
        'background:rgba(124,58,237,.05);border:1px solid rgba(124,58,237,.16);}',
      '.gl-toc-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;',
        'color:#6D28D9;margin-bottom:14px;letter-spacing:.02em;}',
      '.gl-toc-list{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0;}',
      '.gl-toc-list li{margin:0;}',
      '.gl-toc-list a{display:inline-block;font-size:14px;font-weight:600;line-height:1.3;',
        'padding:9px 14px;border-radius:9px;background:#fff;color:#3B2E5A !important;',
        'border:1px solid rgba(124,58,237,.18);text-decoration:none !important;',
        'transition:background .15s,border-color .15s,transform .15s;}',
      '.gl-toc-list a:hover,.gl-toc-list a:focus-visible{background:#7C3AED;color:#fff !important;',
        'border-color:#7C3AED;transform:translateY(-1px);}',
      '.gl-toc-list a:focus-visible{outline:2px solid #7C3AED;outline-offset:2px;}',
      /* מרווח קפיצה, כדי שהכותרת לא תיחבא מתחת לסרגל העליון */
      '.gl-toc-target{scroll-margin-top:84px;}',
      '@media (max-width:520px){',
        '.gl-toc{padding:16px;}',
        '.gl-toc-list{gap:7px;}',
        '.gl-toc-list a{font-size:13.5px;padding:9px 12px;}',
      '}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'gl-toc-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function init() {
    /*
      main לפני article. נפילה ל-article בוחרת את הראשון בלבד, ובעמוד
      שבו כל מקטע הוא article נפרד זה מוצא כותרת אחת במקום שתים עשרה,
      והתפריט פשוט לא נבנה.
    */
    var scope = document.querySelector('.content') || document.querySelector('main') || document.body;
    var all = [].slice.call(scope.querySelectorAll('h2'));

    var sections = all.filter(function (h) {
      var t = (h.textContent || '').trim();
      if (!t) return false;
      /* הסרת האמוג׳י לפני הבדיקה, אחרת כותרת עם אמוג׳י בהתחלה לא תזוהה */
      var plain = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️‍]/gu, '').trim();
      return !BOILERPLATE.test(plain);
    });

    if (sections.length < MIN_SECTIONS) return;

    injectStyles();

    var used = {};
    var list = document.createElement('ul');
    list.className = 'gl-toc-list';

    sections.forEach(function (h) {
      var text = (h.textContent || '').trim();
      var id = h.id;
      if (!id) {
        id = slug(text) || 'section';
        /* מזהה כפול היה שובר את הקפיצה, אז מוסיפים מונה */
        if (used[id]) { used[id]++; id = id + '-' + used[id]; } else { used[id] = 1; }
        h.id = id;
      }
      h.classList.add('gl-toc-target');

      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + id;
      a.textContent = text;
      a.addEventListener('click', function () {
        if (window.glTrack) {
          glTrack('toc_jump', { section: text.slice(0, 60) });
        }
      });
      li.appendChild(a);
      list.appendChild(li);
    });

    var box = document.createElement('nav');
    box.className = 'gl-toc';
    box.setAttribute('aria-label', 'קיצורי דרך בעמוד');
    var head = document.createElement('div');
    head.className = 'gl-toc-h';
    head.innerHTML = '<i class="fas fa-list-ul" aria-hidden="true"></i><span>קפיצה ישירה לנושא</span>';
    box.appendChild(head);
    box.appendChild(list);

    /*
      נקודת ההשתלה. הכותרת הראשונה עשויה לשבת עמוק בתוך כרטיס או
      מאמר, ואז הכנסה לפניה הייתה דוחפת את התפריט לתוך הכרטיס.
      לכן עולים במעלה העץ עד לילד הישיר של המיכל, ומשתילים לפניו.
    */
    var first = sections[0];
    var anchor = first;
    while (anchor.parentNode && anchor.parentNode !== scope) anchor = anchor.parentNode;
    if (anchor.parentNode !== scope) anchor = first;

    /* אם יש שורת נתונים לפני הכותרת, התפריט ייכנס לפניה כדי לא לשבור אותה */
    var prev = anchor.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains('stat-row')) anchor = prev;
    anchor.parentNode.insertBefore(box, anchor);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
