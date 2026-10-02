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
    '@media(max-width:520px){.aff-grid{grid-template-columns:1fr;}}',
    /* קבוצת מוצרים (למשל ביטוח): כותרת אחת, ובתוכה סעיפים נפרדים לכל סוג מוצר */
    '.aff-group{border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:18px;margin-bottom:14px;background:rgba(255,255,255,.03);}',
    '.aff-group-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;}',
    '.aff-group-title{font-size:17px;font-weight:900;color:#fff;line-height:1.3;}',
    '.aff-group-section+.aff-group-section{margin-top:16px;padding-top:16px;border-top:1px dashed rgba(255,255,255,.14);}',
    '.aff-group-section-title{font-size:14.5px;font-weight:800;color:#fff;margin-bottom:4px;line-height:1.4;}',
    '.aff-group-section-desc{font-size:13px;color:rgba(255,255,255,.55);line-height:1.6;margin:0 0 10px;}',
    '.aff-group-section-note{font-size:12.5px;color:rgba(255,255,255,.5);line-height:1.65;margin:10px 0 0;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);}',
    '.aff-card--toggle{width:100%;text-align:right;font:inherit;color:inherit;cursor:pointer;-webkit-appearance:none;appearance:none;direction:rtl;}',
    '.aff-card--toggle .aff-card-cta i{transition:transform .2s;}',
    '.aff-card--toggle[aria-expanded="true"] .aff-card-cta i{transform:rotate(-90deg);}',
    '.aff-group-panel{margin-top:12px;}',
    '.aff-group-panel[hidden]{display:none;}',
    '.aff-group-panel .aff-group{margin-bottom:0;}',
    '.aff-group-title:focus:not(:focus-visible){outline:none;}'
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

  function buildCard(cfg, offer, slotId, offerId, opts) {
    opts = opts || {};
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
    /* בתוך קבוצה הכותרת היא שם הספק, כי סוג המוצר כבר כתוב בכותרת הסעיף */
    title.textContent = opts.title || offer.title;

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

  /*
    קבוצת מוצרים: למשל "ביטוח", שבתוכה סעיף "ביטוח נסיעות" עם שני ספקים
    וסעיף נפרד "ביטוח ביטול מכל סיבה". כל כרטיס בתוכה נבנה ונמדד בדיוק
    כמו כרטיס רגיל (אותו buildCard, אותו אירוע affiliate_click).
  */
  function buildGroup(cfg, group, slotId, groupId) {
    var wrap = document.createElement('div');
    wrap.className = 'aff-group';
    wrap.setAttribute('data-group', groupId);

    var head = document.createElement('div');
    head.className = 'aff-group-head';
    var icon = document.createElement('span');
    icon.className = 'aff-card-icon';
    icon.innerHTML = '<i class="fas ' + (group.icon || 'fa-layer-group') + '"></i>';
    var title = document.createElement('span');
    title.className = 'aff-group-title';
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '3');
    title.tabIndex = -1;
    title.textContent = group.title || '';
    head.appendChild(icon);
    head.appendChild(title);
    wrap.appendChild(head);

    var count = 0;
    (group.sections || []).forEach(function (section) {
      var cards = [];
      (section.offers || []).forEach(function (offerId) {
        var offer = cfg.offers && cfg.offers[offerId];
        if (!offer || !offer.url) return;
        cards.push(buildCard(cfg, offer, slotId, offerId, { title: offer.brand || offer.title }));
      });
      if (!cards.length) return;

      var sec = document.createElement('div');
      sec.className = 'aff-group-section';
      sec.setAttribute('data-section', section.id || '');
      var st = document.createElement('div');
      st.className = 'aff-group-section-title';
      st.textContent = section.title || '';
      sec.appendChild(st);
      if (section.desc) {
        var sd = document.createElement('p');
        sd.className = 'aff-group-section-desc';
        sd.textContent = section.desc;
        sec.appendChild(sd);
      }
      var grid = document.createElement('div');
      grid.className = 'aff-grid';
      cards.forEach(function (c) { grid.appendChild(c); });
      sec.appendChild(grid);
      /* הערה ניטרלית מתחת לכרטיסי הסעיף, למשל הסבר למה מחירים בין ספקים אינם ברי השוואה ישירה */
      if (section.note) {
        var sn = document.createElement('p');
        sn.className = 'aff-group-section-note';
        sn.textContent = section.note;
        sec.appendChild(sn);
      }
      wrap.appendChild(sec);
      count += cards.length;
    });

    return count ? wrap : null;
  }

  /* כרטיס מסכם אחד שפותח את הקבוצה בלחיצה, לעמודים שבהם הקבוצה המלאה תעמיס */
  function buildGroupToggle(group, panel) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'aff-card aff-card--toggle';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', panel.id);

    var head = document.createElement('div');
    head.className = 'aff-card-head';
    var icon = document.createElement('span');
    icon.className = 'aff-card-icon';
    icon.innerHTML = '<i class="fas ' + (group.icon || 'fa-layer-group') + '"></i>';
    var title = document.createElement('span');
    title.className = 'aff-card-title';
    title.textContent = group.summary_title || group.title || '';
    head.appendChild(icon);
    head.appendChild(title);

    var desc = document.createElement('p');
    desc.className = 'aff-card-desc';
    desc.textContent = group.summary_desc || '';

    var cta = document.createElement('span');
    cta.className = 'aff-card-cta';
    cta.innerHTML = '<i class="fas fa-arrow-left"></i> ' + (group.summary_cta || 'הצגת האפשרויות');

    b.appendChild(head);
    b.appendChild(desc);
    b.appendChild(cta);

    b.addEventListener('click', function () {
      var open = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (open) {
        panel.hidden = true;
      } else {
        panel.hidden = false;
        var h = panel.querySelector('.aff-group-title');
        if (h && h.focus) h.focus({ preventScroll: false });
      }
    });

    return b;
  }

  function renderInto(container, cfg) {
    var slotId = container.getAttribute('data-affiliate');
    var offerIds = (cfg.slots && cfg.slots[slotId]) || [];
    /*
      מיקום שהוכרז בעמוד ולא הוגדר בקובץ ההגדרות השאיר עד היום בלוק ריק
      בלי שום סימן, וכך אחד עשר עמודים איבדו את קישורי ההכנסה שלהם בשקט.
      אזהרה בקונסול הופכת תקלה שקטה לתקלה שרואים.
    */
    if (!offerIds.length) {
      if (window.console && console.warn) {
        console.warn('[affiliate] מיקום לא מוכר או ריק: "' + slotId + '". יש להגדיר אותו ב-affiliate.json');
      }
      return;
    }

    var block = document.createElement('div');
    block.className = 'aff-block';

    var heading = container.getAttribute('data-title') || 'שווה לבדוק לפני הנסיעה';
    var titleEl = document.createElement('div');
    titleEl.className = 'aff-block-title';
    titleEl.textContent = heading;
    block.appendChild(titleEl);

    var grid = document.createElement('div');
    grid.className = 'aff-grid';

    /* קבוצות שנפתחות מראש מוצגות מעל הרשת, קבוצות מכווצות מקבלות כרטיס ברשת ופאנל מתחתיה */
    var expandedGroups = [];
    var panels = [];
    var groupNote = '';
    var cardCount = 0;

    offerIds.forEach(function (offerId) {
      var group = cfg.groups && cfg.groups[offerId];
      if (group && group.sections) {
        var el = buildGroup(cfg, group, slotId, offerId);
        if (!el) return;
        if (group.note && !groupNote) groupNote = group.note;
        cardCount += el.querySelectorAll('.aff-card').length;
        var expanded = (group.expanded_in_slots || []).indexOf(slotId) !== -1;
        if (expanded) {
          expandedGroups.push(el);
        } else {
          var panel = document.createElement('div');
          panel.className = 'aff-group-panel';
          panel.id = 'aff-group-' + offerId + '-' + slotId;
          panel.hidden = true;
          panel.appendChild(el);
          panels.push(panel);
          grid.appendChild(buildGroupToggle(group, panel));
        }
        return;
      }
      var offer = cfg.offers && cfg.offers[offerId];
      if (!offer || !offer.url) return;
      grid.appendChild(buildCard(cfg, offer, slotId, offerId));
      cardCount += 1;
    });

    if (!cardCount) return;
    expandedGroups.forEach(function (g) { block.appendChild(g); });
    if (grid.children.length) block.appendChild(grid);
    panels.forEach(function (p) { block.appendChild(p); });

    var note = document.createElement('p');
    note.className = 'aff-note';
    /* בבלוק שמכיל קישורים המשויכים לסוכן (ולא רק קישורי שותפים) הניסוח מגיע מהקבוצה עצמה,
       בלי טענה על מחיר זהה לרכישה ישירה */
    note.innerHTML = (groupNote
      ? groupNote.replace(/</g, '&lt;') + ' אנחנו ממליצים רק על שירותים שהיינו ממליצים עליהם גם בלי זה. '
      : 'חלק מהקישורים כאן הם קישורי שותפים. אם תזמינו דרכם, גו לונדון עשוי לקבל עמלה מהספק. ') +
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
