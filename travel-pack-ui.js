/*
  הורדת חוברת הטיול מתוך המתכנן
  ==============================
  כפתור "הורדת חוברת הטיול" בסרגל של המסלול האוטומטי (#pack) ושל הלוח הידני (#m-pack).
  לחיצה מבקשת את ה-PDF מ-‎/pack/<קוד מסלול>‎ (netlify/functions/travel-pack.mjs), אותו
  קוד מסלול כמו בקישור השיתוף. אין הרשמה, אין מייל ואין טלפון.

  מצבים: מוכן, מכינים, מוכן להורדה, שגיאה.
  - מוכן להורדה: "שיתוף" עם קובץ ה-PDF כשהדפדפן תומך בשיתוף קבצים (navigator.canShare),
    ו"הורדה" תמיד. השיתוף הוא לחיצה נפרדת, כי דפדפנים מאפשרים את חלון השיתוף רק מיד
    אחרי לחיצה, וההכנה לוקחת כמה שניות. לא מניחים שוואטסאפ יופיע בחלון השיתוף.
  - שגיאה: ניסיון נוסף, פתיחה ישירה של הקישור, או שמירה כ-PDF מהדפדפן (ההדפסה הקיימת).
  שום כשל כאן לא נוגע במתכנן: בלי הממשק של המתכנן (GoLondonPlannerPack) הכפתור לא מוצג.

  מדידה (רק שלושה אירועים, בלי מידע אישי):
    travel_pack_generate  לחיצה על הכפתור
    travel_pack_download  המשתמש קיבל את הקובץ (שיתוף שהושלם או הורדה)
    travel_pack_error     ההכנה נכשלה או לקחה יותר מדי זמן
  פרמטרים: planner_mode, day_count, place_count, generation_method, delivery_method,
  duration_bucket, source_component.
*/
(function () {
  'use strict';

  var TIMEOUT_MS = 45000;
  var FILE_NAME = 'golondon-travel-pack.pdf';

  var CSS = '' +
    '.mini-btn.mini-btn--pack{background:#DC2626!important;border-color:#DC2626!important;color:#fff!important;}' +
    '.mini-btn.mini-btn--pack:hover{background:#B91C1C!important;border-color:#B91C1C!important;color:#fff!important;}' +
    '.mini-btn.mini-btn--pack[disabled]{opacity:.75;cursor:progress;}' +
    '.gl-pack-status{margin:12px 0 0;padding:12px 14px;border-radius:12px;border:1px solid rgba(32,31,43,.12);background:#fff;' +
      'font-size:14px;line-height:1.55;color:#201f2b;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;}' +
    '.gl-pack-status[hidden]{display:none;}' +
    '.gl-pack-status strong{font-weight:800;}' +
    '.gl-pack-status--error{border-color:rgba(220,38,38,.35);background:rgba(220,38,38,.05);}' +
    '.gl-pack-actions{display:flex;flex-wrap:wrap;gap:8px;}' +
    '.gl-pack-act{font:inherit;font-size:13.5px;font-weight:700;border-radius:9px;padding:8px 14px;cursor:pointer;text-decoration:none;' +
      'border:1px solid rgba(32,31,43,.18);background:#fff;color:#201f2b;display:inline-flex;align-items:center;gap:6px;}' +
    '.gl-pack-act--main{background:#201f2b;border-color:#201f2b;color:#fff;}' +
    '.gl-pack-spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;' +
      'display:inline-block;animation:gl-pack-spin .8s linear infinite;}' +
    '@keyframes gl-pack-spin{to{transform:rotate(360deg)}}' +
    '@media (prefers-reduced-motion:reduce){.gl-pack-spin{animation:none;}}' +
    '@media print{.mini-btn--pack,.gl-pack-status{display:none!important;}}';

  function track(name, params) { if (window.glTrack) window.glTrack(name, params); }

  function bucket(ms) {
    var s = ms / 1000;
    if (s < 3) return 'under_3s';
    if (s < 6) return '3_6s';
    if (s < 10) return '6_10s';
    if (s < 20) return '10_20s';
    return 'over_20s';
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function setup(btn, source) {
    var label = btn.innerHTML;
    var head = btn.closest('.results-head, .board-head') || btn.parentNode;
    var status = el('div', 'gl-pack-status');
    status.hidden = true;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    head.parentNode.insertBefore(status, head.nextSibling);
    var objectUrl = null;

    function reset() {
      btn.disabled = false;
      btn.innerHTML = label;
      btn.removeAttribute('aria-busy');
    }

    function show(cls, parts) {
      status.className = 'gl-pack-status' + (cls ? ' ' + cls : '');
      status.innerHTML = '';
      parts.forEach(function (p) { status.appendChild(p); });
      status.hidden = false;
    }

    btn.addEventListener('click', function () {
      var route = window.GoLondonPlannerPack && window.GoLondonPlannerPack.current(source);
      if (!route || !route.code) { show('gl-pack-status--error', [el('span', '', 'אין עדיין מסלול להכין ממנו חוברת.')]); return; }
      var base = {
        planner_mode: route.planner_mode, day_count: route.day_count, place_count: route.place_count,
        generation_method: 'server', source_component: source === 'board' ? 'planner_board' : 'planner_results'
      };
      track('travel_pack_generate', base);

      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span class="gl-pack-spin" aria-hidden="true"></span> מכינים את החוברת';
      show('', [el('span', '', 'מכינים חוברת PDF עם מפה לכל יום. זה לוקח כמה שניות.')]);

      var t0 = Date.now();
      var url = '/pack/' + encodeURIComponent(route.code);
      var ctrl = 'AbortController' in window ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);

      fetch(url, { signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) {
          if (!r.ok || (r.headers.get('Content-Type') || '').indexOf('application/pdf') !== 0) throw new Error('status ' + r.status);
          return r.blob();
        })
        .then(function (blob) {
          clearTimeout(timer);
          reset();
          var took = bucket(Date.now() - t0);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(blob);
          var file = null;
          try { file = new File([blob], FILE_NAME, { type: 'application/pdf' }); } catch (e) { file = null; }
          var parts = [el('strong', '', 'החוברת מוכנה.')];
          var acts = el('div', 'gl-pack-actions');

          if (file && navigator.canShare && navigator.share) {
            var canFiles = false;
            try { canFiles = navigator.canShare({ files: [file] }); } catch (e) { canFiles = false; }
            if (canFiles) {
              var share = el('button', 'gl-pack-act gl-pack-act--main', 'שיתוף');
              share.type = 'button';
              share.addEventListener('click', function () {
                navigator.share({ files: [file], title: 'הטיול שלי בלונדון' }).then(function () {
                  track('travel_pack_download', Object.assign({ delivery_method: 'share', duration_bucket: took }, base));
                }).catch(function () { /* המשתמש סגר את חלון השיתוף, ההורדה עדיין זמינה */ });
              });
              acts.appendChild(share);
            }
          }
          var dl = el('a', 'gl-pack-act' + (acts.childNodes.length ? '' : ' gl-pack-act--main'), 'הורדת הקובץ');
          dl.href = objectUrl;
          dl.download = FILE_NAME;
          dl.addEventListener('click', function () {
            track('travel_pack_download', Object.assign({ delivery_method: 'download', duration_bucket: took }, base));
          });
          acts.appendChild(dl);
          parts.push(acts);
          show('', parts);
        })
        .catch(function () {
          clearTimeout(timer);
          reset();
          track('travel_pack_error', Object.assign({ duration_bucket: bucket(Date.now() - t0) }, base));
          var acts = el('div', 'gl-pack-actions');
          var retry = el('button', 'gl-pack-act gl-pack-act--main', 'ניסיון נוסף');
          retry.type = 'button';
          retry.addEventListener('click', function () { btn.click(); });
          var direct = el('a', 'gl-pack-act', 'פתיחת החוברת בלשונית חדשה');
          direct.href = url;
          direct.target = '_blank';
          direct.rel = 'noopener';
          var print = el('button', 'gl-pack-act', 'שמירה כ PDF מהדפדפן');
          print.type = 'button';
          print.addEventListener('click', function () { window.print(); });
          acts.appendChild(retry); acts.appendChild(direct); acts.appendChild(print);
          show('gl-pack-status--error', [el('span', '', 'לא הצלחנו להכין את החוברת כרגע. המסלול שלכם שמור, ואפשר לנסות שוב.'), acts]);
        });
    });

    btn.hidden = false;
  }

  function init() {
    if (!window.GoLondonPlannerPack || !window.fetch) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    var a = document.getElementById('pack'), b = document.getElementById('m-pack');
    if (a) setup(a, 'results');
    if (b) setup(b, 'board');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
