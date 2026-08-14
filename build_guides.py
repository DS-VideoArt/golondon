# -*- coding: utf-8 -*-
"""
בונה את guides.json, מפת האשכולות של האתר.

הכותרת, התיאור ותמונת השער של כל מאמר נקראים מהעמוד עצמו, ולא נכתבים
כאן ביד. כך אי אפשר שהרשימה תציג כותרת ישנה או תמונה שכבר הוחלפה.

צריך להריץ מחדש אחרי כל הוספה של עמוד לאשכול או שינוי של תמונת שער:
    python3 build_guides.py
"""
import re, json, os, collections

os.chdir(os.path.dirname(os.path.abspath(__file__)))

CLUSTERS = collections.OrderedDict([
 ('transport',   {'hub':'guide-transport.html',   'label':'תחבורה',    'postCat':'תחבורה',
                  'pages':['guide-transport-airport.html','guide-transport-tube.html','guide-transport-lines.html','guide-transport-zones.html','guide-transport-bus.html','guide-transport-bus-routes.html','guide-transport-accessibility.html','guide-transport-daytrips.html','guide-transport-cost.html','guide-oyster.html']}),
 ('stay',        {'hub':'guide-stay.html',        'label':'לינה',      'postCat':'לינה',
                  'pages':['guide-stay-choosing.html','guide-stay-center.html','guide-stay-kensington.html',
                           'guide-stay-bloomsbury.html','guide-stay-east.html','guide-stay-south.html',
                           'guide-stay-north.html','guide-stay-apartments.html','guide-stay-budget.html',
                           'guide-stay-family.html']}),
 ('attractions', {'hub':'guide-attractions.html', 'label':'אטרקציות',  'postCat':'אטרקציות',
                  'pages':['guide-attractions-museums.html','guide-attractions-free.html','guide-attractions-royal.html','guide-attractions-views.html','guide-attractions-parks.html','guide-attractions-markets.html','guide-attractions-thames.html','guide-attractions-hidden.html','guide-attractions-westend.html','guide-attractions-rainy.html']}),
 ('kids',        {'hub':'guide-kids.html',        'label':'טיול עם ילדים','postCat':'סוגי מטיילים',
                  'pages':['guide-kids-toddlers.html','guide-kids-museums.html','guide-kids-parks.html','guide-kids-free.html',
                           'guide-kids-rain.html','guide-kids-transport.html','guide-kids-harry-potter.html',
                           'guide-kids-teens.html','guide-kids-eating.html','guide-kids-shows.html']}),
 ('kosher',      {'hub':'guide-kosher.html',      'label':'אוכל כשר',  'postCat':'אוכל',
                  'pages':['guide-kosher-planning.html','guide-kosher-shabbat.html','guide-kosher-meat.html','guide-kosher-dairy.html',
                           'guide-kosher-bakeries.html','guide-kosher-shopping.html','guide-kosher-golders-green.html',
                           'guide-kosher-hendon.html','guide-kosher-edgware.html','guide-kosher-synagogues.html']}),
 ('football',    {'hub':'guide-football.html',    'label':'כדורגל',    'postCat':'כדורגל',
                  'pages':['guide-football-stadiums.html','guide-football-tickets.html','guide-football-matchday.html','guide-football-arsenal.html','guide-football-chelsea.html','guide-football-tottenham.html','guide-football-wembley.html','guide-football-womens.html','guide-football-tours.html','guide-football-other-sports.html']}),
 ('events',       {'hub':'guide-events.html',      'label':'אירועים ומועדים','postCat':'אירועים',
                  'pages':['guide-events-closures.html','guide-events-bonfire.html','guide-events-christmas.html',
                           'guide-events-newyear.html','guide-events-carnival.html','guide-events-pride.html',
                           'guide-events-royal.html','guide-events-marathon.html','guide-events-wimbledon.html',
                           'guide-events-multicultural.html']}),
 ('flight',      {'hub':'guide-flight.html',      'label':'התכנון והטיסה','postCat':'תכנון הטיול',
                  'pages':['guide-flight-eta.html','guide-flight-airports.html','guide-flight-when.html',
                           'guide-flight-budget.html','guide-flight-money.html','guide-flight-packing.html',
                           'guide-flight-esim.html','guide-flight-insurance.html','guide-flight-customs.html',
                           'guide-flight-family.html']}),
 ('winter',      {'hub':'guide-winter.html',      'label':'לונדון בחורף', 'postCat':'לונדון בחורף',
                  'pages':['guide-winter-hanukkah.html','guide-winter-markets.html','guide-winter-ice-skating.html',
                           'guide-winter-lights.html','guide-winter-boxing-day.html','guide-winter-kids.html',
                           'guide-winter-weather.html','guide-winter-dark.html','guide-winter-cozy.html',
                           'guide-winter-january.html']}),
])


def meta(s, n):
    m = re.search(r'<meta\s+name="%s"\s+content="(.*?)"' % n, s, re.S)
    return m.group(1).strip() if m else ''


def h1(s):
    m = re.search(r'<div class="page-hero[^"]*"[^>]*>.*?<h1>(.*?)</h1>', s, re.S)
    if m:
        return re.sub(r'\s+', ' ', m.group(1)).strip()
    m = re.search(r'<title>(.*?)</title>', s, re.S)
    return re.sub(r'\s*\|\s*גו לונדון\s*$', '', m.group(1).strip()) if m else ''


def hero(s):
    m = re.search(r"\.page-hero::before\s*\{[^}]*url\('([^']+)'\)", s)
    if m:
        return m.group(1)
    m = re.search(r"--hero:\s*url\('([^']+)'\)", s)
    return m.group(1) if m else ''


def main():
    out = collections.OrderedDict()
    out['_מה_זה_הקובץ_הזה'] = 'מפת האשכולות של האתר. נבנה אוטומטית על ידי build_guides.py, אין לערוך ידנית.'
    out['clusters'] = collections.OrderedDict()
    problems = []

    for key, c in CLUSTERS.items():
        arts = []
        for p in c['pages']:
            if not os.path.exists(p):
                problems.append('עמוד חסר: ' + p)
                continue
            s = open(p, encoding='utf-8').read()
            a = {'url': p, 'title': h1(s), 'desc': meta(s, 'description'), 'img': hero(s)}
            for field in ('title', 'desc', 'img'):
                if not a[field]:
                    problems.append('%s: חסר %s' % (p, field))
            if a['img'] and not os.path.exists(a['img']):
                problems.append('%s: קובץ התמונה לא קיים, %s' % (p, a['img']))
            arts.append(a)
        out['clusters'][key] = {'hub': c['hub'], 'label': c['label'], 'postCat': c['postCat'], 'articles': arts}

    json.dump(out, open('guides.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    for k, v in out['clusters'].items():
        print('  %-12s %d מאמרים' % (k, len(v['articles'])))
    print('סה"כ מאמרים:', sum(len(v['articles']) for v in out['clusters'].values()))
    if problems:
        print('\nבעיות:')
        for p in problems:
            print('  •', p)
    else:
        print('אין בעיות. לכל מאמר יש כותרת, תיאור ותמונה קיימת.')


main()
