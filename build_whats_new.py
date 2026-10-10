# -*- coding: utf-8 -*-
"""
בונה את כל מה שקשור ל"מה חדש בלונדון עכשיו".

מקור האמת היחיד הוא whats-new.json. מהקובץ הזה נבנים:
  1. עמוד הארכיון whats-new.html, כל האייטמים מהחדש לישן, כולל אלה שפג תוקפם
  2. העמודים היומיים שכבר קיימים, whats-new-YYYY-MM-DD.html. לא נוצרים עמודים יומיים
     חדשים: כל כרטיס מוביל ישירות למדריך באתר (primary_guide_url), ועמוד יומי היה דק
  3. המקטע בדף הבית, בין סימני ההתחלה והסיום
  4. שורות במפת האתר

כללי הטריות (אותם כללים בדיוק ב-whats-new.js, שמריץ אותם שוב בדפדפן):
  news             מוצג בדף הבית 30 יום מתאריך הפרסום, ואחר כך רק בארכיון
  upcoming_event   מוצג בדף הבית רק כש-event_start בתוך 60 יום, ועד event_end כולל
  expires          אופציונלי, עוקף את ברירת המחדל. היום הראשון שבו האייטם כבר לא מוצג
  דף הבית          עד 4 אייטמים תקפים: קודם אירועים לפי הקרוב ביותר, אחר כך חדשות מהחדשה לישנה
  אין אייטם תקף    המקטע מוסתר כולו (display_mode=hidden_fallback). מקטע החודשים שמעליו
                   בדף הבית הוא ממשק התכנון החודשי הקנוני, ולכן לא מוצג כאן זוג חודשים נוסף

ה-HTML הסטטי של המקטע מוסתר, והכרטיסים יושבים בתוך template. הסקריפט בוחר מהם לפי תאריך
הגולש ומציג את המקטע רק אם יש לפחות כרטיס תקף אחד. כך קורא בלי סקריפט, מנוע חיפוש בלי
רינדור או מטמון, לעולם לא רואים כרטיס שפג תוקפו, גם אם לא בנו מחדש.

אין לערוך אף אחד מהקבצים האלה ביד. עורכים את whats-new.json ומריצים:
    python3 build_whats_new.py                     בונה לפי התאריך של היום
    python3 build_whats_new.py --report 2026-11-30 רק מדפיס מה יוצג בתאריך הזה, בלי לכתוב

נקודת החיבור לזרימת עבודה עתידית (לא קיימת עדיין, ולא תפעל בלי אישור אדם): משימה
שאוספת מועמדים מאומתים, מריצה whats_new_dedup.check, וכותבת טיוטות לקובץ נפרד שאינו נבנה.
רק אחרי אישור הטיוטה עוברת ל-whats-new.json, ואז build, commit ו-deploy. התפוגה עצמה
אינה צריכה שום משימה, היא חלק מהכללים כאן.
"""
import json, os, re, html, collections, datetime, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

SITE = 'https://golondon.co.il'
DATA = 'whats-new.json'
ARCHIVE = 'whats-new.html'
HOME = 'index.html'
SITEMAP = 'sitemap.xml'
HOME_CARDS = 4
NEWS_DAYS = 30            # news מוצג בדף הבית 30 יום מתאריך הפרסום
EVENT_WINDOW_DAYS = 60    # upcoming_event מוצג רק כשהוא מתחיל בתוך 60 יום
TEMPLATE_MAX = 12         # כמה כרטיסים לא פגי תוקף נשמרים ב-template לטובת הבדיקה בדפדפן
ITEM_TYPES = ('news', 'upcoming_event')
GENERIC_LABELS = ('לפרטים', 'לכתבה', 'קראו עוד', 'עוד')

HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
             'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

