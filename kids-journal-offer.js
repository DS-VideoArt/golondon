/*
  חוברת הטיול לילדים, ניסוי ביקוש: עמוד ההצעה
  ============================================
  העמוד מציג הצעה, דף דוגמה להורדה וטופס התעניינות. אין כאן הזמנה, תשלום, הפעלת עובד או מייל אוטומטי.
  ?e=<planner|guide|winter|direct> בכתובת אומר מאיפה הגיעו (למדידה בלבד, בלי מידע אישי).

  מדידה (analytics.js, glTrack), בלי מייל ובלי תשובות הטופס מעבר לנכונות לשלם:
    journal_offer_view       פעם אחת לכל טעינת עמוד: entry, offer_price
    journal_sample_download  פעם אחת לסשן: entry, offer_price
    journal_interest_submit  רק כשהשרת קיבל רשומה חדשה (status received), פעם אחת לסשן:
                             entry, willing (yes | maybe | no), has_month, has_age, offer_price
  רשומה כפולה (already) לא נספרת. התעניינות היא לא רכישה, והאירועים לא מדווחים על הכנסה.
*/
(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/journal-interest';
  var OFFER_PRICE = 14.9;   /* המחיר המוצג בניסוי, בשקלים. נשלח כפרמטר מספרי באירועים כדי שכל תשובה תשויך למחיר שהוצג */
  var $ = function (id) { return document.getElementById(id); };
  var ENTRIES = { planner: 1, guide: 1, winter: 1 };
  var entry = (function () {
    var m = /[?&]e=([a-z]+)/.exec(location.search || '');
    return m && ENTRIES[m[1]] ? m[1] : 'direct';
  })();

  function track(name, params) { try { if (window.glTrack) window.glTrack(name, params || {}); } catch (e) { /* מדידה לא מפילה עמוד */ } }
  function session(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; }
  }
  function once(key, fn) { if (session(key)) return; session(key, '1'); fn(); }
  function showError(msg) { var e = $('jo-error'); e.textContent = msg; e.hidden = !msg; }

  /* חודשי טיול: מהחודש הנוכחי ו-17 הבאים, ערך YYYY-MM */
  function fillMonths() {
    var sel = $('jo-month'), names = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    var d = new Date(); d.setDate(1);
    for (var i = 0; i < 18; i++) {
      var y = d.getFullYear(), m = d.getMonth();
      var o = document.createElement('option');
      o.value = y + '-' + (m < 9 ? '0' : '') + (m + 1); o.textContent = names[m] + ' ' + y;
      sel.appendChild(o);
      d.setMonth(m + 1);
    }
    var age = $('jo-age');
    for (var a = 3; a <= 14; a++) { var ao = document.createElement('option'); ao.value = String(a); ao.textContent = String(a); age.appendChild(ao); }
  }

  /* השרת הוא המקור היחיד: הטופס מוצג רק כשהוא עונה enabled */
  function ask() {
    if (!window.fetch) return;
    fetch(ENDPOINT, { method: 'GET', cache: 'no-store', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.enabled === true) { $('jo-form').hidden = false; $('jo-closed').hidden = true; } })
      .catch(function () { /* בלי תשובה הטופס נשאר סגור */ });
  }

  function submit(ev) {
    ev.preventDefault();
    showError('');
    var email = $('jo-email').value.trim();
    var willing = (document.querySelector('input[name="willing"]:checked') || {}).value || '';
    var month = $('jo-month').value, age = $('jo-age').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError('בדקו את כתובת המייל.');
    if (!willing) return showError('בחרו תשובה: כן, אולי או לא.');
    if (!$('jo-consent').checked) return showError('צריך לאשר קבלת עדכון חד-פעמי כדי שנוכל לכתוב לכם.');
    var btn = $('jo-submit'); btn.disabled = true;
    fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ email: email, trip_month: month || null, child_age: age ? Number(age) : null, willing: willing, consent: true, website: $('jo-website').value })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j || {} }; });
    }).then(function (res) {
      var b = res.body;
      if (res.status === 200 && b.ok && b.status === 'received') {
        once('gl_jo_submit', function () { track('journal_interest_submit', { entry: entry, willing: willing, has_month: month ? 1 : 0, has_age: age ? 1 : 0, offer_price: OFFER_PRICE }); });
        success(false);
      } else if (res.status === 200 && b.ok && b.status === 'already') {
        success(true);
      } else if (res.status === 503) {
        $('jo-form').hidden = true; $('jo-closed').hidden = false;
      } else {
        btn.disabled = false;
        showError(b.code === 'invalid_email' ? 'בדקו את כתובת המייל.' : 'משהו לא עבד. אפשר לנסות שוב בעוד רגע.');
      }
    }).catch(function () { btn.disabled = false; showError('אין חיבור כרגע. אפשר לנסות שוב בעוד רגע.'); });
  }

  function success(already) {
    $('jo-form').hidden = true; $('jo-closed').hidden = true; $('jo-success').hidden = false;
    if (already) $('jo-success-text').textContent = 'המייל הזה כבר רשום אצלנו, ואין צורך לשלוח שוב. נכתוב לכם פעם אחת כשהחוברת תהיה זמינה.';
    try { $('jo-success').scrollIntoView({ block: 'nearest' }); } catch (e) { /* לא קריטי */ }
  }

  function init() {
    fillMonths();
    ask();
    track('journal_offer_view', { entry: entry, offer_price: OFFER_PRICE });
    ['jo-sample', 'jo-sample-top'].forEach(function (id) {
      var a = $(id); if (!a) return;
      a.addEventListener('click', function () { once('gl_jo_sample', function () { track('journal_sample_download', { entry: entry, offer_price: OFFER_PRICE }); }); });
    });
    $('jo-form').addEventListener('submit', submit);
    if (entry !== 'planner') { var back = $('jo-back'); back.href = 'guide-kids.html'; back.innerHTML = '<i class="fas fa-arrow-right"></i> חזרה'; }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
