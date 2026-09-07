/*
  חקירת אזור לפי קטגוריה
  =======================
  עמוד אזור שואל "מה בא לכם לעשות", והתשובה צריכה להישאר בתוך עמוד
  האזור. עד כה כל בחירה ניווטה אל בונה המסלול, וגם כשהיום הנכון נטען
  שם, הכוונה של הגולש התחלפה: הוא רצה לראות מה יש בשכונה, וקיבל כלי
  לבניית טיול.

  הרכיב הזה מרנדר את התוצאות במקום, מתחת לרשת הקטגוריות:
    "שווקים וקניות בשורדיץ'", וארבעת המקומות עצמם.

  מאיפה מגיעים הנתונים
  --------------------
  מקור אמת אחד, planner-data.json. רשימת המזהים לכל קטגוריה כבר קיימת
  בקישור של הכרטיס, ולכן אין כאן שום מאגר חדש ואין שכפול תוכן. הקישור
  המקורי נשמר ומוצע בסוף, כפעולה משנית, למי שבאמת רוצה לבנות יום.

  פעולות הכרטיס נשענות על רכיבים קיימים בלבד:
    place-info.js   חלון מידע על המקום, מסומן ב-data-place
    trip-tray.js    כפתור הוספה למסלול, דרך GoLondonTray.button

  מדידה: filter_used הקיים, עם האזור, הקטגוריה ומספר התוצאות. לא נוצר
  אירוע חדש.

  כתובת וכפתור אחורה: הקטגוריה נשמרת כ-?cat=<slug> עם pushState, ולכן
  אפשר לשתף קישור ישיר, כפתור אחורה סוגר את התוצאות, ורענון מחזיר את
  אותו מסך ולא זורק לבונה המסלול.

  הפעלה: לעטוף את רשת הקטגוריות ב-.exp שנושא data-area ו-data-area-he.
*/