CAT_ICON = {
    'אטרקציות': 'fa-ticket', 'אירועים': 'fa-calendar-check', 'תחבורה': 'fa-train-subway',
    'אוכל': 'fa-utensils', 'משפחות': 'fa-children', 'תרבות': 'fa-masks-theater',
    'כדורגל': 'fa-futbol', 'מידע למטייל': 'fa-circle-info', 'שופינג': 'fa-bag-shopping',
}

problems = []


def canon(page):
    """הכתובת הקנונית היא ללא סיומת html. ראו build_redirects.py."""
    return page[:-5] if page.endswith('.html') else page


def he_date(iso):
    y, m, d = (int(x) for x in iso.split('-'))
    return '%d ב%s %d' % (d, HE_MONTHS[m - 1], y)


def to_date(iso):
    return datetime.date.fromisoformat(iso)


def window(it):
    """
    החלון שבו האייטם מוצג בדף הבית: (מאיזה יום, היום הראשון שבו כבר לא).
    התחלה כוללת, סוף לא כולל. אותה חישוביות בדיוק נכתבת לכרטיס כ-data-wn-from
    ו-data-wn-expires, ו-whats-new.js רק משווה אליהן את תאריך הגולש.
    """
    if it['item_type'] == 'upcoming_event':
        show_from = to_date(it['event_start']) - datetime.timedelta(days=EVENT_WINDOW_DAYS)
        expires = to_date(it['event_end']) + datetime.timedelta(days=1)
    else:
        show_from = to_date(it['date'])
        expires = to_date(it['date']) + datetime.timedelta(days=NEWS_DAYS)
    if it.get('expires'):
        expires = to_date(it['expires'])
    return show_from, expires


def is_valid(it, today):
    show_from, expires = window(it)
    return show_from <= today < expires


def is_past(it, today):
    return today >= window(it)[1]


def home_order(items):
    """אירועים קודם, לפי מועד ההתחלה הקרוב ביותר. אחריהם חדשות, מהחדשה לישנה."""
    events = sorted((i for i in items if i['item_type'] == 'upcoming_event'),
                    key=lambda i: (i['event_start'], i['event_end'], i['id']))
    news = sorted((i for i in items if i['item_type'] == 'news'),
                  key=lambda i: (i['date'], i['id']), reverse=True)
    return events + news


def home_selection(items, today):
    return home_order([i for i in items if is_valid(i, today)])[:HOME_CARDS]


def event_label(it):
    """התאריך שמוצג בכרטיס של אירוע: מועד האירוע, לא מועד הפרסום."""
    a, b = to_date(it['event_start']), to_date(it['event_end'])
    if a == b:
        return '%d ב%s %d' % (a.day, HE_MONTHS[a.month - 1], a.year)
    if a.year == b.year and a.month == b.month:
        return '%d עד %d ב%s %d' % (a.day, b.day, HE_MONTHS[a.month - 1], a.year)
    if a.year == b.year:
        return '%d ב%s עד %d ב%s %d' % (a.day, HE_MONTHS[a.month - 1], b.day, HE_MONTHS[b.month - 1], b.year)
    return '%s עד %s' % (he_date(it['event_start']), he_date(it['event_end']))


