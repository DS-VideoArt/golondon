# -*- coding: utf-8 -*-
"""
בונה את utm.html, כלי בניית קישורי המעקב.

למה הוא קיים: קישור שמתפרסם בלי פרמטרי מעקב נופל ב-GA4 לתוך Direct,
ואז אי אפשר לדעת אם הוא הגיע מהקבוצה, מהעמוד או מריל. הכלי הזה מבטיח
שכל קישור שיוצא לרשתות בנוי לפי אותה מוסכמה בדיוק.

הכלי בונה מחרוזת בדפדפן בלבד. אין שרת, אין שמירה, אין הזדהות.

רשימת עמודי היעד נגזרת ממפת האתר, ולכן היא תמיד מסונכרנת ואי אפשר
לבחור עמוד שלא קיים. להרצה מחדש אחרי הוספת עמודים:
    python3 build_utm.py
"""
import xml.dom.minidom as m, re, json, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

locs = [n.firstChild.data for n in m.parse('sitemap.xml').getElementsByTagName('loc')]
pages = []
for u in sorted(locs):
    path = u.replace('https://golondon.co.il/', '')
    f = (path or 'index') + '.html'
    title = ''
    if os.path.exists(f):
        s = open(f, encoding='utf-8').read()
        t = re.search(r'<title>(.*?)</title>', s, re.S)
        if t:
            title = re.sub(r'\s*\|\s*גו לונדון\s*$', '', t.group(1).strip())
    pages.append({'p': '/' + path, 't': title or 'דף הבית'})

PAGES = json.dumps(pages, ensure_ascii=False)