(function () {
  'use strict';

  var root = document.querySelector('.exp[data-area]');
  if (!root) return;

  var AREA = root.getAttribute('data-area') || '';
  var AREA_HE = root.getAttribute('data-area-he') || '';
  var grid = root.querySelector('.exp-grid');
  if (!grid) return;

  var PLACES = null;   /* מזהה אל רשומה מ-planner-data.json */
  var INFO = null;     /* אילו מזהים באמת קיימים בחלון המידע */
  var panel = null;
  var current = null;

  /* ---------- סגנון ---------- */

  function css() {
    if (document.getElementById('ax-css')) return;
    var s = document.createElement('style');
    s.id = 'ax-css';
    s.textContent = [
      '.ax{margin:14px 0 30px;scroll-margin-top:96px;}',
      /*
        כדור המסלול של trip-tray מרחף במרכז תחתית המסך ברגע שנוסף
        מקום, ונמדד שהוא מכסה את שורת הפעולות של הכרטיס שנמצא באותו
        גובה, ב-375 וב-414. כל עוד פאנל התוצאות פתוח הוא מוסתר, כי
        אותה פעולה בדיוק כבר קיימת בתוך הפאנל, גם להוספה וגם למעבר
        לבונה המסלול. בסגירת הפאנל הוא חוזר כרגיל.
      */
      'body.ax-open .gl-tray-pill{display:none !important;}',
      '.ax[hidden]{display:none;}',
      '.ax-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;}',
      '.ax-h{font-size:19px;font-weight:900;color:#201f2b;margin:0 0 3px;line-height:1.35;}',
      '.ax-s{font-size:13.5px;color:#55596b;margin:0;line-height:1.6;}',
      '.ax-x{flex:none;background:#fff;border:1px solid rgba(32,31,43,.16);color:#55596b;',
        'font-size:13px;font-weight:700;padding:7px 13px;border-radius:9px;cursor:pointer;}',
      '.ax-x:hover{border-color:rgba(220,38,38,.45);color:#DC2626;}',
      '.ax-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(268px,1fr));gap:12px;}',
      '.ax-c{background:#fff;border:1px solid rgba(32,31,43,.1);border-radius:15px;padding:16px 16px 14px;',
        'box-shadow:0 2px 10px rgba(16,24,40,.05);display:flex;flex-direction:column;gap:7px;}',
      '.ax-n{font-size:16px;font-weight:900;color:#201f2b;margin:0;line-height:1.35;}',
      '.ax-en{font-size:12.5px;color:#858a9c;margin:0;direction:ltr;text-align:right;}',
      '.ax-chips{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:2px 0 0;}',
      '.ax-chip{font-size:11.5px;font-weight:700;color:#55596b;background:#f4f4f7;',
        'border-radius:50px;padding:4px 10px;}',
      '.ax-chip.is-free{color:#15803D;background:rgba(21,128,61,.1);}',
      '.ax-d{font-size:13.5px;color:#3d4152;line-height:1.65;margin:4px 0 0;}',
      '.ax-tip{font-size:12.5px;color:#55596b;line-height:1.6;margin:0;background:#faf9f6;',
        'border-radius:10px;padding:9px 11px;}',
      '.ax-acts{display:flex;flex-wrap:wrap;gap:7px;margin-top:auto;padding-top:10px;}',
      '.ax-b{display:inline-flex;align-items:center;gap:6px;font-size:12.8px;font-weight:800;',
        'padding:8px 12px;border-radius:9px;border:1px solid rgba(32,31,43,.16);background:#fff;',
        'color:#3d4152;cursor:pointer;text-decoration:none;}',
      '.ax-b:hover{border-color:rgba(220,38,38,.45);color:#DC2626;text-decoration:none;}',
      '.ax-acts .gl-add{font-size:12.8px;font-weight:800;padding:8px 12px;border-radius:9px;}',
      '.ax-cta{margin-top:16px;background:#faf9f6;border:1px solid rgba(32,31,43,.1);',
        'border-radius:15px;padding:16px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;}',
      '.ax-cta-t{font-size:14.5px;font-weight:800;color:#201f2b;margin:0;flex:1 1 240px;}',
      '.ax-day{background:linear-gradient(135deg,#DC2626,#EA580C);color:#fff;border:0;',
        'font-size:13.5px;font-weight:800;padding:11px 18px;border-radius:10px;cursor:pointer;}',
      '.ax-day[disabled]{background:#15803D;cursor:default;}',
      '.ax-plan{font-size:13.5px;font-weight:800;color:#55596b;text-decoration:underline;}',
      '.ax-none{background:#fff;border:1px dashed rgba(32,31,43,.22);border-radius:15px;',
        'padding:22px 16px;text-align:center;color:#55596b;font-size:13.5px;line-height:1.7;}',
      '.exp-c[aria-pressed="true"]{border-color:#DC2626;box-shadow:0 0 0 2px rgba(220,38,38,.14);}',
      /* המיקוד מועבר לכותרת למען קוראי מסך, בלי טבעת כחולה למי שהגיע בעכבר */
      '.ax-h:focus{outline:none;}',
      '.ax-h:focus-visible{outline:2px solid #DC2626;outline-offset:3px;border-radius:4px;}',
      '@media (max-width:560px){.ax-grid{grid-template-columns:1fr;}.ax-h{font-size:17.5px;}}',
      '@media (prefers-reduced-motion:reduce){.ax{scroll-behavior:auto;}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ---------- כלי עזר ---------- */

  function idsOf(card) {
    var href = card.getAttribute('data-ax-href') || card.getAttribute('href') || '';
    var m = /[?&]day=([^&]+)/.exec(href);
    if (!m) return [];
    return decodeURIComponent(m[1]).split(',').map(function (x) { return x.trim(); })
      .filter(Boolean);
  }

  function hoursHe(h) {
    if (!h) return '';
    if (h < 1) return 'עד שעה';
    if (h === 1) return 'כשעה';
    if (h === 2) return 'כשעתיים';
    return 'כ' + h + ' שעות';
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  /* ---------- כרטיס מקום ---------- */

  function placeCard(id) {
    var p = PLACES[id];
    if (!p) return null;

    var c = el('article', 'ax-c');
    c.appendChild(el('h3', 'ax-n', p.name));
    if (p.nameEn) c.appendChild(el('p', 'ax-en', p.nameEn));

    var chips = el('ul', 'ax-chips');
    function chip(txt, cls) {
      if (!txt) return;
      chips.appendChild(el('li', 'ax-chip' + (cls ? ' ' + cls : ''), txt));
    }
    chip(p.priceBand, p.free ? 'is-free' : '');
    chip(hoursHe(p.hours));
    chip(p.tube);
    if (chips.children.length) c.appendChild(chips);

    if (p.desc) c.appendChild(el('p', 'ax-d', p.desc));
    if (p.tip) c.appendChild(el('p', 'ax-tip', '💡 ' + p.tip));

    var acts = el('div', 'ax-acts');

    /*
      חלון המידע קיים רק לחלק מהמקומות. כפתור שלא יפתח כלום גרוע
      מכפתור שלא קיים, ולכן הוא מוצג רק כשיש רשומה בפועל.
    */
    if (INFO && INFO[id]) {
      var info = el('button', 'ax-b', '');
      info.type = 'button';
      info.setAttribute('data-place', id);
      info.appendChild(document.createTextNode('מידע על המקום'));
      info.insertBefore(icon('fa-circle-info'), info.firstChild);
      acts.appendChild(info);
    }

    var map = el('a', 'ax-b', '');
    map.href = '/planner?mode=nearby&place=' + encodeURIComponent(id) + '&from=area_category';
    map.setAttribute('aria-label', 'הראו את ' + p.name + ' על המפה');
    map.appendChild(icon('fa-map-location-dot'));
    map.appendChild(document.createTextNode(' הראו לי על המפה'));
    acts.appendChild(map);

    if (window.GoLondonTray && window.GoLondonTray.button) {
      acts.appendChild(window.GoLondonTray.button(id, 'area_category'));
    }

    c.appendChild(acts);
    return c;
  }

  function icon(name) {
    var i = document.createElement('i');
    i.className = 'fas ' + name;
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  /* ---------- פאנל התוצאות ---------- */

  function ensurePanel() {
    if (panel) return panel;
    css();
    panel = el('section', 'ax');
    panel.id = 'area-results';
    panel.hidden = true;
    panel.setAttribute('aria-live', 'polite');
    root.parentNode.insertBefore(panel, root.nextSibling);
    return panel;
  }

  function close(push) {
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
    document.body.classList.remove('ax-open');
    current = null;
    grid.querySelectorAll('.exp-c').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
    if (push) history.pushState({ cat: null }, '', location.pathname);
  }

  function open(card, push) {
    var slug = card.getAttribute('data-exp');
    var label = (card.querySelector('.exp-t') || {}).textContent || '';
    var ids = idsOf(card).filter(function (x) { return PLACES[x]; });

    ensurePanel();
    panel.innerHTML = '';
    current = slug;

    grid.querySelectorAll('.exp-c').forEach(function (c) {
      c.setAttribute('aria-pressed', String(c === card));
    });

    var top = el('div', 'ax-top');
    var box = el('div', '');
    var h = el('h2', 'ax-h', label.trim() + ' ב' + AREA_HE);
    h.id = 'ax-h';
    h.tabIndex = -1;
    box.appendChild(h);
    box.appendChild(el('p', 'ax-s', ids.length
      ? ids.length + ' מקומות באזור, כולל מה שכדאי לדעת לפני שהולכים'
      : 'עדיין אין מקומות מסומנים בקטגוריה הזאת'));
    top.appendChild(box);
    var x = el('button', 'ax-x', 'סגירה');
    x.type = 'button';
    x.addEventListener('click', function () { close(true); card.focus(); });
    top.appendChild(x);
    panel.appendChild(top);

    if (!ids.length) {
      /*
        אפס תוצאות. לא מפנים בשקט לשום מקום, ולא מציגים רשת ריקה.
      */
      panel.appendChild(el('div', 'ax-none',
        'הקטגוריה הזאת עדיין בלי מקומות מסומנים ב' + AREA_HE + '. אפשר לבחור קטגוריה אחרת למעלה.'));
    } else {
      var g = el('div', 'ax-grid');
      ids.forEach(function (id) {
        var c = placeCard(id);
        if (c) g.appendChild(c);
      });
      panel.appendChild(g);

      var cta = el('div', 'ax-cta');
      cta.appendChild(el('p', 'ax-cta-t', 'רוצים להפוך את המקומות האלה ליום טיול?'));
      var day = el('button', 'ax-day', 'הוסיפו את כל המקומות למסלול');
      day.type = 'button';
      day.addEventListener('click', function () { addAll(ids, day); });
      cta.appendChild(day);
      var plan = el('a', 'ax-plan', 'או פתחו אותם בבונה המסלול');
      plan.href = card.getAttribute('data-ax-href') || '#';
      cta.appendChild(plan);
      panel.appendChild(cta);
      paintDay(ids, day);
    }

    panel.hidden = false;
    document.body.classList.add('ax-open');

    if (window.glTrack) {
      glTrack('filter_used', {
        source_component: 'area_explore',
        filter: 'category',
        value: slug,
        area: AREA,
        results_count: ids.length
      });
    }

    if (push) history.pushState({ cat: slug }, '', location.pathname + '?cat=' + encodeURIComponent(slug));

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setTimeout(function () { h.focus(); }, 300);
  }

  /* ---------- הוספת כל המקומות ---------- */

  function paintDay(ids, btn) {
    if (!window.GoLondonTray) return;
    var missing = ids.filter(function (id) { return !window.GoLondonTray.has(id); });
    if (missing.length) {
      btn.textContent = 'הוסיפו את כל המקומות למסלול';
      btn.disabled = false;
    } else {
      btn.textContent = '✓ כל המקומות נמצאים במסלול שלכם';
      btn.disabled = true;
    }
  }

  function addAll(ids, btn) {
    if (!window.GoLondonTray) return;
    var added = 0;
    ids.forEach(function (id) { if (window.GoLondonTray.add(id, 'area_category_all')) added++; });
    if (window.glTrack) {
      glTrack('add_day_to_trip', {
        area: AREA, stops: ids.length, added: added,
        source_component: 'area_category_all'
      });
    }
    paintDay(ids, btn);
  }

  /* ---------- חיווט ---------- */

  function cardFor(slug) {
    return grid.querySelector('.exp-c[data-exp="' + (slug || '').replace(/"/g, '') + '"]');
  }

  function wire() {
    grid.querySelectorAll('.exp-c').forEach(function (card) {
      /*
        הקישור המקורי לבונה המסלול נשמר במאפיין נפרד, כדי שהוא יישאר
        זמין ככפתור משני, ובמקומו הכרטיס מצביע על הקטגוריה בעמוד הזה.
        כך גם קישור ישיר וגם רענון נשארים בתוך עמוד האזור.
      */
      var orig = card.getAttribute('href');
      if (orig && !card.getAttribute('data-ax-href')) card.setAttribute('data-ax-href', orig);
      card.setAttribute('href', location.pathname + '?cat=' + encodeURIComponent(card.getAttribute('data-exp')));
      card.setAttribute('aria-pressed', 'false');
      card.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        e.preventDefault();
        if (current === card.getAttribute('data-exp')) { close(true); return; }
        open(card, true);
      });
    });

    window.addEventListener('popstate', function () {
      var slug = new URLSearchParams(location.search).get('cat');
      var card = slug ? cardFor(slug) : null;
      if (card) open(card, false); else close(false);
    });

    var slug0 = new URLSearchParams(location.search).get('cat');
    var c0 = slug0 ? cardFor(slug0) : null;
    if (c0) open(c0, false);

    document.addEventListener('gl:tray-change', function () {
      if (!current) return;
      var card = cardFor(current);
      var btn = panel && panel.querySelector('.ax-day');
      if (card && btn) paintDay(idsOf(card).filter(function (x) { return PLACES[x]; }), btn);
    });
  }

  Promise.all([
    fetch('planner-data.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
    fetch('attractions-info.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
      .catch(function () { return null; })
  ]).then(function (loaded) {
    PLACES = {};
    (loaded[0].attractions || []).forEach(function (a) { PLACES[a.id] = a; });
    INFO = loaded[1];
    wire();
  }).catch(function (err) {
    /* בלי נתונים משאירים את הכרטיסים כפי שהיו, עם הקישור המקורי */
    if (window.console) console.warn('[area-explore]', err && err.message);
  });
})();