def head(title, desc, canonical, image, extra_ld=''):
    """הכותרת המשותפת לכל עמודי המערכת, כדי שלא יהיה הבדל בין העמוד היומי לארכיון."""
    t = html.escape(title)
    d = html.escape(desc)
    return f'''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <!-- Google tag (GA4), loaded only on golondon.co.il: see ga4.js -->
  <script src="/ga4.js?v=1"></script>

  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{t} | גו לונדון</title>
  <meta name="description" content="{d}" />
  <link rel="canonical" href="{canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="{t}" />
  <meta property="og:description" content="{d}" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:image" content="{SITE}/{image}" />
  <meta property="og:locale" content="he_IL" />
  <meta property="og:site_name" content="גו לונדון" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{t}" />
  <meta name="twitter:description" content="{d}" />
  <meta name="twitter:image" content="{SITE}/{image}" />
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: 'Heebo', sans-serif; direction: rtl; line-height: 1.8; }}
    a {{ text-decoration: none; }}
    .navbar {{ padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }}
    .logo {{ direction: ltr; display: flex; align-items: center; gap: 8px; }}
    .logo-img {{ height: 44px; width: auto; object-fit: contain; }}
    .logo-text-fallback {{ display: none; align-items: baseline; gap: 2px; }}
    .logo-go, .logo-london {{ font-size: 22px; font-weight: 900; }}
    .logo-slogan {{ font-size: 11px; font-weight: 600; direction: rtl; white-space: nowrap; border-right: 1px solid; padding-right: 10px; }}
    .back-btn {{ display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; padding: 8px 16px; border-radius: 8px; border: 1px solid; }}
    .wn-hero {{ padding: 46px 24px 38px; text-align: center; }}
    .wn-hero .tag {{ display: inline-block; padding: 6px 16px; border-radius: 50px; font-size: 13px; font-weight: 700; margin-bottom: 13px; }}
    .wn-hero h1 {{ font-size: 31px; font-weight: 900; margin-bottom: 9px; max-width: 760px; margin-inline: auto; line-height: 1.25; }}
    .wn-hero p {{ font-size: 15.5px; max-width: 620px; margin-inline: auto; }}
    .wn-wrap {{ max-width: 820px; margin: 0 auto; padding: 26px 24px 56px; }}
    .wn-daylink {{ display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 800; margin-bottom: 22px; }}
    .wn-item {{ border-radius: 20px; border: 1px solid; overflow: hidden; margin-bottom: 30px; }}
    .wn-item-img {{ display: block; width: 100%; aspect-ratio: 16/9; object-fit: cover; }}
    .wn-item-in {{ padding: 24px 26px 26px; }}
    .wn-meta {{ display: flex; flex-wrap: wrap; align-items: center; gap: 9px; font-size: 12.5px; font-weight: 800; margin-bottom: 11px; }}
    .wn-cat {{ display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 50px; }}
    .wn-item h2 {{ font-size: 22px; font-weight: 900; line-height: 1.3; margin-bottom: 12px; }}
    .wn-item h3 {{ font-size: 16px; font-weight: 800; margin: 20px 0 8px; }}
    .wn-item p {{ font-size: 15.5px; margin-bottom: 13px; }}
    .wn-item ul {{ margin: 8px 0 15px; padding-right: 22px; font-size: 15.5px; }}
    .wn-item li {{ margin-bottom: 8px; }}
    .wn-note {{ border-radius: 13px; border: 1px solid; padding: 15px 17px; font-size: 14.5px; margin: 16px 0; }}
    .wn-more {{ margin-top: 20px; padding-top: 17px; border-top: 1px solid; }}
    .wn-more h4 {{ font-size: 13.5px; font-weight: 900; margin-bottom: 10px; }}
    .wn-more-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }}
    .wn-more a {{ display: flex; align-items: center; gap: 8px; border: 1px solid; border-radius: 11px; padding: 11px 13px; font-size: 13.5px; font-weight: 700; }}
    .wn-src {{ margin-top: 15px; font-size: 12.5px; }}
    .wn-src strong {{ font-weight: 800; }}
    .wn-full {{ display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; padding: 11px 19px; border-radius: 11px; font-size: 14px; font-weight: 800; }}
    .wn-daysep {{ font-size: 15px; font-weight: 900; margin: 38px 0 18px; padding-bottom: 9px; border-bottom: 2px solid; }}
    .wn-daysep:first-child {{ margin-top: 0; }}
    @media (max-width: 560px) {{
      .wn-hero {{ padding: 34px 18px 28px; }}
      .wn-hero h1 {{ font-size: 24px; }}
      .wn-wrap {{ padding: 20px 16px 40px; }}
      .wn-item-in {{ padding: 19px 18px 21px; }}
      .wn-item h2 {{ font-size: 19px; }}
      .logo-slogan {{ display: none; }}
      .navbar {{ padding: 0 14px; }}
      .back-btn {{ font-size: 12.5px; padding: 7px 12px; white-space: nowrap; }}
    }}
    .wn-when {{ display: inline-flex; align-items: center; gap: 5px; font-weight: 800; }}
    .wn-past {{ display: inline-block; padding: 2px 9px; border-radius: 50px; font-size: 11.5px; font-weight: 800; background: rgba(100,116,139,0.14); color: #475569; }}
  </style>
  <link rel="manifest" href="manifest.json" />
  <meta name="theme-color" content="#DC2626" />
  <link rel="apple-touch-icon" href="images/apple-touch-icon.png" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="192x192" href="images/favicon-192.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="images/favicon-32.png" />
  <link rel="stylesheet" href="accessibility-widget.css" />
  <link rel="stylesheet" href="theme-light.css?v=16" />
{extra_ld}</head>
<body class="wn-page">

<nav class="navbar">
  <a href="index.html" class="logo">
    <img src="images/logo.png" alt="גו לונדון" class="logo-img" width="86" height="48" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
    <div class="logo-text-fallback"><span class="logo-go">GO</span><span class="logo-london">LONDON</span></div>
    <span class="logo-slogan">המדריך הישראלי ללונדון</span>
  </a>
  <a href="index.html" class="back-btn"><i class="fas fa-arrow-right"></i> חזרה לדף הבית</a>
</nav>

<main>
'''


