/*
  מנוע כרטיסי המידע של גו לונדון
  ================================
  רכיב אחד וגנרי, לשימוש בכל עמוד שיש בו רשימת מקומות: אטרקציות,
  קבוצות כדורגל, שכונות, מסעדות. לוחצים על פריט ברשימה, נפתח חלון
  פנימי עם מידע מורחב, בלי לצאת מהעמוד.

  איך משתמשים בזה בעמוד חדש:
  1. לטעון את הסקריפט הזה, ואת קובץ הנתונים של העמוד:
     <script src="place-info.js" defer data-source="attractions-info.json"></script>
  2. לסמן כל פריט לחיץ ברשימה עם data-place="מזהה_הפריט":
     <div class="num-item" data-place="big-ben">...</div>
  3. זהו. הרכיב דואג לכל השאר: קליק, פתיחה, סגירה, נגישות.

  קובץ הנתונים הוא מילון פשוט { "מזהה": { title, tag, area, price, body, tip } }.
*/

(function () {
  'use strict';

  var data = null;
  var modal, panel, titleEl, tagEl, bodyEl, closeBtn;
  var lastFocused = null;
  var affCfg = null;

  /*
    כתובת כפתור ההזמנה.
    אם שכבת קישורי ההכנסה נטענה, הקישור נבנה דרכה כדי שהלחיצה תיספר
    ותישא עמלה, עם מזהה מקור נפרד לכל מקום. אם היא לא נטענה, מוחזרת
    הכתובת הישירה שרשומה בקובץ הנתונים, כדי שהכפתור תמיד יעבוד.
  */
  function ctaUrl(cta, placeId) {
    var offerId = cta.offer || 'attractions_alt';
    if (affCfg && window.GoLondonAffiliate && window.GoLondonAffiliate.linkFor) {
      var url = window.GoLondonAffiliate.linkFor(affCfg, offerId, 'placeinfo', placeId);
      if (url) return url;
    }
    return cta.href || '#';
  }

  function hookAffiliate(tries) {
    tries = tries || 0;
    if (window.GoLondonAffiliate && window.GoLondonAffiliate.whenReady) {
      window.GoLondonAffiliate.whenReady(function (cfg) { affCfg = cfg; });
      return;
    }
    if (tries < 40) setTimeout(function () { hookAffiliate(tries + 1); }, 50);
  }

  /*
    document.currentScript תקף רק בזמן שהסקריפט רץ בפועל. אם נקרא לו
    בתוך callback אסינכרוני, כמו מתוך DOMContentLoaded, הוא כבר יהיה
    null. לכן חובה ללכוד אותו כאן, ברמה העליונה של הקובץ, מיד עם הטעינה.
  */
  var thisScript = document.currentScript;

  function injectStyles() {
    if (document.getElementById('place-info-styles')) return;
    var css = [
      /*
        החלון גלוי ברגע שמוסיפים לו את המחלקה, בלי להמתין למעבר.
        בעבר הוא התחיל בשקיפות אפס והסתמך על אנימציה, וזה בדיוק
        הדפוס שגרם לרכיבים אחרים באתר להישאר בלתי נראים אף שהיו פתוחים.
      */
      '.pi-overlay{position:fixed;inset:0;z-index:2000;background:rgba(20,20,30,.46);backdrop-filter:blur(2px);align-items:flex-end;justify-content:center;display:none;}',
      '.pi-overlay.pi-open{display:flex;}',
      '@media(min-width:640px){.pi-overlay.pi-open{align-items:center;padding:24px;}}',
      '.pi-panel{background:#fff;width:100%;max-width:520px;max-height:82vh;overflow-y:auto;border-radius:20px 20px 0 0;box-shadow:0 -8px 40px rgba(16,24,40,.25);padding:26px 24px 30px;position:relative;}',
      '@media(min-width:640px){.pi-panel{border-radius:20px;}}',
      '.pi-close{position:absolute;top:16px;left:16px;width:34px;height:34px;border-radius:10px;background:rgba(32,31,43,.06);border:none;color:#55596b;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;}',
      '.pi-close:hover{background:rgba(32,31,43,.12);color:#201f2b;}',
      '.pi-tags{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px;padding-left:44px;}',
      '.pi-tag{font-size:11.5px;font-weight:800;padding:4px 11px;border-radius:50px;background:rgba(32,31,43,.06);color:#55596b!important;}',
      '.pi-tag.pi-free{background:rgba(21,128,61,.12);color:#15803D!important;}',
      '.pi-tag.pi-paid{background:rgba(234,88,12,.13);color:#c2410c!important;}',
      '.pi-title{font-size:21px;font-weight:900;color:#201f2b!important;margin-bottom:12px;padding-left:44px;line-height:1.3;}',
      '.pi-body{font-size:15px;color:#55596b!important;line-height:1.75;margin-bottom:16px;white-space:pre-line;}',
      '.pi-tip{background:rgba(21,128,61,.07);border:1px solid rgba(21,128,61,.2);border-radius:13px;padding:14px 16px;font-size:13.5px;color:#3d4152!important;line-height:1.65;margin-bottom:14px;}',
      '.pi-tip strong{color:#15803D!important;}',
      '.pi-cta{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#DC2626,#EA580C);color:#fff!important;font-weight:800;font-size:14px;padding:12px 20px;border-radius:11px;text-decoration:none!important;}',
      '.pi-cta:hover{opacity:.92;}',
      '.pi-updated{font-size:11.5px;color:#858a9c;margin-top:16px;}',
      '[data-place]{cursor:pointer;}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'place-info-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'pi-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="pi-panel" role="document">' +
        '<button type="button" class="pi-close" aria-label="סגירה"><i class="fas fa-xmark"></i></button>' +
        '<div class="pi-tags"></div>' +
        '<h3 class="pi-title"></h3>' +
        '<div class="pi-body"></div>' +
        '<div class="pi-tip" hidden></div>' +
        '<div class="pi-cta-wrap"></div>' +
        '<div class="pi-updated" hidden></div>' +
      '</div>';
    document.body.appendChild(modal);
    panel = modal.querySelector('.pi-panel');
    titleEl = modal.querySelector('.pi-title');
    tagEl = modal.querySelector('.pi-tags');
    bodyEl = modal.querySelector('.pi-body');
    closeBtn = modal.querySelector('.pi-close');

    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('pi-open')) close();
    });
  }

  function open(id) {
    var item = data && data[id];
    if (!item) return;

    lastFocused = document.activeElement;

    titleEl.textContent = item.title;

    tagEl.innerHTML = '';
    (item.tags || []).forEach(function (t) {
      var span = document.createElement('span');
      span.className = 'pi-tag' + (t.type ? ' pi-' + t.type : '');
      span.textContent = t.label;
      tagEl.appendChild(span);
    });

    bodyEl.textContent = item.body || '';

    var tipEl = modal.querySelector('.pi-tip');
    if (item.tip) {
      tipEl.hidden = false;
      tipEl.innerHTML = '<strong>טיפ:</strong> ' + item.tip;
    } else {
      tipEl.hidden = true;
    }

    var ctaWrap = modal.querySelector('.pi-cta-wrap');
    ctaWrap.innerHTML = '';
    if (item.cta) {
      var a = document.createElement('a');
      a.className = 'pi-cta';
      a.href = ctaUrl(item.cta, id);
      a.target = '_blank';
      a.rel = 'sponsored noopener nofollow';
      a.innerHTML = '<i class="fas fa-ticket"></i> ' + item.cta.label;
      ctaWrap.appendChild(a);
    }

    var upd = modal.querySelector('.pi-updated');
    if (item.updated) { upd.hidden = false; upd.textContent = 'עודכן לאחרונה: ' + item.updated; }
    else { upd.hidden = true; }

    modal.classList.add('pi-open');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    modal.classList.remove('pi-open');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function wireTriggers() {
    document.querySelectorAll('[data-place]').forEach(function (el) {
      if (el.__piWired) return;
      el.__piWired = true;
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', function () { open(el.getAttribute('data-place')); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el.getAttribute('data-place')); }
      });
    });
  }

  function init() {
    var script = thisScript || document.querySelector('script[data-source]');
    var src = script && script.getAttribute('data-source');
    if (!src) return;

    injectStyles();
    buildModal();
    hookAffiliate();

    fetch(src, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('place-info source לא נטען'); return r.json(); })
      .then(function (json) {
        data = json;
        wireTriggers();
        var mo = new MutationObserver(wireTriggers);
        mo.observe(document.body, { childList: true, subtree: true });
      })
      .catch(function (err) { if (window.console) console.warn('[place-info]', err.message); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
