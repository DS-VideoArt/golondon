/*
  תיבת "מה חסר לכם באתר"
  ================================
  רכיב אחד שנטען בסוף עמודים ומזמין את הקהילה להגיד מה להוסיף.
  ההודעות נשמרות באותו גיליון גוגל שמשמש כבר את טופס המועדון,
  עם שדה סוג שמבדיל ביניהם, ובנוסף נשלחות לטפסים של נטליפיי כגיבוי.

  שימוש בעמוד חדש: להוסיף בסוף העמוד
    <script src="community-ask.js" defer></script>
  אין צורך בשום סימון נוסף. הרכיב מוסיף את עצמו לפני הכותרת התחתונה,
  ואם אין כותרת תחתונה, בסוף גוף העמוד.
*/

(function () {
  'use strict';

  var SHEET_URL = 'https://script.google.com/macros/s/AKfycbwiCVL5WK-HiVm6COsujA5PXPQLVv7FfQhA9ADlUQbaPbAlgP9ji66CQi_1UA--6elN/exec';
  var FORM_NAME = 'golondon-suggestions';

  function injectStyles() {
    if (document.getElementById('community-ask-styles')) return;
    var css = [
      '.ca-wrap{max-width:1200px;margin:0 auto;padding:0 24px 56px;}',
      '.ca-box{background:#fff;border:1px solid rgba(32,31,43,.10);border-radius:22px;padding:34px 34px 30px;box-shadow:0 2px 4px rgba(16,24,40,.05),0 12px 30px rgba(16,24,40,.08);}',
      '.ca-badge{display:inline-block;font-size:11.5px;font-weight:900;letter-spacing:.5px;color:#15803D!important;background:rgba(21,128,61,.11);padding:4px 12px;border-radius:50px;margin-bottom:11px;}',
      '.ca-title{font-size:clamp(21px,3vw,27px);font-weight:900;color:#201f2b!important;margin:0 0 10px;line-height:1.28;}',
      '.ca-text{font-size:15px;line-height:1.8;color:#55596b!important;margin:0 0 20px;max-width:66ch;}',
      '.ca-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
      '.ca-field{display:flex;flex-direction:column;gap:6px;}',
      '.ca-field.ca-full{grid-column:1 / -1;}',
      '.ca-label{font-size:13px;font-weight:800;color:#55596b!important;}',
      '.ca-input,.ca-textarea{font:inherit;font-size:15px;width:100%;padding:13px 15px;border-radius:12px;background:rgba(32,31,43,.035);border:1px solid rgba(32,31,43,.11);color:#201f2b!important;}',
      '.ca-input::placeholder,.ca-textarea::placeholder{color:#858a9c!important;}',
      '.ca-input:focus,.ca-textarea:focus{outline:2px solid rgba(234,88,12,.55);outline-offset:1px;}',
      '.ca-textarea{min-height:104px;resize:vertical;line-height:1.7;}',
      '.ca-actions{grid-column:1 / -1;display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:4px;}',
      '.ca-btn{font:inherit;font-size:15.5px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;gap:9px;padding:14px 26px;border-radius:13px;border:none;background:linear-gradient(135deg,#DC2626,#EA580C);color:#fff!important;box-shadow:0 8px 22px rgba(220,38,38,.26);}',
      '.ca-btn:hover{filter:brightness(1.07);}',
      '.ca-btn:disabled{opacity:.6;cursor:default;filter:none;}',
      '.ca-note{font-size:12.5px;color:#858a9c!important;line-height:1.6;}',
      '.ca-ok{display:none;text-align:center;padding:20px 6px 6px;}',
      '.ca-ok-icon{font-size:42px;display:block;margin-bottom:10px;}',
      '.ca-ok h3{font-size:20px;font-weight:900;color:#201f2b!important;margin:0 0 8px;}',
      '.ca-ok p{font-size:15px;color:#55596b!important;margin:0;line-height:1.75;}',
      '.ca-err{grid-column:1 / -1;font-size:13.5px;font-weight:700;color:#b91c1c!important;}',
      '@media(max-width:700px){.ca-box{padding:26px 20px 24px;}.ca-form{grid-template-columns:1fr;}.ca-btn{width:100%;justify-content:center;}}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'community-ask-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function build() {
    var wrap = document.createElement('section');
    wrap.className = 'ca-wrap';
    wrap.setAttribute('aria-label', 'הצעות מהקהילה');
    wrap.innerHTML =
      '<div class="ca-box">' +
        '<div id="caContent">' +
          '<span class="ca-badge">🤝 האתר של הקהילה</span>' +
          '<h2 class="ca-title">מה חסר לכם כאן?</h2>' +
          '<p class="ca-text">גו לונדון נבנה בשביל הקהילה הישראלית שמתכננת לונדון, ולא בשביל אף אחד אחר. ' +
            'אם חיפשתם משהו ולא מצאתם, אם יש מקום ששווה להוסיף, או אם משהו שכתוב כאן כבר לא מדויק, ' +
            'תכתבו לנו. אנחנו קוראים הכל, וזה בדיוק מה שקובע מה נוסיף בהמשך.</p>' +

          '<form class="ca-form" id="caForm" name="' + FORM_NAME + '" method="POST" data-netlify="true">' +
            '<input type="hidden" name="form-name" value="' + FORM_NAME + '" />' +
            '<input type="hidden" name="type" value="הצעה לאתר" />' +
            '<input type="hidden" name="page" id="caPage" value="" />' +
            '<p style="display:none"><label>אל תמלאו את השדה הזה <input name="bot-field" /></label></p>' +

            '<div class="ca-field">' +
              '<label class="ca-label" for="caName">השם שלכם, לא חובה</label>' +
              '<input class="ca-input" type="text" id="caName" name="name" autocomplete="name" placeholder="איך לפנות אליכם" />' +
            '</div>' +
            '<div class="ca-field">' +
              '<label class="ca-label" for="caEmail">מייל לחזרה, לא חובה</label>' +
              '<input class="ca-input" type="email" id="caEmail" name="email" autocomplete="email" placeholder="רק אם תרצו שנחזור אליכם" />' +
            '</div>' +
            '<div class="ca-field ca-full">' +
              '<label class="ca-label" for="caMsg">מה תרצו שנוסיף או נשפר</label>' +
              '<textarea class="ca-textarea" id="caMsg" name="message" required placeholder="לדוגמה: חסר לי מידע על נגישות עגלות בתחנות, או מקום כשר טוב באזור שלא מופיע אצלכם"></textarea>' +
            '</div>' +
            '<div class="ca-actions">' +
              '<button type="submit" class="ca-btn" id="caBtn"><i class="fas fa-paper-plane"></i> שליחה</button>' +
              '<span class="ca-note">אין צורך להשאיר פרטים. אפשר לכתוב רק את ההצעה.</span>' +
            '</div>' +
            '<div class="ca-err" id="caErr" hidden></div>' +
          '</form>' +
        '</div>' +

        '<div class="ca-ok" id="caOk">' +
          '<span class="ca-ok-icon">🙏</span>' +
          '<h3>קיבלנו, תודה</h3>' +
          '<p>ההצעה שלכם נשמרה ואנחנו נעבור עליה. דברים רבים באתר הזה נוספו בדיוק בגלל הודעות כאלה.</p>' +
        '</div>' +
      '</div>';
    return wrap;
  }

  function wire(root) {
    var form = root.querySelector('#caForm');
    var btn = root.querySelector('#caBtn');
    var err = root.querySelector('#caErr');
    root.querySelector('#caPage').value = location.pathname + location.search;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var msg = root.querySelector('#caMsg').value.trim();
      if (!msg) {
        err.hidden = false;
        err.textContent = 'צריך לכתוב משהו בשדה ההצעה לפני השליחה.';
        return;
      }
      /* מלכודת לבוטים. אם השדה המוסתר מלא, זו לא הודעה אמיתית */
      if (form.querySelector('[name="bot-field"]').value) return;

      err.hidden = true;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> שולח';

      var body = new URLSearchParams(new FormData(form)).toString();

      /* הגיליון הוא היעד העיקרי, וטפסי נטליפיי הם גיבוי. אם אחד נכשל, השני עדיין קולט */
      var toSheet = fetch(SHEET_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      }).catch(function () {});

      var toNetlify = fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      }).catch(function () {});

      Promise.all([toSheet, toNetlify]).then(function () {
        root.querySelector('#caContent').style.display = 'none';
        root.querySelector('#caOk').style.display = 'block';
      });
    });
  }

  function init() {
    if (document.querySelector('.ca-wrap')) return;
    injectStyles();
    var node = build();

    var footer = document.querySelector('footer, .footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(node, footer);
    else document.body.appendChild(node);

    wire(node);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