FOOT = '''</main>
<script src="accessibility-widget.js" defer></script>
<script src="place-info.js?v=11" defer></script>
<script src="trip-tray.js?v=7" defer></script>
<script src="kosher-places-modal.js?v=4" defer></script>
<script src="auto-link-places.js?v=4" defer></script>
<script src="analytics.js?v=5" defer></script>
<script src="whats-new.js?v=2" defer></script>
</body>
</html>
'''


def item_html(it, show_day_link=True):
    """אייטם בודד. אותו רכיב בדיוק בעמוד היומי ובארכיון, כדי שלא ייווצר הבדל בין השניים."""
    cat = it['category']
    icon = CAT_ICON.get(cat, 'fa-circle-info')
    img = ''
    if it.get('image'):
        img = ('<img class="wn-item-img" src="%s" alt="%s" loading="lazy" width="1200" height="675" />'
               % (html.escape(it['image']), html.escape(it.get('imageAlt', ''))))

    links = ''.join(
        '<a href="%s"><i class="fas fa-arrow-left"></i> %s</a>' % (html.escape(l['url']), html.escape(l['title']))
        for l in it.get('links', []))
    more = ''
    if links:
        more = ('<div class="wn-more"><h4>יכול לעזור לכם גם</h4>'
                '<div class="wn-more-grid">%s</div></div>' % links)

    srcs = ' · '.join(
        '<a href="%s" target="_blank" rel="noopener nofollow">%s</a>' % (html.escape(s['url']), html.escape(s['name']))
        for s in it.get('sources', []))
    src = '<p class="wn-src"><strong>מקור:</strong> %s</p>' % srcs if srcs else ''

    full = ''
    if it.get('standalone'):
        full = ('<a class="wn-full" href="%s"><i class="fas fa-book-open"></i> לכתבה המלאה</a>'
                % html.escape(it['standalone']))

    show_from, expires = window(it)
    when = ''
    past = ''
    if it['item_type'] == 'upcoming_event':
        when = ('<span class="wn-when"><i class="far fa-calendar"></i> %s</span>' % event_label(it))
        if is_past(it, BUILD_DAY):
            past = '<span class="wn-past">האירוע הסתיים</span>'
    guide = ''
    if it.get('primary_guide_url'):
        guide = ('<a class="wn-full" href="%s"><i class="fas fa-book-open"></i> %s</a>'
                 % (html.escape(it['primary_guide_url']), html.escape(it['primary_guide_label'])))

    return f'''<article class="wn-item" id="{html.escape(it['anchor'])}" data-wn-kind="{it['item_type']}" data-wn-expires="{expires.isoformat()}">
{img}
<div class="wn-item-in">
  <div class="wn-meta">
    <span class="wn-cat"><i class="fas {icon}"></i> {html.escape(cat)}</span>
    <time datetime="{it['date']}" data-wn-date="{it['date']}">{he_date(it['date'])}</time>
    {when}{past}
  </div>
  <h2>{html.escape(it['title'])}</h2>
  {it['body']}
  {guide if guide and (not it.get('standalone') or it['standalone'] != it.get('primary_guide_url')) else ''}
  {full}
  {src}
  {more}
</div>
</article>
'''


