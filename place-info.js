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
    כשcta.custom קיים, cta.href הוא כתובת האתר הרשמי הספציפי של המקום
    (פרלמנט, IWM, HRP וכו'), שנמצאה במחקר בפועל, ואין לה קשר לרשת
    השותפים. אסור להעביר אותה דרך בונה קישורי טיקטס הכללי, כי זה היה
    דורס אותה בקישור לעמוד קטגוריה גנרי בטיקטס ומטעה את הקורא.
    בכל שאר המקרים, אם שכבת קישורי ההכנסה נטענה, הקישור נבנה דרכה כדי
    שהלחיצה תיספר ותישא עמלה. אם היא לא נטענה, מוחזרת הכתובת הישירה.
  */
  function ctaUrl(cta, placeId) {
    if (cta.custom) return cta.href || '#';
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
      '.pi-tag.pi-teen{background:rgba(202,138,4,.13);color:#854d0e!important;}',
      '.pi-title{font-size:21px;font-weight:900;color:#201f2b!important;margin-bottom:12px;padding-left:44px;line-height:1.3;}',
      '.pi-body{font-size:15px;color:#55596b!important;line-height:1.75;margin-bottom:16px;white-space:pre-line;}',
      '.pi-video{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 16px;border-radius:14px;background:#FF0000;border:none;color:#fff!important;font-weight:800;font-size:14.5px;text-decoration:none!important;box-shadow:0 2px 8px rgba(255,0,0,.25);transition:transform .12s ease,box-shadow .12s ease;}',
      '.pi-video:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(255,0,0,.35);}',
      '.pi-video-icon{flex-shrink:0;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;}',
      '.pi-video-icon i{color:#fff;font-size:18px;}',
      '.pi-video-text{display:flex;flex-direction:column;gap:1px;}',
      '.pi-video-label{font-size:11px;font-weight:700;color:rgba(255,255,255,.8)!important;}',
      '.pi-video-title{font-size:14.5px;font-weight:800;color:#fff!important;}',
      '.pi-tip{background:rgba(21,128,61,.07);border:1px solid rgba(21,128,61,.2);border-radius:13px;padding:14px 16px;font-size:13.5px;color:#3d4152!important;line-height:1.65;margin-bottom:14px;}',
      '.pi-tip strong{color:#15803D!important;}',
      '.pi-tour{background:rgba(32,31,43,.035);border:1px solid rgba(32,31,43,.11);border-radius:13px;padding:16px 18px;margin-bottom:16px;}',
      '.pi-tour-price{display:flex;align-items:baseline;gap:8px;margin-bottom:8px;}',
      '.pi-tour-price .num{font-size:19px;font-weight:900;color:#201f2b!important;}',
      '.pi-tour-price .dur{font-size:12.5px;color:#858a9c!important;}',
      '.pi-tour-note{font-size:12px;color:#858a9c!important;margin-bottom:10px;}',
      '.pi-tour-desc{font-size:13.5px;color:#55596b!important;line-height:1.7;}',
      '.pi-cta{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#DC2626,#EA580C);color:#fff!important;font-weight:800;font-size:14px;padding:12px 20px;border-radius:11px;text-decoration:none!important;}',
      '.pi-cta:hover{opacity:.92;}',
      /*
        המלצה נלווית. חוויה בתשלום שיוצאת מהמקום עצמו אבל אינה המקום,
        למשל שיט בתעלה שמתחיל בקמדן לוק. מוצגת כהמלצה נפרדת ולא
        כאילו היא המקום, כדי שלא ייווצר רושם שצריך לשלם על הכניסה.
      */
      '.pi-extra{border:1px dashed rgba(220,38,38,.34);background:rgba(220,38,38,.04);',
        'border-radius:13px;padding:14px 16px;margin-bottom:16px;}',
      '.pi-extra-h{font-size:12px;font-weight:800;color:#B91C1C!important;letter-spacing:.02em;margin-bottom:4px;}',
      '.pi-extra-t{font-size:14.5px;font-weight:800;color:#201f2b!important;margin-bottom:3px;}',
      '.pi-extra-d{font-size:13px;color:#55596b!important;line-height:1.6;margin-bottom:10px;}',
      '.pi-extra-p{font-size:12.5px;color:#858a9c!important;margin-bottom:10px;font-variant-numeric:tabular-nums;}',
      '.pi-extra a{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:800;',
        'padding:9px 16px;border-radius:10px;border:1px solid #DC2626;background:#fff;',
        'color:#DC2626!important;text-decoration:none!important;}',
      '.pi-extra a:hover{background:#DC2626;color:#fff!important;}',
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
        '<a class="pi-video" href="#" target="_blank" rel="noopener" hidden>' +
          '<span class="pi-video-icon"><i class="fas fa-play"></i></span>' +
          '<span class="pi-video-text"><span class="pi-video-label">יוטיוב</span><span class="pi-video-title">לצפייה בסרטון על המקום</span></span>' +
        '</a>' +
        '<div class="pi-body"></div>' +
        '<div class="pi-tip" hidden></div>' +
        '<div class="pi-tour" hidden></div>' +
        '<div class="pi-extra" hidden></div>' +
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
    openItem(item, id);
  }

  /*
    גרסה ציבורית שמקבלת פריט מוכן במקום לחפש אותו במילון של העמוד.
    זה מה שמאפשר לסקריפט auto-link-places.js לפתוח את אותו חלון בדיוק
    עבור מקום שהוזכר בתוך טקסט חופשי במאמר או בפוסט, גם כשהמקום מגיע
    ממקור נתונים אחר לגמרי מזה שהעמוד עצמו טעון איתו.
  */
  function openItem(item, id) {
    if (!modal) { injectStyles(); buildModal(); }
    if (!item) return;

    lastFocused = document.activeElement;
    if (window.glTrack) glTrack('place_open', { place: item.title, place_id: id || '' });

    titleEl.textContent = item.title;

    tagEl.innerHTML = '';
    (item.tags || []).forEach(function (t) {
      var span = document.createElement('span');
      span.className = 'pi-tag' + (t.type ? ' pi-' + t.type : '');
      span.textContent = t.label;
      tagEl.appendChild(span);
    });

    bodyEl.textContent = item.body || '';

    var videoEl = modal.querySelector('.pi-video');
    if (item.video && item.video.id) {
      videoEl.hidden = false;
      videoEl.href = 'https://www.youtube.com/watch?v=' + item.video.id;
    } else {
      videoEl.hidden = true;
    }

    var tipEl = modal.querySelector('.pi-tip');
    if (item.tip) {
      tipEl.hidden = false;
      tipEl.innerHTML = '<strong>טיפ:</strong> ' + item.tip;
    } else {
      tipEl.hidden = true;
    }

    /*
      כאשר cta.custom קיים, יש לפריט תוכן סיור מקורי שנכתב על ידינו,
      עם מחיר אמיתי שנבדק. מוצג בלוק מפורט, וכפתור ההזמנה מוביל
      לספק רק בסוף, אחרי שהקורא כבר קרא הסבר עברי מלא במקום.
      בלי cta.custom חוזרים להתנהגות הרגילה, קישור בלבד.
    */
    var tourEl = modal.querySelector('.pi-tour');
    var CURRENCY_SYMBOL = { GBP: '£', EUR: '€', USD: '$', ILS: '₪' };
    if (item.cta && item.cta.custom) {
      tourEl.hidden = false;
      var sym = CURRENCY_SYMBOL[item.cta.currency] || (item.cta.currency || '');
      var priceHtml = (item.cta.price != null)
        ? '<span class="num">' + sym + item.cta.price + '</span>' + (item.cta.duration ? '<span class="dur">' + item.cta.duration + '</span>' : '')
        : '';
      tourEl.innerHTML =
        (priceHtml ? '<div class="pi-tour-price">' + priceHtml + '</div>' : '') +
        (item.cta.priceNote ? '<div class="pi-tour-note">' + item.cta.priceNote + '</div>' : '') +
        '<div class="pi-tour-desc">' + (item.cta.desc || '') + '</div>';
    } else {
      tourEl.hidden = true;
    }

    /* המלצה נלווית, אופציונלית */
    var extraEl = modal.querySelector('.pi-extra');
    if (item.extra && item.extra.href) {
      var e = item.extra;
      extraEl.hidden = false;
      extraEl.innerHTML =
        '<div class="pi-extra-h">' + (e.kicker || 'המלצה מיוחדת') + '</div>' +
        '<div class="pi-extra-t">' + (e.title || '') + '</div>' +
        (e.desc ? '<div class="pi-extra-d">' + e.desc + '</div>' : '') +
        (e.priceNote ? '<div class="pi-extra-p">' + e.priceNote + '</div>' : '') +
        '<a href="' + ctaUrl(e, id + '__extra') + '" target="_blank" rel="sponsored noopener nofollow">' +
        '<i class="fas fa-ship"></i> ' + (e.label || 'לפרטים ולהזמנה') + '</a>';
    } else {
      extraEl.hidden = true;
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

    /*
      נקודת חיבור לשכבת "הוסף למסלול", ובכוונה בסוף הפונקציה. קודם לכן
      ctaWrap עדיין נמחק ומאוכלס מחדש, וכל מה שהושתל בו היה נמחק.
      trip-tray.js מחליט לבד אם למקום יש רשומה במאגר ולכן מגיע לו כפתור.
    */
    try {
      document.dispatchEvent(new CustomEvent('gl:place-open', { detail: { id: id || '', item: item } }));
    } catch (e) {}
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

  /*
    ממשק ציבורי, כדי ש auto-link-places.js יוכל לפתוח את אותו חלון
    בדיוק עבור מקום שנמצא בתוך טקסט חופשי, בלי תלות בקובץ הנתונים
    שהעמוד עצמו טעון איתו.
  */
  window.GoLondonPlaceInfo = { openItem: openItem };
})();
