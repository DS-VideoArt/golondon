/*
  חלון מידע למקומות כשרים בתוך עמודי התוכן.
  ================================
  עמודי guide-kosher-*.html מציגים רשימות מקומות סטטיות (.place), בלי
  אפשרות ללחוץ ולקבל יותר. הסקריפט הזה מתאים כל כרטיס למקום המתאים לו
  בקובץ kosher-places.json, לפי שם, ופותח חלון עם כתובת מלאה, טלפון,
  השגחה וניווט אמיתי בוויז, בדיוק כמו החלון שנפתח בלחיצה על סמן במפת
  הכשרות. אין כאן תיאור או וידאו מומצא, כי לרוב המקומות האלה אין תוכן
  אמיתי כזה, רק את הנתונים שבאמת קיימים.
*/
(function () {
  'use strict';

  var modal, panel, byName = {};

  function decode(s) {
    var t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value.trim();
  }

  function injectStyles() {
    if (document.getElementById('kp-modal-styles')) return;
    var css = [
      '.place{cursor:pointer;transition:transform .12s ease,box-shadow .12s ease;}',
      '.place:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(16,24,40,.08);}',
      '.kp-overlay{position:fixed;inset:0;z-index:2000;background:rgba(20,20,30,.46);backdrop-filter:blur(2px);display:none;align-items:flex-end;justify-content:center;}',
      '.kp-overlay.kp-open{display:flex;}',
      '@media(min-width:640px){.kp-overlay.kp-open{align-items:center;padding:24px;}}',
      '.kp-panel{background:#fff;width:100%;max-width:440px;max-height:82vh;overflow-y:auto;border-radius:20px 20px 0 0;box-shadow:0 -8px 40px rgba(16,24,40,.25);padding:26px 24px 28px;position:relative;}',
      '@media(min-width:640px){.kp-panel{border-radius:20px;}}',
      '.kp-close{position:absolute;top:16px;left:16px;width:34px;height:34px;border-radius:10px;background:rgba(32,31,43,.06);border:none;color:#55596b;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
      '.kp-close:hover{background:rgba(32,31,43,.12);color:#201f2b;}',
      '.kp-badge{display:inline-block;font-size:11.5px;font-weight:800;padding:4px 11px;border-radius:50px;background:rgba(32,31,43,.06);color:#55596b!important;margin-bottom:12px;}',
      '.kp-title{font-size:20px;font-weight:900;color:#201f2b!important;margin-bottom:14px;padding-left:44px;line-height:1.3;direction:ltr;text-align:right;}',
      '.kp-row{display:flex;align-items:flex-start;gap:10px;font-size:14.5px;color:#55596b!important;line-height:1.6;margin-bottom:12px;}',
      '.kp-row i{color:#DC2626;width:16px;text-align:center;margin-top:3px;}',
      '.kp-row a{color:#55596b!important;text-decoration:none!important;direction:ltr;text-align:right;}',
      '.kp-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px;}',
      '.kp-btn{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:14px;padding:12px 18px;border-radius:11px;text-decoration:none!important;}',
      '.kp-btn-waze{background:linear-gradient(135deg,#DC2626,#EA580C);color:#fff!important;}',
      '.kp-btn-waze:hover{opacity:.92;}',
      '.kp-btn-call{background:rgba(32,31,43,.06);color:#201f2b!important;border:1px solid rgba(32,31,43,.12);}',
      '.kp-btn-call:hover{background:rgba(32,31,43,.1);}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'kp-modal-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'kp-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="kp-panel" role="document">' +
        '<button type="button" class="kp-close" aria-label="סגירה"><i class="fas fa-xmark"></i></button>' +
        '<span class="kp-badge"></span>' +
        '<h3 class="kp-title"></h3>' +
        '<div class="kp-body"></div>' +
        '<div class="kp-actions"></div>' +
      '</div>';
    document.body.appendChild(modal);
    panel = modal.querySelector('.kp-panel');
    modal.querySelector('.kp-close').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('kp-open')) close();
    });
  }

  function open(p) {
    if (!modal) { injectStyles(); buildModal(); }
    /* אותו אירוע בדיוק כמו במפה, ונבדל ממנה רק בפרמטר source_component */
    if (window.glTrack) glTrack('kosher_place_open', {
      place: p.name,
      place_id: p.id || '',
      category: p.category || '',
      area: (String(p.postcode || '').match(/^[A-Z]+/) || [''])[0],
      source_component: 'article'
    });
    modal.querySelector('.kp-badge').textContent = p.category || '';
    modal.querySelector('.kp-title').textContent = p.name;

    var body = modal.querySelector('.kp-body');
    body.innerHTML =
      '<div class="kp-row"><i class="fas fa-location-dot"></i><span>' + p.address + ', ' + p.postcode + '</span></div>' +
      (p.phone ? '<div class="kp-row"><i class="fas fa-phone"></i><a href="tel:' + p.phone + '">' + p.phone + '</a></div>' : '') +
      '<div class="kp-row"><i class="fas fa-star-of-david"></i><span>' + p.kashrus + '</span></div>';

    var actions = modal.querySelector('.kp-actions');
    var wazeUrl = 'https://waze.com/ul?ll=' + p.lat + ',' + p.lng + '&navigate=yes';
    actions.innerHTML =
      '<a class="kp-btn kp-btn-waze" href="' + wazeUrl + '" target="_blank" rel="noopener"><i class="fas fa-diamond-turn-right"></i> ניווט בוויז</a>' +
      (p.phone ? '<a class="kp-btn kp-btn-call" href="tel:' + p.phone + '"><i class="fas fa-phone"></i> התקשרות</a>' : '');

    modal.classList.add('kp-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!modal) return;
    modal.classList.remove('kp-open');
    document.body.style.overflow = '';
  }

  function wire() {
    document.querySelectorAll('.place').forEach(function (el) {
      if (el.__kpWired) return;
      var nameEl = el.querySelector('.place-name');
      if (!nameEl) return;
      var name = decode(nameEl.innerHTML);
      var p = byName[name];
      if (!p) return;
      el.__kpWired = true;
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', function () { open(p); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p); }
      });
    });
  }

  function init() {
    if (!document.querySelector('.place')) return;
    injectStyles();
    fetch('kosher-places.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        list.forEach(function (p) { byName[p.name] = p; });
        wire();
        var mo = new MutationObserver(wire);
        mo.observe(document.body, { childList: true, subtree: true });
      })
      .catch(function (err) { if (window.console) console.warn('[kosher-places-modal]', err.message); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ממשק ציבורי, לאותה סיבה שיש ל GoLondonPlaceInfo ב place-info.js */
  window.GoLondonKosherInfo = { open: open };
})();