HTML = '''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>בניית קישור מעקב | גו לונדון</title>
  <!--
    noindex כדי שהכלי לא ייכנס לתוצאות החיפוש. הוא במכוון לא חסום
    ב-robots.txt, כי חסימה שם הייתה מונעת מגוגל לקרוא את התגית הזאת
    ולכן דווקא משאירה את העמוד באינדקס.
  -->
  <meta name="robots" content="noindex, nofollow" />
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Heebo',sans-serif;direction:rtl;background:#FAF9F6;color:#201f2b;line-height:1.6;
         padding:16px;max-width:640px;margin:0 auto;-webkit-text-size-adjust:100%}
    h1{font-size:21px;font-weight:900;margin-bottom:4px}
    .sub{font-size:13.5px;color:#55596b;margin-bottom:20px}
    label{display:block;font-size:13.5px;font-weight:800;margin:16px 0 6px}
    select,input{width:100%;font-family:'Heebo',sans-serif;font-size:16px;padding:13px 12px;
      border:1px solid rgba(32,31,43,.16);border-radius:12px;background:#fff;color:#201f2b}
    select:focus,input:focus{outline:2px solid #DC2626;outline-offset:1px}
    .row{display:flex;gap:10px}
    .row>div{flex:1}
    .hint{font-size:12px;color:#858a9c;margin-top:5px}
    .err{font-size:12.5px;color:#DC2626;font-weight:700;margin-top:5px;display:none}
    .out{margin-top:22px;background:#fff;border:1px solid rgba(32,31,43,.12);border-radius:14px;padding:15px}
    .out-label{font-size:12px;font-weight:800;color:#858a9c;margin-bottom:7px}
    .url{font-size:13px;direction:ltr;text-align:left;word-break:break-all;background:#FAF9F6;
         border-radius:9px;padding:11px;min-height:46px;color:#201f2b;font-family:ui-monospace,monospace}
    .btns{display:flex;gap:9px;margin-top:12px}
    button{flex:1;font-family:'Heebo',sans-serif;font-size:15px;font-weight:800;padding:14px;
      border:none;border-radius:12px;cursor:pointer;min-height:48px}
    .copy{background:linear-gradient(135deg,#DC2626,#EA580C);color:#fff}
    .test{background:#fff;color:#201f2b;border:1px solid rgba(32,31,43,.18)}
    button:disabled{opacity:.45;cursor:not-allowed}
    .ok{display:none;text-align:center;font-size:13.5px;font-weight:800;color:#15803D;margin-top:10px}
    .params{margin-top:14px;font-size:12.5px;color:#55596b}
    .params span{display:inline-block;background:#FAF9F6;border-radius:7px;padding:3px 9px;margin:3px 3px 0 0;
      direction:ltr;font-family:ui-monospace,monospace}
    @media(min-width:560px){body{padding:28px}h1{font-size:25px}}
  </style>
</head>
<body>

<h1>בניית קישור מעקב</h1>
<p class="sub">כל קישור שיוצא לפייסבוק או לאינסטגרם צריך לעבור דרך כאן. קישור בלי פרמטרים נספר כתנועה ישירה, ואז אי אפשר לדעת מאיפה הוא באמת הגיע.</p>

<label for="page">1. לאן הקישור מוביל</label>
<select id="page"></select>
<div id="customWrap" style="display:none">
  <label for="custom">כתובת ידנית</label>
  <input id="custom" type="url" placeholder="https://golondon.co.il/..." inputmode="url" />
  <div class="err" id="customErr">הכתובת חייבת להיות של golondon.co.il</div>
</div>

<div class="row">
  <div>
    <label for="src">2. פלטפורמה</label>
    <select id="src">
      <option value="facebook">פייסבוק</option>
      <option value="instagram">אינסטגרם</option>
    </select>
  </div>
  <div>
    <label for="kind">3. סוג</label>
    <select id="kind">
      <option value="social">אורגני</option>
      <option value="paid_social">ממומן</option>
    </select>
  </div>
</div>

<label for="content">4. סוג הפרסום</label>
<select id="content"></select>

<label for="camp">5. שם הקמפיין</label>
<input id="camp" type="text" placeholder="kosher_map" autocomplete="off" autocapitalize="off" spellcheck="false" />
<div class="hint">אנגלית, אותיות קטנות וקו תחתון. מתאר את הנושא ולא את סוג הפוסט. לדוגמה kosher_map או christmas_2026</div>
<div class="err" id="campErr">צריך שם קמפיין</div>

<div class="out">
  <div class="out-label">הקישור המוכן</div>
  <div class="url" id="url"></div>
  <div class="params" id="params"></div>
  <div class="btns">
    <button class="copy" id="copyBtn">העתקת קישור</button>
    <button class="test" id="testBtn">בדיקת הקישור</button>
  </div>
  <div class="ok" id="ok">הקישור הועתק</div>
</div>

<script>
var PAGES = __PAGES__;
var SITE = 'https://golondon.co.il';

/* אוצר המילים סגור. אין הקלדה חופשית באף שדה פרט לשם הקמפיין,
   וזה מה שמונע שגיאות כתיב שמפצלות את הנתונים ב-GA4. */
var CONTENT = {
  facebook_social:      [['group_post','פוסט בקבוצה'],['page_post','פוסט בעמוד'],['reel','ריל'],['story','סטורי'],['carousel','קרוסלה'],['bio_link','קישור בביו']],
  instagram_social:     [['page_post','פוסט בפרופיל'],['reel','ריל'],['story','סטורי'],['carousel','קרוסלה'],['bio_link','קישור בביו']],
  facebook_paid_social: [['reel_ad','מודעת ריל'],['story_ad','מודעת סטורי'],['image_ad','מודעת תמונה'],['carousel_ad','מודעת קרוסלה']],
  instagram_paid_social:[['reel_ad','מודעת ריל'],['story_ad','מודעת סטורי'],['image_ad','מודעת תמונה'],['carousel_ad','מודעת קרוסלה']]
};

var $ = function (id) { return document.getElementById(id); };

(function fillPages() {
  var s = $('page'), h = '';
  for (var i = 0; i < PAGES.length; i++) {
    h += '<option value="' + PAGES[i].p + '">' + PAGES[i].t + '</option>';
  }
  h += '<option value="__custom">כתובת אחרת של גו לונדון</option>';
  s.innerHTML = h;
})();

function fillContent() {
  var key = $('src').value + '_' + $('kind').value;
  var list = CONTENT[key] || [], h = '';
  for (var i = 0; i < list.length; i++) {
    h += '<option value="' + list[i][0] + '">' + list[i][1] + ' (' + list[i][0] + ')</option>';
  }
  $('content').innerHTML = h;
}

/* שם הקמפיין מנוקה בזמן ההקלדה. אין קידומת חודש אוטומטית:
   השם מתאר את הנושא, וחודש נכנס רק אם הוא באמת חלק מהקמפיין. */
function cleanCamp(v) {
  return String(v).toLowerCase()
    .replace(/[\\s\\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^_+/, '');
}

function targetUrl() {
  var v = $('page').value;
  if (v !== '__custom') return SITE + (v === '/' ? '/' : v);
  var raw = $('custom').value.trim();
  if (!raw) return '';
  var u;
  try { u = new URL(raw, SITE); } catch (e) { return ''; }
  if (u.hostname.replace(/^www\\./, '') !== 'golondon.co.il') return '';
  /* בלי סיומת html, כי הכתובת הקנונית של האתר היא בלעדיה,
     ובלי פרמטרים קיימים, כדי שלא ייווצרו UTM כפולים. */
  var path = u.pathname.replace(/\\.html?$/i, '');
  return SITE + (path || '/');
}

function build() {
  var custom = $('page').value === '__custom';
  $('customWrap').style.display = custom ? 'block' : 'none';

  var base = targetUrl();
  var camp = cleanCamp($('camp').value);
  if ($('camp').value !== camp) $('camp').value = camp;

  var badUrl = custom && $('custom').value.trim() && !base;
  $('customErr').style.display = badUrl ? 'block' : 'none';
  $('campErr').style.display = (base && !camp) ? 'block' : 'none';

  var ok = !!base && !!camp;
  $('copyBtn').disabled = !ok;
  $('testBtn').disabled = !ok;

  if (!ok) { $('url').textContent = ''; $('params').innerHTML = ''; return ''; }

  var p = {
    utm_source: $('src').value,
    utm_medium: $('kind').value,
    utm_campaign: camp,
    utm_content: $('content').value
  };
  var qs = [];
  for (var k in p) qs.push(k + '=' + encodeURIComponent(p[k]));
  var full = base + '?' + qs.join('&');

  $('url').textContent = full;
  var ph = '';
  for (var k2 in p) ph += '<span>' + k2 + '=' + p[k2] + '</span>';
  $('params').innerHTML = ph;
  return full;
}

['page', 'src', 'kind', 'content', 'camp', 'custom'].forEach(function (id) {
  $(id).addEventListener('input', function () {
    if (id === 'src' || id === 'kind') fillContent();
    build();
  });
  $(id).addEventListener('change', function () {
    if (id === 'src' || id === 'kind') fillContent();
    build();
  });
});

$('copyBtn').addEventListener('click', function () {
  var t = build();
  if (!t) return;
  function done() {
    $('ok').style.display = 'block';
    setTimeout(function () { $('ok').style.display = 'none'; }, 1800);
  }
  /* השיטה המודרנית דורשת הקשר מאובטח וזמינה כאן. הנפילה לאחור
     נחוצה לדפדפני מובייל ישנים יותר, ובלעדיה הכפתור פשוט לא עושה כלום. */
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done, legacy);
  } else { legacy(); }
  function legacy() {
    var ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, t.length);
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }
});

$('testBtn').addEventListener('click', function () {
  var t = build();
  if (t) window.open(t, '_blank', 'noopener');
});

fillContent();
build();
</script>
</body>
</html>
'''

open('utm.html', 'w', encoding='utf-8').write(HTML.replace('__PAGES__', PAGES))
print('utm.html נבנה, %d עמודי יעד' % len(pages))
