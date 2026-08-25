/*
  מצב "סביבי" בתוך המתכנן
  =======================
  שני חצאים למוצר אחד. לפני הטיול המשתמש בונה ימים בשני המצבים הקיימים.
  במהלך הטיול, כשהוא כבר עומד ברחוב, הוא פותח את המצב הזה ורואה מה יש
  סביבו ומוסיף למסלול בלחיצה.

  למה מודול נפרד
  --------------
  planner.html כבר גדול, ושני המצבים הקיימים עובדים. הקובץ הזה לא נוגע
  בהם: הוא מוסיף מאזין משלו לכפתורי המצב הקיימים, מנהל פאנל משלו, ומוריד
  את ספריות המפה רק כשנפתח המצב בפועל. מי שלא לוחץ, לא משלם על זה בבייטים.

  כיסוי
  -----
  לא כל לונדון. אזורי הכיסוי מוגדרים ב-places-taxonomy.json תחת coverage,
  כל אחד במרכז וברדיוס. הוספת קמדן בעתיד היא רשומה נוספת שם, לא שינוי כאן.

  פרטיות
  -------
  מיקום המשתמש נשאר בזיכרון הדף בלבד. הוא לא נשמר, לא באחסון מקומי ולא
  בעוגייה, ולעולם לא נשלח למדידה. המדידה מקבלת רדיוס, שכונה וסוג הבחירה,
  ולא קואורדינטה.
*/
(function () {
  'use strict';

  var VENDOR = [
    { css: 'vendor/leaflet.css?v=1' },
    { css: 'vendor/markercluster.css?v=1' },
    { css: 'vendor/markercluster-default.css?v=1' },
    { js: 'vendor/leaflet.js?v=1' },
    { js: 'vendor/markercluster.js?v=1' }
  ];

  var RADII = [500, 1000, 2000];

  /* קבוצות סינון. חושפות את הקטגוריות הטכניות בשמות שמטייל מבין */
  var GROUPS = [
    { id: 'sights',  label: '🏛️ אתרים',        cats: ['landmark', 'palace', 'walk'] },
    { id: 'food',    label: '🍽️ אוכל וקפה',    cats: ['restaurant', 'cafe'] },
    { id: 'markets', label: '🛍️ שווקים',       cats: ['market'] },
    { id: 'culture', label: '🎨 אמנות ותרבות', cats: ['museum', 'street-art', 'show'] },
    { id: 'shops',   label: '🛒 קניות',         cats: ['shop'] },
    { id: 'parks',   label: '🌳 פארקים',        cats: ['park', 'viewpoint'] },
    { id: 'night',   label: '🌃 ערב',           cats: ['bar'] }
  ];

  /* תוויות תצוגה לקטגוריות. המשתמש לא אמור לראות מזהים טכניים */
  var CAT_HE = {
    museum: 'מוזיאון', landmark: 'אתר', palace: 'ארמון', viewpoint: 'תצפית',
    park: 'פארק', market: 'שוק', restaurant: 'מסעדה', cafe: 'בית קפה',
    bar: 'בר', shop: 'קניות', 'street-art': 'אמנות רחוב', show: 'הופעות',
    sport: 'ספורט', experience: 'חוויה', attraction: 'אטרקציה', walk: 'רחוב לשיטוט'
  };

  var DATA = null, TAX = null, ZONE = null, INFO = null;
  var ZONES = [], PICKED_BY_PARAM = false;
  var map = null, cluster = null, anchorMarker = null, ring = null;
  var loaded = false, built = false;
  var state = { point: null, radius: 1000, groups: [], free: false, kids: false, method: null };
  var markers = {};   /* id -> marker */

  /* ---------- עזר ---------- */

  function $(id) { return document.getElementById(id); }

  function haversine(a, b) {
    var R = 6371000, p1 = a[0] * Math.PI / 180, p2 = b[0] * Math.PI / 180;
    var dp = p2 - p1, dl = (b[1] - a[1]) * Math.PI / 180;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* מרחק אווירי בלבד. אין כאן חישוב מסלול הליכה, ולכן לא מציגים דקות */
  function distText(m) {
    if (m < 950) return 'כ־' + (Math.round(m / 10) * 10) + ' מטר';
    return 'כ־' + (Math.round(m / 100) / 10) + ' ק״מ';
  }

  function track(name, params) {
    if (window.glTrack) glTrack(name, params || {});
  }

  function loadVendor() {
    if (loaded) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      VENDOR.filter(function (v) { return v.css; }).forEach(function (v) {
        if (document.querySelector('link[href="' + v.css + '"]')) return;
        var l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = v.css;
        document.head.appendChild(l);
      });
      var scripts = VENDOR.filter(function (v) { return v.js; });
      var i = 0;
      (function next() {
        if (i >= scripts.length) { loaded = true; return resolve(); }
        var src = scripts[i++].js;
        if (document.querySelector('script[src="' + src + '"]')) return next();
        var s = document.createElement('script');
        s.src = src;
        s.onload = next;
        s.onerror = function () { reject(new Error(src)); };
        document.body.appendChild(s);
      })();
    });
  }

  /* ---------- נתונים ---------- */

  function placesInZone() {
    if (!DATA || !ZONE) return [];
    return DATA.filter(function (p) {
      return p.lat && p.lng && haversine(ZONE.center, [p.lat, p.lng]) <= ZONE.radiusM;
    });
  }

  function inZone(point) {
    return ZONE && haversine(ZONE.center, point) <= ZONE.radiusM + 800;
  }

  function catsOfSelectedGroups() {
    if (!state.groups.length) return null;
    var out = {};
    GROUPS.forEach(function (g) {
      if (state.groups.indexOf(g.id) === -1) return;
      g.cats.forEach(function (c) { out[c] = 1; });
    });
    return out;
  }

  /* כל מה שבטווח מהנקודה, לפני סינון קטגוריות. בסיס לספירות השבבים */
  function inRadius() {
    if (!state.point) return [];
    return placesInZone().filter(function (p) {
      return haversine(state.point, [p.lat, p.lng]) <= state.radius;
    });
  }

  function results() {
    if (!state.point) return [];
    var wanted = catsOfSelectedGroups();
    return placesInZone().map(function (p) {
      return { p: p, d: haversine(state.point, [p.lat, p.lng]) };
    }).filter(function (r) {
      if (r.d > state.radius) return false;
      if (state.free && !r.p.free) return false;
      if (state.kids && (r.p.audiences || []).indexOf('kids-young') === -1) return false;
      if (wanted) {
        var hit = (r.p.categories || []).some(function (c) { return wanted[c]; });
        if (!hit) return false;
      }
      return true;
    }).sort(function (a, b) { return a.d - b.d; });
  }

  /* ---------- עיצוב ---------- */

  function injectStyles() {
    if ($('nearby-styles')) return;
    var css = [
      '#panel-nearby{padding:0;}',
      '.nb-intro{font-size:14.5px;color:#55596b;line-height:1.65;margin:0 0 14px;}',
      '.nb-intro b{color:#201f2b;}',
      '.nb-start{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}',
      '.nb-btn{font-family:inherit;font-size:14px;font-weight:800;padding:12px 18px;border-radius:11px;',
        'border:1px solid rgba(220,38,38,.3);background:rgba(220,38,38,.06);color:#B91C1C;cursor:pointer;}',
      '.nb-btn:hover{background:#DC2626;border-color:#DC2626;color:#fff;}',
      '.nb-btn.is-on{background:#DC2626;border-color:#DC2626;color:#fff;}',
      '.nb-note{font-size:12.5px;color:#858a9c;margin:0 0 12px;line-height:1.55;}',
      '.nb-controls{display:none;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;}',
      '.nb-controls.is-on{display:flex;}',
      '.nb-zones{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:13px;}',
      '.nb-zone-chip{font-size:12.5px;}',
      '.nb-chip{font-family:inherit;font-size:13px;font-weight:700;padding:7px 13px;border-radius:50px;',
        'border:1px solid rgba(32,31,43,.14);background:#fff;color:#55596b;cursor:pointer;white-space:nowrap;}',
      '.nb-chip.is-on{background:#201f2b;border-color:#201f2b;color:#fff;}',
      '.nb-chip.is-off{opacity:.38;cursor:not-allowed;}',
      '.nb-tag{display:inline-block;font-size:10.5px;font-weight:800;padding:2px 8px;',
        'border-radius:50px;background:rgba(220,38,38,.14);color:#B91C1C;margin-inline-start:5px;',
        'vertical-align:middle;white-space:nowrap;}',
      '.mode-tab.active .nb-tag{background:rgba(255,255,255,.24);color:#fff;}',
      /*
        שלושה מצבים במקום שניים. בעברית התוויות ארוכות, וב-375 פיקסלים
        השורה חרגה מרוחב המסך. גלישה לשתי שורות פותרת בלי לקצר טקסט.
      */
      '@media (max-width:560px){',
        '.mode-tabs{flex-wrap:wrap;}',
        '.mode-tab{flex:1 1 auto;min-width:0;font-size:13px;padding-inline:10px;}',
        '.nb-tag{font-size:9.5px;padding:2px 6px;}',
      '}',
      '.nb-sep{width:1px;height:22px;background:rgba(32,31,43,.12);margin:0 2px;}',
      '#nearby-map{height:340px;border-radius:14px;overflow:hidden;margin-bottom:14px;display:none;',
        'border:1px solid rgba(32,31,43,.12);}',
      '#nearby-map.is-on{display:block;}',
      '.nb-count{font-size:15px;font-weight:900;color:#201f2b;margin:0 0 10px;}',
      '.nb-list{display:grid;gap:10px;}',
      '.nb-card{border:1px solid rgba(32,31,43,.12);border-radius:13px;background:#fff;overflow:hidden;',
        'box-shadow:0 1px 2px rgba(16,24,40,.04);transition:border-color .15s,box-shadow .15s;}',
      '.nb-pic{aspect-ratio:16/9;background:#F1F0EB;overflow:hidden;}',
      '.nb-pic img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.nb-body{padding:13px 16px 15px;}',
      '.nb-card.is-hi{border-color:#DC2626;box-shadow:0 0 0 3px rgba(220,38,38,.12);}',
      '.nb-card-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;}',
      '.nb-name{font-size:16px;font-weight:800;color:#201f2b;cursor:pointer;}',
      '.nb-name:hover{color:#DC2626;}',
      '.nb-dist{font-size:12.5px;font-weight:800;color:#DC2626;white-space:nowrap;}',
      '.nb-meta{font-size:12.5px;color:#858a9c;margin:2px 0 6px;}',
      '.nb-desc{font-size:13.6px;color:#55596b;line-height:1.6;margin:0 0 10px;}',
      '.nb-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}',
      '.nb-act{display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-size:13px;',
        'font-weight:800;padding:8px 13px;border-radius:9px;border:1px solid rgba(32,31,43,.14);',
        'background:#fff;color:#55596b;cursor:pointer;text-decoration:none !important;}',
      '.nb-act:hover{border-color:#201f2b;color:#201f2b;}',
      '.nb-empty{border:1px dashed rgba(32,31,43,.2);border-radius:13px;padding:20px;',
        'font-size:14.5px;color:#55596b;line-height:1.65;text-align:center;}',
      '.nb-empty b{color:#201f2b;}',
      '.nb-pin{font-size:22px;line-height:1;}',
      '@media (max-width:560px){',
        '#nearby-map{height:260px;}',
        '.nb-start{gap:8px;} .nb-btn{flex:1;text-align:center;padding:12px 10px;font-size:13.5px;}',
        '.nb-list{padding-bottom:70px;}',   /* מקום לגלולת המסלול שלי */
      '}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'nearby-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------- בנייה ---------- */

  function buildShell() {
    var panel = $('panel-nearby');
    /*
      הניסוח שונה מאז שהמפה נפתחת ממורכזת. קודם הוא הסביר למה צריך
      לבחור נקודה, ועכשיו המקומות כבר על המסך, אז הוא מסביר מה אפשר
      לעשות איתם ומציע דיוק למי שנמצא שם בפועל.
    */
    panel.innerHTML =
      '<div class="nb-zones" id="nb-zones"></div>' +
      '<p class="nb-intro">כל המקומות שיש לנו במאגר ב' + (ZONE ? ZONE.label : 'שורדיץ׳') + ', על המפה. ' +
        'אפשר לסנן לפי סוג ומרחק, ולהוסיף כל מקום למסלול בלחיצה. ' +
        '<b>נמצאים שם עכשיו?</b> בחרו את המיקום שלכם והמרחקים יחושבו ממנו.</p>' +
      '<div class="nb-start">' +
        '<button type="button" class="nb-btn" id="nb-geo"><i class="fas fa-location-arrow"></i> השתמשו במיקום שלי</button>' +
        '<button type="button" class="nb-btn" id="nb-pick"><i class="fas fa-map-pin"></i> בחרו נקודה על המפה</button>' +
      '</div>' +
      '<p class="nb-note" id="nb-note">המיקום נשאר במכשיר שלכם, לא נשמר ולא נשלח לשום מקום.</p>' +
      '<div class="nb-controls" id="nb-controls"></div>' +
      '<div id="nearby-map"></div>' +
      '<div id="nb-out"></div>';

    $('nb-geo').addEventListener('click', useGeolocation);
    $('nb-pick').addEventListener('click', startPicking);
    buildZoneBar();
    buildControls();
    built = true;
  }

  /*
    בורר האזורים
    ============
    כשהיה אזור פיילוט אחד, הבחירה בכתובת הספיקה. עם שמונה אזורים חיים,
    מי שנכנס ישירות למתכנן היה כלוא באזור הראשון ברשימה בלי לדעת
    שיש עוד שבעה. השורה הזאת מציגה את כולם ומאפשרת מעבר בלחיצה.
  */
  function buildZoneBar() {
    var bar = $('nb-zones');
    if (!bar) return;
    var live = (ZONES || []).filter(isLive);
    if (live.length < 2) { bar.hidden = true; return; }
    bar.innerHTML = '';
    live.forEach(function (z) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nb-chip nb-zone-chip' + (ZONE && z.id === ZONE.id ? ' is-on' : '');
      b.textContent = z.label;
      b.addEventListener('click', function () { switchZone(z); });
      bar.appendChild(b);
    });
  }

  function switchZone(z) {
    if (!z || (ZONE && z.id === ZONE.id)) return;
    ZONE = z;
    /*
      איפוס מלא ובנייה מחדש. הפאנל, המפה והתוצאות כולם נגזרים מהאזור,
      ובנייה נקייה זולה ופשוטה יותר מעדכון חלקי של כל אחד מהם.
    */
    if (map) { map.remove(); map = null; cluster = null; anchorMarker = null; ring = null; }
    state.point = null;
    state.method = null;
    built = false;
    buildShell();
    labelTab();
    track('map_zone_switch', { source_component: 'nearby', zone: z.id });
    if (ZONE.center) setPoint(ZONE.center.slice(), 'area_default');
    if (map) setTimeout(function () { map.invalidateSize(); }, 60);
  }

  function buildControls() {
    var c = $('nb-controls');
    c.innerHTML = '';
    RADII.forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'nb-chip' + (r === state.radius ? ' is-on' : '');
      b.textContent = r < 1000 ? r + ' מ׳' : (r / 1000) + ' ק״מ';
      b.addEventListener('click', function () {
        state.radius = r;
        buildControls(); render();
        track('filter_used', { source_component: 'nearby', filter: 'radius', value: String(r), results_count: results().length });
      });
      c.appendChild(b);
    });
    var sep = document.createElement('span'); sep.className = 'nb-sep'; c.appendChild(sep);

    /* רק קבוצות שיש להן בפועל תוצאות באזור הכיסוי */
    /*
      הספירות מחושבות מול הנקודה והרדיוס הנוכחיים, ולא מול כל אזור הכיסוי.
      שבב שאין לו תוצאות במצב הזה מושבת, כדי שלחיצה לא תוביל למסך ריק.
      הוא חוזר לפעולה מעצמו כשמגדילים רדיוס או מסירים סינון אחר.
    */
    var pool = state.point ? inRadius() : placesInZone();
    GROUPS.forEach(function (g) {
      var n = pool.filter(function (p) {
        return (p.categories || []).some(function (cat) { return g.cats.indexOf(cat) !== -1; });
      }).length;
      var on = state.groups.indexOf(g.id) !== -1;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nb-chip' + (on ? ' is-on' : '') + (!n && !on ? ' is-off' : '');
      b.textContent = g.label + ' ' + n;
      if (!n && !on) { b.disabled = true; b.title = 'אין תוצאות בטווח הנוכחי'; c.appendChild(b); return; }
      b.addEventListener('click', function () {
        var i = state.groups.indexOf(g.id);
        if (i === -1) state.groups.push(g.id); else state.groups.splice(i, 1);
        buildControls(); render();
        track('filter_used', { source_component: 'nearby', filter: 'category', value: g.id, results_count: results().length });
      });
      c.appendChild(b);
    });

    var sep2 = document.createElement('span'); sep2.className = 'nb-sep'; c.appendChild(sep2);
    [['free', '🪙 חינם'], ['kids', '👶 מתאים לילדים']].forEach(function (pair) {
      var key = pair[0];
      var n = pool.filter(function (p) {
        return key === 'free' ? !!p.free : (p.audiences || []).indexOf('kids-young') !== -1;
      }).length;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nb-chip' + (state[key] ? ' is-on' : '') + (!n && !state[key] ? ' is-off' : '');
      b.textContent = pair[1] + ' ' + n;
      if (!n && !state[key]) { b.disabled = true; b.title = 'אין תוצאות בטווח הנוכחי'; c.appendChild(b); return; }
      b.addEventListener('click', function () {
        state[key] = !state[key];
        buildControls(); render();
        track('filter_used', { source_component: 'nearby', filter: key, value: String(state[key]), results_count: results().length });
      });
      c.appendChild(b);
    });
  }

  /* ---------- מפה ---------- */

  function ensureMap() {
    if (map) return;
    var el = $('nearby-map');
    el.classList.add('is-on');
    map = L.map(el, { center: ZONE.center, zoom: 15, zoomControl: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', maxZoom: 19
    }).addTo(map);
    cluster = L.markerClusterGroup({ maxClusterRadius: 45 });
    map.addLayer(cluster);
    map.on('click', function (e) {
      if (!picking) return;
      setPoint([e.latlng.lat, e.latlng.lng], 'tap');
      stopPicking();
    });
  }

  var picking = false;
  function startPicking() {
    ensureMap();
    picking = true;
    $('nb-pick').classList.add('is-on');
    $('nb-note').textContent = 'לחצו על המפה כדי לסמן את הנקודה שממנה נחפש.';
    setTimeout(function () { map.invalidateSize(); }, 60);
  }
  function stopPicking() {
    picking = false;
    $('nb-pick').classList.remove('is-on');
    $('nb-note').textContent = 'המיקום נשאר במכשיר שלכם, לא נשמר ולא נשלח לשום מקום.';
  }

  function useGeolocation() {
    if (!navigator.geolocation) {
      $('nb-note').textContent = 'הדפדפן הזה לא תומך במיקום. אפשר לבחור נקודה על המפה.';
      startPicking();
      return;
    }
    $('nb-note').textContent = 'מבקשים את המיקום…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      setPoint([pos.coords.latitude, pos.coords.longitude], 'gps');
    }, function () {
      /* סירוב או תקלה. בלי הודעת שגיאה, פשוט ממשיכים לדרך השנייה */
      $('nb-note').textContent = 'לא קיבלנו מיקום. אפשר פשוט לסמן נקודה על המפה.';
      startPicking();
    }, { timeout: 8000, maximumAge: 60000 });
  }

  /*
    נקודת העוגן. נשמרת במשתנה בזיכרון בלבד ואינה נכתבת לשום אחסון.
    למדידה נשלחת רק שיטת הבחירה והאם היא בתוך אזור הכיסוי.
  */
  function setPoint(pt, method) {
    ensureMap();
    state.point = pt;
    state.method = method;
    /*
      כפתור האזור מבטיח "כל המקומות באזור". רדיוס ברירת המחדל צר מהאזור עצמו,
      ולכן במיקוד אוטומטי פותחים בטווח שמכסה את כל האזור, אחרת המספר בכפתור
      גדול מהמספר שמופיע בפועל.
    */
    if (method === 'area_default') state.radius = 2000;
    $('nb-controls').classList.add('is-on');
    if (anchorMarker) map.removeLayer(anchorMarker);
    /*
      במיקוד אוטומטי אין "אתם כאן", יש מרכז אזור. סיכה אדומה במרכז
      הייתה נקראת כמיקום של המשתמש, וזה שקר קטן שאין סיבה לספר.
    */
    if (method !== 'area_default') {
      anchorMarker = L.circleMarker(pt, { radius: 8, color: '#DC2626', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(map);
    }
    /* מבט רחב יותר כשמציגים אזור שלם, וקרוב כשמדובר במיקום ממשי */
    map.setView(pt, method === 'area_default' ? 14 : 15);
    setTimeout(function () { map.invalidateSize(); }, 60);
    track('location_selected', {
      source_component: 'nearby',
      method: method,
      in_coverage: String(inZone(pt)),
      zone: ZONE ? ZONE.id : ''
    });
    /* השבבים נבנו לפני שנקבעו הנקודה והטווח, ולכן הם נבנים מחדש כאן */
    buildControls();
    render();
  }

  /* ---------- תצוגה ---------- */

  function render() {
    if (!state.point) return;
    var out = $('nb-out');
    if (!inZone(state.point)) {
      cluster.clearLayers();
      if (ring) { map.removeLayer(ring); ring = null; }
      out.innerHTML = '<div class="nb-empty"><div class="nb-pin">🧭</div>' +
        '<b>מצב סביבי זמין כרגע ב' + ZONE.label + ' בלבד.</b><br>' +
        'זה לא אומר שאין מה לעשות בנקודה שבחרתם, אלא שעוד לא הרחבנו לשם את המאגר. ' +
        'אזורים נוספים בדרך.' +
        '<div style="margin-top:14px"><button type="button" class="nb-btn" id="nb-goto">' +
        '<i class="fas fa-map-location-dot"></i> פתחו את ' + ZONE.label + ' במפה</button></div></div>';
      var go = $('nb-goto');
      if (go) go.addEventListener('click', function () { setPoint(ZONE.center.slice(), 'zone_center'); });
      return;
    }
    var res = results();

    if (ring) map.removeLayer(ring);
    /*
      טבעת מרחק מסבירה "כל מה שקרוב אליכם". כשהעוגן הוא מרכז האזור ולא המשתמש,
      והטווח מכסה ממילא את כל האזור, הטבעת רק מוסיפה רעש ורומזת על מיקום שאין.
    */
    var showRing = !(state.method === 'area_default' && ZONE && state.radius >= ZONE.radiusM);
    ring = showRing
      ? L.circle(state.point, { radius: state.radius, color: '#DC2626', weight: 1, opacity: .5, fillOpacity: .04 }).addTo(map)
      : null;

    cluster.clearLayers(); markers = {};
    res.forEach(function (r) {
      var m = L.marker([r.p.lat, r.p.lng], {
        icon: L.divIcon({ className: '', html: '<div style="background:#DC2626;color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,.3)">📍</div>', iconSize: [26, 26] })
      });
      m.bindTooltip(r.p.name, { direction: 'top' });
      m.on('click', function () { highlight(r.p.id); });
      markers[r.p.id] = m;
      cluster.addLayer(m);
    });

    if (!res.length) {
      out.innerHTML = '<div class="nb-empty">לא נמצאו מקומות בטווח הזה עם הסינון הנוכחי.<br>' +
        'אפשר להגדיל את הרדיוס או להסיר סינון.</div>';
      return;
    }

    var radiusHe = state.radius < 1000 ? state.radius + ' מטר' : (state.radius / 1000) + ' ק״מ';
    var countHe;
    if (state.method === 'area_default') {
      /* העוגן הוא מרכז האזור ולא המשתמש, ולכן אסור לכתוב כאן "מכם" */
      countHe = (ZONE && state.radius >= ZONE.radiusM)
        ? res.length + ' מקומות ב' + (ZONE.label || 'אזור')
        : res.length + ' מקומות עד ' + radiusHe + ' ממרכז האזור';
    } else {
      countHe = res.length + ' מקומות עד ' + radiusHe + ' מכם';
    }
    var html = '<p class="nb-count">' + countHe + '</p><div class="nb-list">';
    res.forEach(function (r) {
      var p = r.p;
      var cats = (p.categories || []).slice(0, 2).map(function (c) { return CAT_HE[c] || c; }).join(' · ');
      var approx = p.precision === 'approx' ? ' <span style="color:#B45309">· נקודה מייצגת</span>' : '';
      var pic = p.image
        ? '<div class="nb-pic"><picture>' +
            '<source srcset="' + p.image + '.webp" type="image/webp">' +
            '<img src="' + p.image + '.jpg" alt="' + (p.imageAlt || p.name) + '" ' +
            'loading="lazy" decoding="async" width="800" height="450"></picture></div>'
        : '';
      html += '<div class="nb-card" data-nb="' + p.id + '">' + pic +
        '<div class="nb-body">' +
        '<div class="nb-card-top"><span class="nb-name" data-nb-open="' + p.id + '">' + p.name + '</span>' +
        '<span class="nb-dist">' + distText(r.d) + '</span></div>' +
        '<div class="nb-meta">' + cats + (p.free ? ' · חינם' : '') + approx + '</div>' +
        '<p class="nb-desc">' + (p.desc || '').slice(0, 95) + '…</p>' +
        '<div class="nb-acts" data-nb-acts="' + p.id + '"></div>' +
        '</div></div>';
    });
    out.innerHTML = html + '</div>';

    /* פעולות. הוספה למסלול היא בדיוק אותו כפתור של trip-tray */
    res.forEach(function (r) {
      var host = out.querySelector('[data-nb-acts="' + r.p.id + '"]');
      if (!host) return;
      if (window.GoLondonTray && GoLondonTray.button) {
        host.appendChild(GoLondonTray.button(r.p.id, 'nearby'));
      }
      var info = document.createElement('button');
      info.type = 'button'; info.className = 'nb-act';
      info.innerHTML = '<i class="fas fa-circle-info"></i> פרטים';
      info.addEventListener('click', function () { openPlace(r.p); });
      host.appendChild(info);

      var nav = document.createElement('a');
      nav.className = 'nb-act'; nav.target = '_blank'; nav.rel = 'noopener';
      nav.href = 'https://www.openstreetmap.org/directions?to=' + r.p.lat + '%2C' + r.p.lng;
      nav.innerHTML = '<i class="fas fa-diamond-turn-right"></i> ניווט';
      nav.addEventListener('click', function () {
        track('navigation_click', { place_id: r.p.id, source_component: 'nearby', precision: r.p.precision || '' });
      });
      host.appendChild(nav);

      /* כפתור הזמנה רק כשקיים פתרון אמיתי */
      if (r.p.booking && r.p.booking.href) {
        var bk = document.createElement('a');
        bk.className = 'nb-act'; bk.target = '_blank'; bk.rel = 'sponsored noopener nofollow';
        bk.href = r.p.booking.href;
        bk.innerHTML = '<i class="fas fa-ticket"></i> בדקו כרטיסים';
        bk.addEventListener('click', function () {
          track('affiliate_click', { place_id: r.p.id, source_component: 'nearby' });
        });
        host.appendChild(bk);
      }
    });

    out.querySelectorAll('[data-nb-open]').forEach(function (el) {
      el.addEventListener('click', function () {
        var p = res.filter(function (r) { return r.p.id === el.getAttribute('data-nb-open'); })[0];
        if (p) openPlace(p.p);
      });
    });
  }

  function highlight(id) {
    var all = document.querySelectorAll('.nb-card');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('is-hi');
    var card = document.querySelector('.nb-card[data-nb="' + id + '"]');
    if (!card) return;
    card.classList.add('is-hi');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* משתמשים בחלונית הקיימת ולא בונים חדשה */
  function openPlace(p) {
    if (!window.GoLondonPlaceInfo) return;
    var tags = [];
    if (p.free) tags.push({ label: 'כניסה חינם', type: 'free' });
    else if (p.priceBand) tags.push({ label: p.priceBand });
    if (p.bookAhead) tags.push({ label: 'הזמנה מראש' });
    var rich = (INFO && INFO[p.id]) || {};
    GoLondonPlaceInfo.openItem({
      title: p.name, body: p.desc || '', tip: p.tip || rich.tip || '', tags: tags,
      /* ההמלצה הנלווית והווידאו קיימים רק במאגר התוכן העשיר */
      extra: rich.extra || null,
      video: rich.video || null,
      cta: (p.booking && p.booking.href) ? { label: 'בדקו כרטיסים', href: p.booking.href, custom: true }
           : (rich.cta || null)
    }, p.id);
  }

  /* ---------- הפעלה ---------- */

  /* התווית אומרת מראש שזה פיילוט, כדי שלא ייווצר רושם של כיסוי כל לונדון */
  function labelTab() {
    var t = $('tab-nearby');
    if (!t || !ZONE) return;
    /*
      שם האזור מגיע מהטקסונומיה, כדי שאזור חדש לא ידרוש נגיעה בקוד.
      בכניסה ישירה למתכנן, בלי אזור נבחר, התווית ציינה רק את האזור הראשון
      ברשימה, וכך אזורים חיים אחרים נעלמו ממי שלא הגיע דרך עמוד אזור.
    */
    var live = (ZONES || []).filter(isLive);
    var HE_N = { 2: 'שני', 3: 'שלושה', 4: 'ארבעה', 5: 'חמישה' };
    var tag = (!PICKED_BY_PARAM && live.length > 1)
      ? 'פיילוט ב' + (HE_N[live.length] || live.length) + ' אזורים'
      : 'פיילוט ב' + ZONE.label;
    t.innerHTML = '<i class="fas fa-location-crosshairs"></i> סביבי ' +
      '<span class="nb-tag">' + tag + '</span>';
  }

  function open() {
    injectStyles();
    $('panel-auto').hidden = true;
    $('panel-manual').hidden = true;
    var res = $('results'); if (res) res.style.display = 'none';
    $('panel-nearby').hidden = false;
    $('tab-auto').classList.remove('active');
    $('tab-manual').classList.remove('active');
    $('tab-nearby').classList.add('active');
    $('tab-auto').setAttribute('aria-selected', 'false');
    $('tab-manual').setAttribute('aria-selected', 'false');
    $('tab-nearby').setAttribute('aria-selected', 'true');

    track('map_open', { source_component: 'nearby', zone: ZONE ? ZONE.id : '', places: placesInZone().length });

    loadVendor().then(function () {
      if (!built) buildShell();
      /*
        מיקוד אוטומטי על מרכז האזור
        ===========================
        קודם המשתמש שלחץ "גלו את כל המקומות באזור" נחת על מסך הסבר עם
        שני כפתורים שדורשים ממנו מיקום, וראה אפס מקומות. הבטחנו גילוי
        והגשנו טופס.

        מרכז האזור והרדיוס כבר רשומים ב-places-taxonomy.json, כלומר
        המערכת תמיד ידעה איפה זה. עכשיו היא פשוט מציגה את זה מיד.

        "השתמשו במיקום שלי" נשאר בדיוק במקומו. ההבדל הוא שהוא הפך
        מדרישה לאפשרות, ומי שבאמת עומד ברחוב עדיין מקבל את הדיוק המלא.

        לא דורסים נקודה שהמשתמש כבר בחר.
      */
      if (!state.point && ZONE && ZONE.center) {
        setPoint(ZONE.center.slice(), 'area_default');
      }
      if (map) setTimeout(function () { map.invalidateSize(); }, 60);
    }).catch(function () {
      $('panel-nearby').innerHTML = '<div class="nb-empty">לא הצלחנו לטעון את המפה. נסו לרענן את העמוד.</div>';
    });
  }

  function close() {
    var p = $('panel-nearby');
    if (p) p.hidden = true;
    var t = $('tab-nearby');
    if (t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); }
  }

  /*
    בחירת אזור הכיסוי
    =================
    עד עכשיו נבחר תמיד אזור הפיילוט הראשון ברשימה. זה עבד כל עוד היה
    אזור אחד, והיה נשבר ברגע שיתווסף שני: משתמש שמגיע ממדריך קמדן היה
    מקבל מפה של שורדיץ׳, חמישה וחצי קילומטרים משם.

    הבחירה נעשית בשלוש דרגות, מהמפורש לכללי:

      1. ?zone=camden          פרמטר מפורש, הדרך המומלצת לעתיד
      2. ?from=camden_hero     נגזר מהתחילית של from, שכבר קיים בכל
                               הקישורים ממדריכי האזורים. המשמעות היא
                               שכל קישור קיים ממשיך לעבוד בלי שינוי,
                               ומדריך אזור חדש עובד אוטומטית ברגע
                               שהוא משתמש במוסכמה <zone>_<מיקום>.
      3. אזור הפיילוט הראשון   ברירת המחדל, כניסה ישירה למתכנן

    רק אזור פעיל נבחר. אזור שמוגדר בטקסונומיה אבל עדיין אין לו תוכן
    מסומן ready, והוא לא ייבחר גם אם מבקשים אותו במפורש, כדי שלא
    ייפתח מסך ריק שמבטיח מקומות שאינם.
  */
  function isLive(z) { return z && z.status === 'pilot'; }

  function pickZone(zones) {
    var live = zones.filter(isLive);
    if (!live.length) return zones[0] || null;

    function byId(id) {
      if (!id) return null;
      for (var i = 0; i < live.length; i++) if (live[i].id === id) return live[i];
      return null;
    }

    var m = /[?&]zone=([a-z0-9-]+)/i.exec(location.search);
    var z = byId(m && m[1].toLowerCase());
    if (z) { PICKED_BY_PARAM = true; return z; }

    /* from נראה כמו shoreditch_hero או camden_exp_food. התחילית היא האזור */
    var f = /[?&]from=([a-z0-9-]+)/i.exec(location.search);
    if (f) {
      var prefix = f[1].toLowerCase().split('_')[0];
      z = byId(prefix);
      if (z) { PICKED_BY_PARAM = true; return z; }
    }
    return live[0];
  }

  function init() {
    if (!$('tab-nearby') || !$('panel-nearby')) return;
    $('tab-nearby').addEventListener('click', open);
    /* המצבים הקיימים סוגרים את שלנו. לא נגענו ב-setMode שלהם */
    $('tab-auto').addEventListener('click', close);
    $('tab-manual').addEventListener('click', close);

    Promise.all([
      fetch('planner-data.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
      fetch('places-taxonomy.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
      /*
        התוכן העשיר. חלונית המקום מקבלת ממנו את ההמלצות הנלוות ואת
        הווידאו, דברים שלא קיימים ב-planner-data. נכשל בשקט אם אינו
        זמין, כי מצב סביבי חייב לעבוד גם בלעדיו.
      */
      fetch('attractions-info.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    ]).then(function (both) {
      DATA = both[0].attractions || [];
      TAX = both[1];
      INFO = both[2] || {};
      var zones = (TAX.coverage && TAX.coverage.zones) || [];
      ZONES = zones;
      ZONE = pickZone(zones);
      if (!ZONE) { $('tab-nearby').hidden = true; return; }
      injectStyles();
      labelTab();
      /* כניסה ישירה ממדריך אזור */
      if (/[?&]mode=nearby/.test(location.search)) open();
    }).catch(function () {
      var t = $('tab-nearby'); if (t) t.hidden = true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  window.GoLondonNearby = {
    open: open,
    /* נקודת כניסה ציבורית. משמשת לבדיקות, ותאפשר בעתיד קישור ישיר לנקודה */
    setPoint: function (lat, lng, method) { setPoint([lat, lng], method || 'api'); },
    results: function () { return results().map(function (r) { return { id: r.p.id, m: Math.round(r.d) }; }); },
    zone: function () { return ZONE; }
  };
})();
