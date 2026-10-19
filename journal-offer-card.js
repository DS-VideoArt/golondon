/*
  חוברת הטיול לילדים, ניסוי ביקוש: כרטיס ההצעה לשיבוץ בעמודים
  ============================================================
  כל אלמנט עם data-journal-offer="<entry>" (guide | winter | planner) מקבל כרטיס קטן עם קישור לעמוד ההצעה
  kids-journal-offer.html?e=<entry>. המתכנן קורא ל-window.GoLondonJournalOffer.render(box, 'planner') בעצמו,
  רק אחרי מסלול משפחתי, ורק כשהבטא החינמית לא פתוחה.
  מדידה: journal_offer_click פעם אחת לסשן (entry, placement = שם העמוד). בלי שום מידע אישי. אין כאן הזמנה.
*/
(function () {
  'use strict';

  var CSS = '.jo-card-box{max-width:800px;margin:18px 0 22px;padding:14px 16px;border-radius:13px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;' +
    'font-size:14px;line-height:1.6;background:rgba(30,58,138,.06);border:1px solid rgba(30,58,138,.18);color:var(--ink,#201f2b)}' +
    '.jo-card-text strong{display:block;font-size:15px}.jo-card-text{flex:1 1 260px}' +
    '.jo-card-link{font-weight:800;padding:9px 15px;border-radius:10px;color:#fff!important;background:#1E3A8A;white-space:nowrap;text-decoration:none}' +
    '.jo-card-link:focus-visible{outline:3px solid #DC2626;outline-offset:2px}.jo-card-tag{display:inline-block;font-size:12px;font-weight:800;color:#1E3A8A;margin-bottom:2px}' +
    '@media print{.jo-card-box{display:none}}';
  var ENTRIES = { guide: 1, winter: 1, planner: 1 };

  function track(name, params) { try { if (window.glTrack) window.glTrack(name, params || {}); } catch (e) { /* מדידה לא מפילה עמוד */ } }
  function session(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; }
  }
  function pageId() { return (location.pathname.split('/').pop() || 'index').replace(/\.html?$/i, '') || 'index'; }

  function style() {
    if (document.getElementById('jo-card-css')) return;
    var s = document.createElement('style'); s.id = 'jo-card-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function render(box, entry) {
    if (!box) return;
    entry = ENTRIES[entry] ? entry : 'guide';
    style();
    if (!box.firstChild) {
      box.className = (box.className ? box.className + ' ' : '') + 'jo-card-box';
      box.innerHTML = '<span class="jo-card-text"><span class="jo-card-tag">בקרוב</span><strong>המסלול שלכם בלונדון. ההרפתקה שלהם.</strong>' +
        'חוברת טיול אישית לילדים בגילאי 6 עד 10, לפי האטרקציות שבחרתם. יש דף דוגמה להורדה.</span>' +
        '<a class="jo-card-link" href="kids-journal-offer.html?e=' + entry + '">לפרטים ולדף דוגמה</a>';
      box.querySelector('.jo-card-link').addEventListener('click', function () {
        if (session('gl_jo_click')) return;
        session('gl_jo_click', '1');
        track('journal_offer_click', { entry: entry, placement: pageId() });
      });
    }
    box.hidden = false;
  }

  function auto() {
    var boxes = document.querySelectorAll('[data-journal-offer]');
    for (var i = 0; i < boxes.length; i++) if (boxes[i].getAttribute('data-journal-offer') !== 'planner') render(boxes[i], boxes[i].getAttribute('data-journal-offer'));
  }

  window.GoLondonJournalOffer = { render: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