def day_file(d):
    return 'whats-new-%s.html' % d


def build_day(d, items):
    canonical = '%s/%s' % (SITE, canon(day_file(d)))
    first_img = next((i['image'] for i in items if i.get('image')), 'images/hero.jpg')
    titles = '; '.join(i['title'] for i in items)
    desc = 'מה חדש בלונדון ב%s: %s' % (he_date(d), titles)
    if len(desc) > 158:
        desc = desc[:158].rsplit(' ', 1)[0].rstrip(',;') + '…'

    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "name": "מה חדש בלונדון, %s" % he_date(d),
                "inLanguage": "he",
                "url": canonical,
                "datePublished": d,
                "dateModified": d,
                "publisher": {"@type": "Organization", "name": "גו לונדון", "url": SITE},
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "דף הבית", "item": SITE + "/"},
                    {"@type": "ListItem", "position": 2, "name": "מה חדש בלונדון", "item": "%s/%s" % (SITE, canon(ARCHIVE))},
                    {"@type": "ListItem", "position": 3, "name": he_date(d), "item": canonical},
                ],
            },
        ],
    }
    extra = '  <script type="application/ld+json">\n%s\n  </script>\n' % json.dumps(ld, ensure_ascii=False, indent=2)

    body = head('מה חדש בלונדון, %s' % he_date(d), desc, canonical, first_img, extra)
    body += f'''<div class="wn-hero hero-photo-lite">
  <span class="tag">🗞️ מה חדש בלונדון</span>
  <h1>{he_date(d)}</h1>
  <p>{len(items)} עדכונים שנבדקו מול מקורות רשמיים, לכל מי שטס ללונדון בקרוב</p>
</div>
<div class="wn-wrap">
<a class="wn-daylink" href="{ARCHIVE}"><i class="fas fa-arrow-right"></i> לכל העדכונים</a>
'''
    for it in items:
        body += item_html(it, show_day_link=False)
    body += '</div>\n' + FOOT

    open(day_file(d), 'w', encoding='utf-8').write(body)
    return day_file(d)


def build_archive(by_day):
    canonical = '%s/%s' % (SITE, canon(ARCHIVE))
    total = sum(len(v) for v in by_day.values())
    desc = 'כל העדכונים של גו לונדון על מה שחדש בלונדון: אטרקציות, אירועים, תחבורה, תרבות וספורט, לפי סדר כרונולוגי.'
    first_img = 'images/hero.jpg'
    for d in sorted(by_day, reverse=True):
        for i in by_day[d]:
            if i.get('image'):
                first_img = i['image']
                break
        break

    ld = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "מה חדש בלונדון עכשיו",
        "inLanguage": "he",
        "url": canonical,
        "publisher": {"@type": "Organization", "name": "גו לונדון", "url": SITE},
    }
    extra = '  <script type="application/ld+json">\n%s\n  </script>\n' % json.dumps(ld, ensure_ascii=False, indent=2)

    body = head('מה חדש בלונדון עכשיו', desc, canonical, first_img, extra)
    body += f'''<div class="wn-hero hero-photo-lite">
  <span class="tag">🗞️ מתעדכן בקביעות</span>
  <h1>מה חדש בלונדון עכשיו</h1>
  <p>אטרקציות שנפתחות, אירועים שמתקרבים, שינויים בתחבורה ומה שכדאי לדעת לפני שטסים. הכל נבדק מול מקורות רשמיים.</p>
</div>
<div class="wn-wrap">
'''
    for d in sorted(by_day, reverse=True):
        body += '<div class="wn-daysep">%s</div>\n' % he_date(d)
        for it in by_day[d]:
            body += item_html(it)
    body += '</div>\n' + FOOT
    open(ARCHIVE, 'w', encoding='utf-8').write(body)
    print('  ארכיון: %s, %d אייטמים' % (ARCHIVE, total))


