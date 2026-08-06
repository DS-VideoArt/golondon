/*
  שכבת קישורי ההכנסה של גו לונדון
  ================================
  איך זה עובד:
  1. בעמוד מוסיפים אלמנט אחד ריק, לדוגמה:
     <div data-affiliate="oyster"></div>
  2. הסקריפט קורא את affiliate.json, מוצא את רשימת ההצעות של אותו מיקום,
     ומרנדר אותן יחד עם משפט גילוי נאות.
  3. כל קישור נבנה עם מזהה מקור ייחודי, כדי שאפשר יהיה לדעת בדיוק
     איזה עמוד ואיזה מיקום הכניסו כסף.

  חשוב: אין לכתוב קישורי שותפים ישירות בתוך עמודי HTML.
  כל שינוי נעשה בקובץ affiliate.json בלבד.
*/

(function () {
  'use strict';

  var CONFIG_URL = 'affiliate.json';
  var DISCLOSURE_URL = 'disclosure.html';

  var STYLES = [
    '.aff-block{margin:30px 0;}',
    '.aff-block-title{font-size:13px;font-weight:800;letter-spacing:.4px;color:rgba(255,255,255,.45);margin-bottom:12px;display:flex;align-items:center;gap:8px;}',
    '.aff-block-title::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.1);}',
    '.aff-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}',
    '.aff-card{display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:18px 18px 16px;transition:border-color .2s,background .2s,transform .2s;}',
    '.aff-card:hover{background:rgba(234,88,12,.08);border-color:rgba(234,88,12,.4);transform:translateY(-2px);}',
    '.aff-card-head{display:flex;align-items:center;gap:10px;}',
    '.aff-card-icon{width:34px;height:34px;flex:0 0 34px;border-radius:9px;background:linear-gradient(135deg,#DC2626,#EA580C);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;}',
    '.aff-card-title{font-size:15px;font-weight:800;color:#fff;line-height:1.35;}',
    '.aff-card-desc{font-size:13.5px;color:rgba(255,255,255,.62);line-height:1.6;margin:0;}',
    '.aff-card-cta{margin-top:auto;padding-top:6px;display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:800;color:#fdba74;}',
    '.aff-card:hover .aff-card-cta{color:#fb923c;}',
    '.aff-card,.aff-card:hover{text-decoration:none;}',
    '.aff-note{margin-top:12px;font-size:12px;color:rgba(255,255,255,.38);line-height:1.6;}',
    '.aff-note a{color:rgba(147,197,253,.75);}',
    '@media(max-width:520px){.aff-grid{grid-template-columns:1fr;}}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('aff-styles')) return;
    var el = document.createElement('style');
    el.id = 'aff-styles';
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  /* מזהה העמוד נגזר משם הקובץ, כדי שלא צריך להגדיר אותו ידנית בכל עמוד */
  function currentPageId() {
    var name = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/i, '');
    return (name || 'index').replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
  }

  function buildSubId(cfg, slotId, offerId, extra) {
    var sep = (cfg.tracking && cfg.tracking.sub_id_separator) || '__';
    var max = (cfg.tracking && cfg.tracking.max_sub_id_length) || 60;
    var parts = [currentPageId(), slotId, offerId];
    if (extra) parts.push(String(extra).replace(/[^a-z0-9_-]/gi, '').slice(0, 20));
    return parts.join(sep).slice(0, max);
  }

  /*
    בונה את כתובת היעד הסופית.
    כל עוד אין מזהה חשבון ברשת השותפים, או שההצעה הספציפית עדיין לא הוגדרה בה,
    מוחזר הקישור הישיר לספק. העמוד עובד ומועיל לגולש בכל מקרה.
  */
  function buildUrl(cfg, offer, slotId, offerId, extra) {
    /* חלק מהספקים ב-Travelpayouts לא עובדים עם פורמט ה-marker/program_id הרגיל
       ומספקים במקום זה קישור מעקב קבוע משלהם. אם קיים כזה, משתמשים בו ישירות. */
    if (offer.direct_link) return offer.direct_link;

    var net = cfg.network || {};
    var ready = net.marker && offer.program_id;
    if (!ready) return offer.url;

    var params = [
      'marker=' + encodeURIComponent(net.marker),
      'p=' + encodeURIComponent(offer.program_id),
      'u=' + encodeURIComponent(offer.url),
      'sub_id=' + encodeURIComponent(buildSubId(cfg, slotId, offerId, extra))
    ];
    if (offer.campaign_id) params.push('campaign_id=' + encodeURIComponent(offer.campaign_id));
    if (net.trs) params.push('trs=' + encodeURIComponent(net.trs));

    return net.redirect_base + '?' + params.join('&');
  }

  function buildCard(cfg, offer, slotId, offerId) {
    var a = document.createElement('a');
    a.className = 'aff-card';
    a.href = buildUrl(cfg, offer, slotId, offerId);
    a.target = '_blank';
    /* sponsored הוא הסימון שגוגל דורש על קישור שיש מאחוריו תמורה כספית */
    a.rel = 'sponsored noopener nofollow';
    a.setAttribute('data-offer', offerId);
    a.setAttribute('data-slot', slotId);

    var head = document.createElement('div');
    head.className = 'aff-card-head';

    var icon = document.createElement('span');
    icon.className = 'aff-card-icon';
    icon.innerHTML = '<i class="fas ' + (offer.icon || 'fa-arrow-left') + '"></i>';

    var title = document.createElement('span');
    title.className = 'aff-card-title';
    title.textContent = offer.title;

    head.appendChild(icon);
    head.appendChild(title);

    var desc = document.createElement('p');
    desc.className = 'aff-card-desc';
    desc.textContent = offer.desc;

    var cta = document.createElement('span');
    cta.className = 'aff-card-cta';
    cta.innerHTML = '<i class="fas fa-arrow-left"></i> ' + (offer.cta || 'למידע נוסף');

    a.appendChild(head);
    a.appendChild(desc);
    a.appendChild(cta);

    a.addEventListener('click', function () {
      /* אירוע פתוח שכל שכבת מדידה עתידית יכולה להאזין לו, בלי לשנות את הקובץ הזה */
      document.dispatchEvent(new CustomEvent('golondon:affiliate-click', {
        detail: { offer: offerId, slot: slotId, page: currentPageId(), brand: offer.brand }
      }));
    });

    return a;
  }

  function renderInto(container, cfg) {
    var slotId = container.getAttribute('data-affiliate');
    var offerIds = (cfg.slots && cfg.slots[slotId]) || [];
    if (!offerIds.length) return;

    var block = document.createElement('div');
    block.className = 'aff-block';

    var heading = container.getAttribute('data-title') || 'שווה לבדוק לפני הנסיעה';
    var titleEl = document.createElement('div');
    titleEl.className = 'aff-block-title';
    titleEl.textContent = heading;
    block.appendChild(titleEl);

    var grid = document.createElement('div');
    grid.className = 'aff-grid';

    offerIds.forEach(function (offerId) {
      var offer = cfg.offers && cfg.offers[offerId];
      if (!offer || !offer.url) return;
      grid.appendChild(buildCard(cfg, offer, slotId, offerId));
    });

    if (!grid.children.length) return;
    block.appendChild(grid);

    var note = document.createElement('p');
    note.className = 'aff-note';
    note.innerHTML = 'חלק מהקישורים כאן הם קישורי שותפים. אם תזמינו דרכם, גו לונדון עשוי לקבל עמלה מהספק, ' +
      'בלי שתשלמו שקל נוסף. אנחנו ממליצים רק על שירותים שהיינו ממליצים עליהם גם בלי זה. ' +
      '<a href="' + DISCLOSURE_URL + '">גילוי נאות מלא</a>';
    block.appendChild(note);

    container.appendChild(block);
  }

  /*
    ממשק ציבורי לעמודים שבונים קישורים בעצמם, למשל בונה המסלול,
    שצריך קישור כרטיסים נפרד לכל אטרקציה במסלול.
    כך לוגיקת בניית הקישור והמעקב נשארת במקום אחד בלבד.
  */
  var loaded = null;

  window.GoLondonAffiliate = {
    whenReady: function (cb) {
      if (loaded) loaded.then(cb).catch(function () {});
    },
    /* extra מאפשר לפצל את המדידה גם ברמת הפריט הבודד בתוך העמוד */
    linkFor: function (cfg, offerId, slotId, extra) {
      var offer = cfg && cfg.offers && cfg.offers[offerId];
      if (!offer || !offer.url) return null;
      return buildUrl(cfg, offer, slotId, offerId, extra);
    }
  };

  function init() {
    injectStyles();

    loaded = fetch(CONFIG_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('affiliate.json לא נטען, סטטוס ' + r.status);
        return r.json();
      })
      .then(function (cfg) {
        document.querySelectorAll('[data-affiliate]').forEach(function (c) {
          renderInto(c, cfg);
        });
        return cfg;
      })
      .catch(function (err) {
        /* כשלון טעינה לא ישבור את העמוד. פשוט לא יוצג בלוק ההמלצות. */
        if (window.console) console.warn('[affiliate]', err.message);
        throw err;
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
