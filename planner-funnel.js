/*
  משפך המתכנן: פתיחה, התחלה, השלמה
  =================================
  עד 4.10.2026 שלושת האירועים לא היו משפך אמיתי:
    planner_open נשלח בלחיצה על קישור למתכנן בעמוד אחר, ולכן כל מי שנכנס
      ישר, מגוגל, מקישור שיתוף או מקישור קצר ברשתות לא נספר בכלל.
    planner_start נשלח בלחיצה הראשונה מכל סוג בעמוד, גם על לשונית או קישור.
    planner_complete נשלח בכל לחיצה על "בנו לי מסלול", ובמצב הידני אף פעם.
  לכן התחלות והשלמות יצאו גבוהות מהפתיחות.

  ההגדרה מעכשיו, אותם שמות אירועים:
    planner_open      צפייה ראשונה במתכנן בכניסה הנוכחית (סשן של הלשונית)
    planner_start     פעולת התכנון הראשונה באותו סשן: בחירה בטופס, בנייה,
                      הוספת מקום או יום, בחירת מיקום או סינון במצב סביבי
    planner_complete  מסלול אמיתי: תוצאה של "בנו לי מסלול" במצב האוטומטי,
                      או יום עם שני מקומות לפחות שהמשתמש בנה במצב הידני
  כל אירוע נשלח פעם אחת לכל סשן, גם אחרי רענון, והסדר מובטח בקוד:
  השלמה מניחה התחלה, והתחלה מניחה פתיחה.

  מאיפה הגיעו: הקישור שנלחץ באתר כותב את העמוד ואת הטקסט שלו
  (analytics.js), והפתיחה כאן קוראת אותם. כך המידע שהיה באירוע הקודם
  נשמר, בלי אירוע נוסף. מפרט מלא ומטריצת הבדיקות: docs/qa/PLANNER_FUNNEL.md
*/
(function () {
  'use strict';

  var SKEY = 'gl_planner_session';
  var HKEY = 'gl_planner_handoff';
  var HANDOFF_TTL = 30 * 60 * 1000;
  var PRESET_ENTRIES = { share: 1, route_preset: 1, area_preset: 1 };

  function store(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }
  function readJSON(st, key) {
    try { return JSON.parse(st.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function rnd() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  var ss = store('sessionStorage'), ls = store('localStorage');
  var q = location.search || '';
  var S = ss ? readJSON(ss, SKEY) : null;

  /* הלחיצה שהביאה לטעינה הזאת. נקראת ונמחקת בכל טעינה, כדי שלא תישאר לטעינה הבאה */
  var handoff = ls ? readJSON(ls, HKEY) : null;
  if (handoff && !(handoff.t && Date.now() - handoff.t < HANDOFF_TTL)) handoff = null;
  if (ls) { try { ls.removeItem(HKEY); } catch (e) {} }
  var arrival = handoff ? (handoff.component === 'tray_pill' ? 'tray_pill' : 'internal_link') : '';

  /* הכניסה מסווגת פעם אחת, בצפייה הראשונה בסשן */
  if (!S || !S.id) {

    var ref = '', refInternal = false;
    try {
      if (document.referrer) {
        var r = new URL(document.referrer);
        refInternal = r.host === location.host;
        ref = refInternal ? ((r.pathname.split('/').pop() || 'index').replace(/\.html?$/i, '') || 'index') : r.host;
      }
    } catch (e) {}

    var entry;
    if (/[?&]from=share\b/.test(q) || /[?&]p=/.test(q)) entry = 'share';
    else if (/[?&]route=/.test(q)) entry = 'route_preset';
    else if (/[?&]day=/.test(q)) entry = 'area_preset';
    else if (/[?&]mode=nearby\b/.test(q)) entry = 'nearby_link';
    else if (handoff) entry = handoff.component === 'tray_pill' ? 'tray_pill' : 'internal_link';
    else if (/[?&]utm_source=/.test(q)) entry = 'campaign';
    else if (refInternal) entry = 'internal_link';
    else if (ref) entry = 'external';
    else entry = 'direct';

    var from = /[?&]from=([A-Za-z0-9_-]+)/.exec(q);
    S = {
      id: rnd(),
      entry: entry,
      route_source: from ? from[1] : '',
      entry_page: handoff ? (handoff.page || '') : (refInternal ? ref : ''),
      link_text: handoff ? String(handoff.text || '').slice(0, 60) : '',
      /* הלשונית שנפתחת: סביבי, ידני לקישור מוכן או למי שיש לו מקומות שמורים, אחרת אוטומטי */
      mode: /[?&]mode=nearby\b/.test(q) ? 'nearby' : (PRESET_ENTRIES[entry] || (!/[?&]mode=/.test(q) && trayCount() > 0) ? 'manual' : 'auto'),
      open: false, start: false, complete: false
    };
  }

  function save() {
    if (!ss) return;
    try { ss.setItem(SKEY, JSON.stringify(S)); } catch (e) {}
  }
  save();

  /* analytics.js נטען בסוף העמוד. האירוע ממתין לו עד עשר שניות ולא הולך לאיבוד */
  function send(name, params) {
    var payload = Object.assign({ planner_session_id: S.id, planner_entry: S.entry }, params || {});
    var tries = 0;
    (function go() {
      if (window.glTrack) { window.glTrack(name, payload); return; }
      if (++tries > 200) return;
      setTimeout(go, 50);
    })();
  }

  function savedPlan() {
    var m = ls ? readJSON(ls, 'golondon_manual_v1') : null;
    return !!(m && Array.isArray(m.days) && m.days.some(function (d) { return Array.isArray(d) && d.length; }));
  }
  function trayCount() {
    var t = ls ? readJSON(ls, 'golondon_tray_v1') : null;
    return t && Array.isArray(t.ids) ? t.ids.length : 0;
  }

  function open() {
    if (S.open) return;
    S.open = true; save();
    var p = { planner_mode: S.mode, has_saved_plan: savedPlan(), tray_places: trayCount() };
    if (S.route_source) p.route_source = S.route_source;
    if (S.entry_page) p.entry_page = S.entry_page;
    if (S.link_text) p.link_text = S.link_text;
    send('planner_open', p);
  }

  function start(action, mode) {
    if (S.start) return;
    open();
    S.start = true; save();
    send('planner_start', { planner_mode: mode || S.mode, start_action: action || '' });
  }

  function complete(params) {
    if (S.complete) return;
    var p = params || {};
    start('implied', p.planner_mode);
    S.complete = true; save();
    /* route_source הוא תמיד תג הכניסה (from=). built_from אומר איך נבנה המסלול שהושלם */
    if (S.route_source) p.route_source = S.route_source;
    p.built_from = PRESET_ENTRIES[S.entry] && p.planner_mode === 'manual' ? 'preset_edit' : (p.planner_mode || '');
    send('planner_complete', p);
  }

  window.GoLondonFunnel = {
    open: open,
    start: start,
    complete: complete,
    entry: function () { return S.entry; },
    /* איך הגיעו לטעינה הנוכחית (לא לסשן): tray_pill, internal_link או ריק */
    arrival: function () { return arrival; },
    sessionId: function () { return S.id; }
  };

  open();
})();