def home_card(it):
    """כרטיס אחד בדף הבית. מוביל ישירות למדריך, וכפתור עם יעד ספציפי."""
    target = it['primary_guide_url']
    icon = CAT_ICON.get(it['category'], 'fa-circle-info')
    show_from, expires = window(it)
    img = ''
    if it.get('image'):
        # נפילה לאחור ואז image-set, כמו בשאר האתר. אם אין גרסת webp לתמונה, מוגשת רק המקורית.
        jpg = it['image']
        webp = jpg.rsplit('.', 1)[0] + '.webp'
        css = "background-image:url('%s')" % html.escape(jpg)
        if os.path.exists(webp):
            css += ";background-image:image-set(url('%s') type('image/webp'), url('%s') type('image/jpeg'))" % (
                html.escape(webp), html.escape(jpg))
        img = '<span class="wnc-img" style="%s"></span>' % css
    # מפתח מיון זהה לזה של home_order, כדי שהדפדפן ימיין בדיוק כמו הבונה גם כשיש תיקו
    if it['item_type'] == 'upcoming_event':
        sort = '%s|%s|%s' % (it['event_start'], it['event_end'], it['id'])
        when = ('<time datetime="%s" data-wn-event-start="%s" data-wn-event-end="%s">%s</time>'
                % (it['event_start'], it['event_start'], it['event_end'], event_label(it)))
    else:
        sort = '%s|%s' % (it['date'], it['id'])
        when = '<time datetime="%s" data-wn-date="%s">%s</time>' % (it['date'], it['date'], he_date(it['date']))
    return f'''
          <a href="{html.escape(target)}" class="wnc"
             data-wn-title="{html.escape(it['title'])}"
             data-wn-type="{html.escape(it['category'])}"
             data-wn-pubdate="{it['date']}"
             data-wn-kind="{it['item_type']}" data-wn-from="{show_from.isoformat()}" data-wn-expires="{expires.isoformat()}" data-wn-sort="{sort}">
            {img}
            <span class="wnc-body">
              <span class="wnc-meta">
                <span class="wnc-cat"><i class="fas {icon}"></i> {html.escape(it['category'])}</span>
                {when}
              </span>
              <span class="wnc-title">{html.escape(it['title'])}</span>
              <span class="wnc-sum">{html.escape(it['summary'])}</span>
              <span class="wnc-go">{html.escape(it['primary_guide_label'])} <i class="fas fa-arrow-left"></i></span>
            </span>
          </a>'''


# תוספת עיצוב מקומית למקטע, באותם טוקנים. לא נוגעים ב-theme-light.css המשותף.
# במובייל הכרטיס הופך לשורה עם תמונה קטנה, כדי שארבעה כרטיסים לא ימתחו את דף הבית.
HOME_STYLE = '''<style>
    #whats-new[hidden] { display: none !important; }
    @media (max-width: 560px) {
      #whats-new .wnc-grid { gap: 12px; }
      #whats-new .wnc { flex-direction: row; align-items: stretch; border-radius: 16px; }
      #whats-new .wnc-img { flex: 0 0 96px; width: 96px; height: auto; min-height: 100%; }
      #whats-new .wnc-body { padding: 12px 14px; gap: 5px; }
      #whats-new .wnc-title { font-size: 15px; }
      #whats-new .wnc-sum { font-size: 13px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      #whats-new .wnc-go { font-size: 13px; padding-top: 2px; }
    }
  </style>'''


