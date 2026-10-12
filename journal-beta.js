/*
  יומן המסע לילדים, בטא חינמית: עמוד הבקשה
  =========================================
  המסלול מגיע מהמתכנן בחלק שאחרי # בכתובת, ולא בפרמטר רגיל:
    /kids-journal-beta#r=<קוד המסלול>&f=<1 אם במסלול ילד עד גיל 11, אחרת 0>&m=<auto|manual>
  קוד המסלול הוא בדיוק הקוד של קישור השיתוף ‎/t/‎ (route-code.js), כלומר המסלול שעל המסך,
  באותו סדר ימים ומקומות. מה שאחרי # לא נשלח לשרת ולא נרשם בגוגל אנליטיקס.

  כאן לא מריצים את המתכנן ולא בונים מסלול: רק מפענחים את הקוד, מציגים אותו כדי שהמשפחה
  תוודא שזה המסלול שלה, ושולחים בקשה. מקום שנסגר לצמיתות נשאר במקומו, מסומן כסגור,
  כמו בקישור שיתוף ישן, והיומן יציג אותו כהודעת מקום סגור.

  מדידה (analytics.js, glTrack), בלי שום מידע אישי ובלי קוד המסלול:
    journal_beta_view    צפייה בעמוד. entry, has_route, route_ok, state
    journal_beta_start   פעם אחת לסשן: לחיצה על הקריאה במתכנן, או פעולה ראשונה בטופס כאן
    journal_beta_submit  רק אחרי שהשרת אישר שהבקשה נקלטה
  journal_beta_delivered ו-journal_beta_feedback נרשמים בתהליך הידני, לא כאן.

  השרת (‎/.netlify/functions/journal-beta-request‎) עדיין לא קיים בענף הזה. הוא מתואר
  ב-docs/journal-beta/BETA_PLAN.md וממתין לאישור. בלעדיו העמוד מציג הודעת טיוטה ולא מעמיד פנים.
*/
(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/journal-beta-request';
  var LIMITS = { maxDays: 7, maxStopsPerDay: 12 };       /* גבולות המוצר של היומן, גרסה 1 */
  var START_KEY = 'gl_jb_start';

  var $ = function (id) { return document.getElementById(id); };
  function track(name, params) { try { if (window.glTrack) window.glTrack(name, params || {}); } catch (e) { /* מדידה לא מפילה עמוד */ } }
  function session(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; }
  }

  function readHash() {
    var out = {};
    String(location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('='); if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    return {
      code: /^[A-Za-z0-9.]{2,400}$/.test(out.r || '') ? out.r : '',
      family: out.f === '1',
      mode: out.m === 'manual' ? 'manual' : (out.m === 'auto' ? 'auto' : ''),
      entry: out.e === 'planner_cta' ? 'planner_cta' : 'direct'
    };
  }

  var H = readHash();
  var ROUTE = null;            /* { days: [[place]], ok, reason } */
  var STATE = 'open';          /* open | full | unavailable */

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function describeRoute(data) {
    var byCode = {}, byId = {};
    data.attractions.forEach(function (a) { byId[a.id] = a; if (a.code) byCode[a.code] = a.id; });
    var ids = window.GoLondonRouteCode.decode(H.code, function (c) { return byCode[c]; });
    var days = ids.map(function (d) { return d.map(function (id) { return byId[id]; }); });
    var active = days.reduce(function (n, d) { return n + d.filter(function (a) { return !a.closed; }).length; }, 0);
    var reason = '';
    if (!days.length || !active) reason = 'empty';
    else if (days.length > LIMITS.maxDays) reason = 'too_many_days';
    else if (days.some(function (d) { return d.length > LIMITS.maxStopsPerDay; })) reason = 'too_many_stops';
    return { days: days, ok: !reason, reason: reason, stops: days.reduce(function (n, d) { return n + d.length; }, 0) };
  }

  function renderRoute() {
    var body = $('jb-route-body');
    if (!H.code) {
      body.innerHTML = 'היומן נבנה רק ממסלול אמיתי שבניתם במתכנן. בונים מסלול, ובסופו לוחצים על "הופכים את המסלול ליומן מסע לילדים".' +
        '<div class="jb-links"><a class="jb-link" href="planner.html"><i class="fas fa-route"></i> לבניית מסלול</a></div>';
      return;
    }
    if (!ROUTE) { body.textContent = 'לא הצלחנו לטעון את המסלול. נסו לחזור למתכנן ולפתוח את היומן משם.'; return; }
    var html = '<div class="jb-route-days">' + ROUTE.days.map(function (d, i) {
      return '<div class="jb-route-day"><b>יום ' + (i + 1) + ':</b> ' + d.map(function (a) {
        return a.closed ? '<s>' + esc(a.name) + '</s> (נסגר)' : esc(a.name);
      }).join(' · ') + '</div>';
    }).join('') + '</div>';
    var note = {
      empty: 'במסלול הזה אין מקומות פתוחים, ולכן אי אפשר לבנות ממנו יומן.',
      too_many_days: 'בשלב הבטא היומן נבנה למסלולים של עד 7 ימים.',
      too_many_stops: 'בשלב הבטא היומן נבנה למסלולים של עד 12 מקומות ביום.'
    }[ROUTE.reason];
    if (note) html += '<p class="jb-error" style="margin-top:10px">' + note + ' אפשר לחזור למתכנן ולקצר את המסלול.</p>';
    body.innerHTML = html;
  }

  function setState(s, draftMsg) {
    STATE = s;
    $('jb-full').hidden = s !== 'full';
    $('jb-request').hidden = s === 'full';
    if (draftMsg) { $('jb-draft').textContent = draftMsg; $('jb-draft').hidden = false; }
  }

  function canSubmit() { return !!(H.code && ROUTE && ROUTE.ok && STATE !== 'full'); }

  function startOnce(entry) {
    if (session(START_KEY)) return;
    session(START_KEY, '1');
    track('journal_beta_start', { entry: entry, trip_days: ROUTE ? ROUTE.days.length : 0, family_route: H.family ? 1 : 0 });
  }

  function showError(msg) { var e = $('jb-error'); e.textContent = msg; e.hidden = !msg; }

  function validName(s) { return !s || /^[֐-׿A-Za-z][֐-׿A-Za-z '׳’-]{0,23}$/.test(s); }

  function submit(ev) {
    ev.preventDefault();
    showError('');
    var email = $('jb-email').value.trim(), name = $('jb-name').value.trim(), ack = $('jb-ack').checked;
    if (!canSubmit()) return showError('צריך מסלול תקין מהמתכנן כדי לבקש יומן.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError('בדקו את כתובת המייל.');
    if (!validName(name)) return showError('בשדה השם כותבים שם פרטי בלבד, באותיות.');
    if (!ack) return showError('צריך לאשר שזו גרסת בטא.');
    startOnce('form');
    var btn = $('jb-submit'); btn.disabled = true;
    fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route_code: H.code, family_route: H.family, planner_mode: H.mode, email: email, first_name: name || null, beta_ack: true })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
    }).then(function (res) {
      if (res.status === 200 && res.body && res.body.ok) {
        track('journal_beta_submit', { trip_days: ROUTE.days.length, stop_count: ROUTE.stops, family_route: H.family ? 1 : 0, planner_mode: H.mode || 'unknown', first_name_given: name ? 1 : 0 });
        $('jb-request').hidden = true; $('jb-success').hidden = false;
        $('jb-back-route').href = window.GoLondonRouteCode.link(H.code);
        $('jb-success').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (res.status === 409 || (res.body && res.body.full)) {
        setState('full');
      } else if (res.status === 404) {
        setState(STATE, 'טיוטה: השליחה עדיין לא מחוברת לשרת. הבקשה לא נשלחה ושום פרט לא נשמר.');
        btn.disabled = false;
      } else {
        showError((res.body && res.body.message) || 'משהו השתבש בשליחה. נסו שוב בעוד רגע.');
        btn.disabled = false;
      }
    }).catch(function () {
      showError('אין חיבור כרגע. נסו שוב בעוד רגע.');
      btn.disabled = false;
    });
  }

  function init() {
    $('jb-go').addEventListener('click', function () {
      $('jb-request').hidden ? $('jb-full').scrollIntoView({ behavior: 'smooth' }) : $('jb-request').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!$('jb-request').hidden) setTimeout(function () { $('jb-email').focus(); }, 400);
    });
    $('jb-form').addEventListener('submit', submit);
    $('jb-form').addEventListener('focusin', function () { if (H.code) startOnce('form'); }, { once: true });

    var dataP = H.code ? fetch('/planner-data.json').then(function (r) { return r.json(); }).then(function (d) { ROUTE = describeRoute(d); }).catch(function () { ROUTE = null; }) : Promise.resolve();
    var statusP = fetch(ENDPOINT, { method: 'GET' }).then(function (r) {
      if (r.status === 404) return { draft: true };
      return r.json();
    }).then(function (j) {
      if (j && j.draft) setState('open', 'טיוטה לבדיקת ההנהלה: עדיין אין שרת שמקבל בקשות ומנהל את מכסת 25 המשפחות.');
      else if (j && j.open === false) setState('full');
    }).catch(function () { setState('open', 'טיוטה: בדיקת המקום הפנוי בבטא לא זמינה כרגע.'); });

    Promise.all([dataP, statusP]).then(function () {
      renderRoute();
      if (H.code && ROUTE && !ROUTE.ok) $('jb-submit').disabled = true;
      if (!H.code) $('jb-submit').disabled = true;
      track('journal_beta_view', { entry: H.entry, has_route: H.code ? 1 : 0, route_ok: ROUTE && ROUTE.ok ? 1 : 0, beta_state: STATE });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
