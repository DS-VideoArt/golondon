/*
  יומן המסע לילדים, בטא חינמית: עמוד הבקשה
  =========================================
  המסלול מגיע מהמתכנן בחלק שאחרי # בכתובת, ולא בפרמטר רגיל:
    /kids-journal-beta#r=<קוד המסלול>&f=<1 אם במסלול ילד עד גיל 11>&m=<auto|manual>&e=planner_cta
  קוד המסלול הוא בדיוק הקוד של קישור השיתוף ‎/t/‎, כלומר המסלול שעל המסך, באותו סדר ימים ומקומות.
  מה שאחרי # לא נשלח לשרת ולא נרשם בגוגל אנליטיקס.

  הבדיקה קפדנית (journal-beta-route.js, אותו קובץ שהשרת מריץ): קוד לא מוכר, קטוע או לא תקין לא מדולג
  בשקט כמו בקישור שיתוף. במקום זה מוצגת הודעה וכפתור חזרה למתכנן, ושום בקשה לא נשלחת.
  מקום שנסגר לצמיתות נשאר במקומו ומסומן סגור, והיומן יציג אותו כהודעת מקום סגור.

  מדידה (analytics.js, glTrack), בלי מייל, בלי שם, בלי קוד המסלול ובלי מזהה הבקשה:
    journal_beta_view    צפייה בעמוד: entry, has_route, route_ok, beta_state
    journal_beta_start   פעם אחת לסשן: לחיצה על הקריאה במתכנן, או פעולה ראשונה בטופס כאן
    journal_beta_submit  רק כשהשרת קיבל בקשה חדשה (status received). בקשה כפולה לא נספרת שוב
                         כשהכנת היומן לא התחילה (502 dispatch_failed) לא נספר. אם שליחה חוזרת מצליחה, נספר אז, פעם אחת
  journal_beta_delivered ו-journal_beta_feedback נרשמים בתהליך הידני, לא כאן.
*/
(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/journal-beta-request';
  var START_KEY = 'gl_jb_start';
  var REASONS = {
    malformed: 'קוד המסלול לא שלם.',
    unknown_place: 'אחד המקומות במסלול לא מוכר לנו.',
    trip_length: 'בשלב הבטא היומן נבנה למסלולים של יום אחד עד 7 ימים.',
    stops_per_day: 'בשלב הבטא היומן נבנה למסלולים של עד 12 עצירות ביום.',
    repeated_in_day: 'אותו מקום מופיע פעמיים באותו יום.',
    no_open_place: 'במסלול הזה אין מקומות פתוחים.'
  };

  var $ = function (id) { return document.getElementById(id); };
  function track(name, params) { try { if (window.glTrack) window.glTrack(name, params || {}); } catch (e) { /* מדידה לא מפילה עמוד */ } }
  function session(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; }
  }

  function readHash() {
    var out = {};
    String(location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) { try { out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* קידוד שבור */ } }
    });
    return {
      code: typeof out.r === 'string' ? out.r : '',
      family: out.f === '1',
      mode: out.m === 'manual' ? 'manual' : 'auto',
      entry: out.e === 'planner_cta' ? 'planner_cta' : 'direct'
    };
  }

  var H = readHash();
  var ROUTE = null;            /* תוצאת GoLondonJournalRoute.validate */
  var STATE = 'pending';       /* pending | open | full | closed. רק open מציג טופס פעיל */

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function routeLink() { return window.GoLondonRouteCode.link(H.code); }

  function routeError(reason) {
    $('jb-route-error').hidden = false;
    $('jb-route-error-text').textContent = 'לא הצלחנו להכין את המסלול הזה ליומן. ' + (REASONS[reason] || '') +
      ' אפשר לחזור למתכנן, לבדוק את המסלול ולפתוח את היומן משם שוב.';
    $('jb-submit').disabled = true;
  }

  function renderRoute() {
    var body = $('jb-route-body');
    if (!H.code) {
      body.innerHTML = 'היומן נבנה רק ממסלול משפחתי אמיתי שבניתם במתכנן. בונים מסלול, ובסופו לוחצים על "הופכים את המסלול ליומן מסע לילדים".' +
        '<div class="jb-links"><a class="jb-link" href="planner.html"><i class="fas fa-route"></i> לבניית מסלול</a></div>';
      $('jb-submit').disabled = true;
      return;
    }
    if (!ROUTE) { body.textContent = ''; routeError('load'); return; }
    if (!ROUTE.ok) { body.textContent = ''; routeError(ROUTE.reason); return; }
    if (!H.family) { body.textContent = ''; $('jb-route-error').hidden = false;
      $('jb-route-error-text').textContent = 'יומן המסע נבנה למסלולים משפחתיים עם ילד עד גיל 11. במתכנן בוחרים את הגילים ב"מי נוסע", ואז פותחים את היומן שוב.';
      $('jb-submit').disabled = true; return; }
    body.innerHTML = '<div class="jb-route-days">' + ROUTE.days.map(function (d, i) {
      return '<div class="jb-route-day"><b>יום ' + (i + 1) + ':</b> ' + d.map(function (a) {
        return a.closed ? '<s>' + esc(a.name) + '</s> (נסגר)' : esc(a.name);
      }).join(' · ') + '</div>';
    }).join('') + '</div>';
  }

  /*
    השרת הוא המקור היחיד: הטופס מוצג רק כשהוא עונה enabled ו-open. כבוי, חסר, שגיאה או חוסר תשובה
    מציגים את הודעת "עדיין לא פתוח", והטופס נשאר מוסתר (הוא מוסתר כבר ב-HTML).
  */
  function setState(s) {
    STATE = s;
    $('jb-request').hidden = s !== 'open';
    $('jb-full').hidden = s !== 'full';
    $('jb-closed').hidden = s !== 'closed';
    if (s === 'full' && H.code) $('jb-full-route').href = routeLink();
  }

  function canSubmit() { return !!(H.code && H.family && ROUTE && ROUTE.ok && STATE === 'open'); }

  function startOnce(entry) {
    if (session(START_KEY)) return;
    session(START_KEY, '1');
    track('journal_beta_start', { entry: entry, trip_days: ROUTE && ROUTE.ok ? ROUTE.days.length : 0, family_route: H.family ? 1 : 0 });
  }

  function showError(msg) { var e = $('jb-error'); e.textContent = msg; e.hidden = !msg; }
  function validName(s) { return !s || /^[֐-׿A-Za-z][֐-׿A-Za-z '׳’-]{0,23}$/.test(s); }

  function success(already) {
    $('jb-request').hidden = true; $('jb-success').hidden = false;
    if (already) $('jb-success-text').textContent = 'כבר קיבלנו מכם בקשה למסלול הזה, ואין צורך לשלוח שוב. היומן יישלח למייל שמסרתם.';
    $('jb-back-route').href = routeLink();
    $('jb-success').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function submit(ev) {
    ev.preventDefault();
    showError('');
    var email = $('jb-email').value.trim(), name = $('jb-name').value.trim(), ack = $('jb-ack').checked;
    if (!canSubmit()) return showError(STATE === 'open' ? 'צריך מסלול משפחתי תקין מהמתכנן כדי לבקש יומן.' : 'כרגע אי אפשר לשלוח בקשה.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError('בדקו את כתובת המייל.');
    if (!validName(name)) return showError('בשדה השם כותבים שם פרטי בלבד, באותיות.');
    if (!ack) return showError('צריך לאשר שזו גרסת בטא.');
    startOnce('form');
    var btn = $('jb-submit'); btn.disabled = true;
    fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route_code: H.code, family_route: true, planner_mode: H.mode, email: email,
        first_name: name || null, beta_ack: true, website: $('jb-website').value })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j || {} }; });
    }).then(function (res) {
      var b = res.body;
      if (res.status === 200 && b.ok && b.status === 'received') {
        track('journal_beta_submit', { trip_days: ROUTE.days.length, stop_count: ROUTE.days.reduce(function (n, d) { return n + d.length; }, 0),
          family_route: 1, planner_mode: H.mode, first_name_given: name ? 1 : 0 });
        success(false);
      } else if (res.status === 200 && b.ok && b.status === 'already_received') {
        success(true);
      } else if (res.status === 409) {
        setState('full');
      } else if (res.status === 422 && b.code === 'route_invalid') {
        routeError(b.reason);
      } else if (res.status === 502 && b.code === 'dispatch_failed') {
        /* הבקשה נשמרה ותפסה מקום, רק התחלת ההכנה נכשלה. שליחה חוזרת מנסה שוב עם אותה בקשה */
        showError('הבקשה נשמרה, אבל הכנת היומן לא התחילה. אפשר ללחוץ שוב על שליחת הבקשה, זה לא יתפוס מקום נוסף.');
        btn.disabled = false;
      } else if (res.status === 503 || res.status === 404) {
        setState('closed');
      } else {
        showError('משהו השתבש בשליחה. בדקו את הפרטים ונסו שוב בעוד רגע.');
        btn.disabled = false;
      }
    }).catch(function () {
      showError('אין חיבור כרגע. נסו שוב בעוד רגע.');
      btn.disabled = false;
    });
  }

  function init() {
    $('jb-go').addEventListener('click', function () {
      var target = [$('jb-request'), $('jb-full'), $('jb-closed')].filter(function (x) { return !x.hidden; })[0] || $('jb-route');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!$('jb-request').hidden && !$('jb-email').disabled) setTimeout(function () { $('jb-email').focus(); }, 400);
    });
    $('jb-form').addEventListener('submit', submit);
    $('jb-form').addEventListener('focusin', function () { if (canSubmit()) startOnce('form'); }, { once: true });

    var dataP = H.code ? fetch('/planner-data.json').then(function (r) { return r.json(); }).then(function (d) {
      ROUTE = window.GoLondonJournalRoute.validate(H.code, d.attractions);
    }).catch(function () { ROUTE = null; }) : Promise.resolve();
    var statusP = fetch(ENDPOINT, { method: 'GET', cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (j) {
      if (j && j.enabled === true && j.open === true) setState('open');
      else if (j && j.enabled === true && j.open === false) setState('full');
      else setState('closed');
    }).catch(function () { setState('closed'); });

    Promise.all([dataP, statusP]).then(function () {
      renderRoute();
      if (!canSubmit() && STATE !== 'full') $('jb-submit').disabled = true;
      track('journal_beta_view', { entry: H.entry, has_route: H.code ? 1 : 0, route_ok: ROUTE && ROUTE.ok ? 1 : 0, beta_state: STATE });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