def build_home(items):
    """
    המקטע בדף הבית. ב-HTML הסטטי הוא מוסתר. כל האייטמים שעוד לא פג תוקפם נכתבים לתוך
    template, ו-whats-new.js בוחר מהם לפי אותם כללים בדיוק ולפי תאריך הגולש: עד ארבעה
    תקפים, ומציג את המקטע רק אם יש לפחות אחד. אם אין, המקטע נשאר מוסתר.
    """
    s = open(HOME, encoding='utf-8').read()
    start, end = '<!-- WHATS-NEW:START -->', '<!-- WHATS-NEW:END -->'
    if start not in s or end not in s:
        problems.append('לא נמצאו סימני המקטע בדף הבית. המקטע לא עודכן.')
        return

    pending = home_order([i for i in items if not is_past(i, BUILD_DAY)])[:TEMPLATE_MAX]
    cards = ''.join(home_card(it) for it in pending)

    block = f'''{start}
  <section class="whats-new" id="whats-new" data-wn-mode="hidden_fallback" hidden>
    {HOME_STYLE}
    <div class="container">
      <div class="section-header">
        <h2>מה חדש בלונדון עכשיו</h2>
        <p>אטרקציות שנפתחות, אירועים שמתקרבים ושינויים שכדאי להכיר לפני שטסים</p>
      </div>
      <div class="wnc-grid" data-wn-grid></div>
      <a href="{ARCHIVE}" class="wnc-all">לכל העדכונים <i class="fas fa-arrow-left"></i></a>
    </div>
    <template id="wn-items">{cards}
    </template>
  </section>
  {end}'''

    s = re.sub(re.escape(start) + r'.*?' + re.escape(end), lambda m: block, s, flags=re.S)
    open(HOME, 'w', encoding='utf-8').write(s)
    print('  דף הבית: %d כרטיסים ב-template, מוצגים היום: %d'
          % (len(pending), len(home_selection(items, BUILD_DAY))))


def update_sitemap(pages):
    s = open(SITEMAP, encoding='utf-8').read()
    added = 0
    for p in pages:
        p = canon(p)
        if '<loc>%s/%s</loc>' % (SITE, p) in s:
            continue
        entry = ('  <url>\n    <loc>%s/%s</loc>\n    <lastmod>%s</lastmod>\n'
                 '    <changefreq>daily</changefreq>\n    <priority>0.6</priority>\n  </url>\n'
                 % (SITE, p, datetime.date.today().isoformat()))
        s = s.replace('</urlset>', entry + '</urlset>', 1)
        added += 1
    open(SITEMAP, 'w', encoding='utf-8').write(s)
    print('  מפת אתר: %d כתובות חדשות' % added)


