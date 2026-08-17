# -*- coding: utf-8 -*-
"""
בונה את כל מה שקשור ל"מה חדש בלונדון עכשיו".

מקור האמת היחיד הוא whats-new.json. מהקובץ הזה נבנים:
  1. עמוד יומי אחד לכל תאריך, whats-new-YYYY-MM-DD.html, עם כל האייטמים של אותו יום
  2. עמוד הארכיון whats-new.html, כל האייטמים מהחדש לישן
  3. מקטע ארבעת האייטמים האחרונים בדף הבית, בין סימני ההתחלה והסיום
  4. שורות במפת האתר

אין לערוך אף אחד מהקבצים האלה ביד. עורכים את whats-new.json ומריצים:
    python3 build_whats_new.py
"""
import json, os, re, html, collections, datetime

os.chdir(os.path.dirname(os.path.abspath(__file__)))

SITE = 'https://golondon.co.il'
DATA = 'whats-new.json'
ARCHIVE = 'whats-new.html'
HOME = 'index.html'
SITEMAP = 'sitemap.xml'
HOME_CARDS = 4

HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
             'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

CAT_ICON = {
    'אטרקציות': 'fa-ticket', 'אירועים': 'fa-calendar-star', 'תחבורה': 'fa-train-subway',
    'אוכל': 'fa-utensils', 'משפחות': 'fa-children', 'תרבות': 'fa-masks-theater',
    'כדורגל': 'fa-futbol', 'מידע למטייל': 'fa-circle-info', 'שופינג': 'fa-bag-shopping',
}

problems = []


def he_date(iso):
    y, m, d = (int(x) for x in iso.split('-'))
    return '%d ב%s %d' % (d, HE_MONTHS[m - 1], y)


def head(title, desc, canonical, image, extra_ld=''):
    """הכותרת המשותפת לכל עמודי המערכת, כדי שלא יהיה הבדל בין העמוד היומי לארכיון."""
    t = html.escape(title)
    d = html.escape(desc)
    return f'''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-QWWEWYZWCK"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){{dataLayer.push(arguments);}}
    gtag('js', new Date());
    gtag('config', 'G-QWWEWYZWCK');
  </script>

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
  </style>
  <link rel="manifest" href="manifest.json" />
  <meta name="theme-color" content="#DC2626" />
  <link rel="apple-touch-icon" href="images/apple-touch-icon.png" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="192x192" href="images/favicon-192.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="images/favicon-32.png" />
  <link rel="stylesheet" href="accessibility-widget.css" />
  <link rel="stylesheet" href="theme-light.css?v=8" />
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
<script src="analytics.js?v=2" defer></script>
<script src="whats-new.js?v=1" defer></script>
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

    daylink = ''
    if show_day_link:
        daylink = ('<a href="%s#%s"><i class="far fa-clock"></i></a>'
                   % (day_file(it['date']), html.escape(it['anchor'])))

    return f'''<article class="wn-item" id="{html.escape(it['anchor'])}">
{img}
<div class="wn-item-in">
  <div class="wn-meta">
    <span class="wn-cat"><i class="fas {icon}"></i> {html.escape(cat)}</span>
    <time datetime="{it['date']}" data-wn-date="{it['date']}">{he_date(it['date'])}</time>
  </div>
  <h2>{html.escape(it['title'])}</h2>
  {it['body']}
  {full}
  {src}
  {more}
</div>
</article>
'''


def day_file(d):
    return 'whats-new-%s.html' % d


def build_day(d, items):
    canonical = '%s/%s' % (SITE, day_file(d))
    first_img = next((i['image'] for i in items if i.get('image')), 'images/hero.jpg')
    titles = '; '.join(i['title'] for i in items)
    desc = ('מה חדש בלונדון ב%s: %s' % (he_date(d), titles))[:250]

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
                    {"@type": "ListItem", "position": 2, "name": "מה חדש בלונדון", "item": "%s/%s" % (SITE, ARCHIVE)},
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
    canonical = '%s/%s' % (SITE, ARCHIVE)
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
  <span class="tag">🗞️ מתעדכן כל יום</span>
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


def build_home(items):
    """
    מזריק את ארבעת האייטמים האחרונים לדף הבית, בין שני הסימנים.
    ה-HTML נכתב סטטי כדי שגוגל יראה אותו, וסקריפט זעיר הופך את התאריך
    ל"היום" או "אתמול" בצד הגולש, כך שהתווית תמיד נכונה גם אם הבנייה דילגה על יום.
    """
    s = open(HOME, encoding='utf-8').read()
    start, end = '<!-- WHATS-NEW:START -->', '<!-- WHATS-NEW:END -->'
    if start not in s or end not in s:
        problems.append('לא נמצאו סימני המקטע בדף הבית. המקטע לא עודכן.')
        return

    cards = ''
    for it in items[:HOME_CARDS]:
        target = it['standalone'] or ('%s#%s' % (day_file(it['date']), it['anchor']))
        icon = CAT_ICON.get(it['category'], 'fa-circle-info')
        img = ''
        if it.get('image'):
            img = ('<span class="wnc-img" style="background-image:url(\'%s\')"></span>'
                   % html.escape(it['image']))
        cards += f'''
          <a href="{html.escape(target)}" class="wnc">
            {img}
            <span class="wnc-body">
              <span class="wnc-meta">
                <span class="wnc-cat"><i class="fas {icon}"></i> {html.escape(it['category'])}</span>
                <time datetime="{it['date']}" data-wn-date="{it['date']}">{he_date(it['date'])}</time>
              </span>
              <span class="wnc-title">{html.escape(it['title'])}</span>
              <span class="wnc-sum">{html.escape(it['summary'])}</span>
              <span class="wnc-go">לפרטים <i class="fas fa-arrow-left"></i></span>
            </span>
          </a>'''

    block = f'''{start}
  <section class="whats-new" id="whats-new">
    <div class="container">
      <div class="section-header">
        <h2>מה חדש בלונדון עכשיו</h2>
        <p>אטרקציות שנפתחות, אירועים שמתקרבים ושינויים שכדאי להכיר לפני שטסים</p>
      </div>
      <div class="wnc-grid">{cards}
      </div>
      <a href="{ARCHIVE}" class="wnc-all">לכל העדכונים <i class="fas fa-arrow-left"></i></a>
    </div>
  </section>
  {end}'''

    s = re.sub(re.escape(start) + r'.*?' + re.escape(end), lambda m: block, s, flags=re.S)
    open(HOME, 'w', encoding='utf-8').write(s)
    print('  דף הבית: %d כרטיסים' % min(HOME_CARDS, len(items)))


def update_sitemap(pages):
    s = open(SITEMAP, encoding='utf-8').read()
    added = 0
    for p in pages:
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


def main():
    d = json.load(open(DATA, encoding='utf-8'))
    items = d['items']
    items.sort(key=lambda i: (i['date'], i['id']), reverse=True)

    validate(items)

    by_day = collections.OrderedDict()
    for it in items:
        by_day.setdefault(it['date'], []).append(it)

    print('בונה "מה חדש בלונדון":')
    pages = []
    for day, day_items in by_day.items():
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


main()