def validate(items):
    seen_ids, seen_anchors = set(), set()
    for it in items:
        for f in ('id', 'date', 'anchor', 'title', 'category', 'entity', 'summary', 'body'):
            if not it.get(f):
                problems.append('%s: חסר שדה %s' % (it.get('id', '?'), f))
        if it['id'] in seen_ids:
            problems.append('מזהה כפול: %s' % it['id'])
        seen_ids.add(it['id'])
        key = (it['date'], it['anchor'])
        if key in seen_anchors:
            problems.append('עוגן כפול באותו יום: %s' % it['anchor'])
        seen_anchors.add(key)
        if not it.get('sources'):
            problems.append('%s: אין מקור. אסור לפרסם אייטם בלי מקור.' % it['id'])
        if it.get('image') and not os.path.exists(it['image']):
            problems.append('%s: קובץ התמונה לא קיים, %s' % (it['id'], it['image']))
        for l in it.get('links', []):
            if not os.path.exists(l['url'].split('#')[0]):
                problems.append('%s: קישור פנימי שבור, %s' % (it['id'], l['url']))
        if len(it.get('links', [])) < 2:
            problems.append('%s: פחות משני קישורים פנימיים' % it['id'])
        if it.get('standalone') and not os.path.exists(it['standalone']):
            problems.append('%s: הוגדר עמוד עצמאי שלא קיים, %s' % (it['id'], it['standalone']))
        if re.search(r'[֐-׿][^<>]{0,30}[–—]', it['body']):
            problems.append('%s: מקף ארוך בטקסט עברי' % it['id'])
        if it.get('item_type') not in ITEM_TYPES:
            problems.append('%s: item_type חייב להיות news או upcoming_event' % it['id'])
            continue
        if it['item_type'] == 'upcoming_event':
            try:
                if to_date(it['event_end']) < to_date(it['event_start']):
                    problems.append('%s: event_end לפני event_start' % it['id'])
            except (KeyError, TypeError, ValueError):
                problems.append('%s: לאירוע חייבים event_start ו-event_end בפורמט YYYY-MM-DD' % it['id'])
        if it.get('expires'):
            try:
                to_date(it['expires'])
            except ValueError:
                problems.append('%s: expires לא בפורמט YYYY-MM-DD' % it['id'])
        if not it.get('primary_guide_url') or not os.path.exists(it['primary_guide_url'].split('#')[0]):
            problems.append('%s: חסר primary_guide_url, או שהמדריך לא קיים: %s' % (it['id'], it.get('primary_guide_url')))
        label = (it.get('primary_guide_label') or '').strip()
        if not label or label in GENERIC_LABELS:
            problems.append('%s: primary_guide_label חסר או כללי מדי ("%s")' % (it['id'], label))
        for f in ('title', 'summary', 'primary_guide_label'):
            if re.search(r'[–—]', it.get(f) or ''):
                problems.append('%s: מקף ארוך ב-%s' % (it['id'], f))


BUILD_DAY = datetime.date.today()


def load_items():
    d = json.load(open(DATA, encoding='utf-8'))
    items = d['items']
    items.sort(key=lambda i: (i['date'], i['id']), reverse=True)
    return items


def report(items, day):
    """מה יוצג בדף הבית בתאריך נתון, לפי אותם כללים. לא כותב שום קובץ."""
    sel = home_selection(items, day)
    print('%s: %s' % (day.isoformat(), 'מוסתר, אין אייטם תקף' if not sel else '%d כרטיסים' % len(sel)))
    for it in sel:
        print('   %-15s %-42s %s' % (it['item_type'], it['id'], event_label(it) if it['item_type'] == 'upcoming_event' else it['date']))
    return sel


def main():
    global BUILD_DAY
    items = load_items()
    if '--report' in sys.argv:
        for arg in sys.argv[sys.argv.index('--report') + 1:]:
            report(items, to_date(arg))
        return
    if '--today' in sys.argv:          # לבדיקות בלבד: בנייה כאילו היום הוא התאריך הזה
        BUILD_DAY = to_date(sys.argv[sys.argv.index('--today') + 1])

    validate(items)

    by_day = collections.OrderedDict()
    for it in items:
        by_day.setdefault(it['date'], []).append(it)

    print('בונה "מה חדש בלונדון":')
    pages = []
    for day, day_items in by_day.items():
        # רק עמודים יומיים שכבר קיימים נבנים מחדש, כדי לא לשבור כתובות. חדשים לא נוצרים.
        if not os.path.exists(day_file(day)):
            continue
        pages.append(build_day(day, day_items))
        print('  עמוד יומי: %s, %d אייטמים' % (day_file(day), len(day_items)))

    build_archive(by_day)
    build_home(items)
    update_sitemap([ARCHIVE] + pages)

    print('סה"כ אייטמים: %d, על פני %d ימים' % (len(items), len(by_day)))
    if problems:
        print('\nבעיות:')
        for p in problems:
            print('  •', p)
    else:
        print('אין בעיות. לכל אייטם יש מקור, תמונה קיימת וקישורים פנימיים תקינים.')


if __name__ == '__main__':
    main()
