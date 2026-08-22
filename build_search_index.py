# -*- coding: utf-8 -*-
"""
בונה אינדקס חיפוש אחד לכל האתר.
מקורות: עמודי המדריכים, עמודי החודשים, הפוסטים, האטרקציות של בונה
המסלול, והמקומות הכשרים. הפלט הוא קובץ אחד שעמוד החיפוש טוען.

צריך להריץ מחדש אחרי כל הוספה של עמוד או תוכן.
"""
import html as _html
import json, re, os, glob, collections

ROOT = '/Users/mymac/דפי נחיתה ואתרים/golondon'
os.chdir(ROOT)

# עמודים שאין טעם לחפש בהם
SKIP = {'404.html', 'admin.html', 'search.html', 'category.html',
        'privacy.html', 'terms.html', 'accessibility.html', 'disclosure.html'}

TYPE_LABEL = {
    'guide': 'מדריך',
    'month': 'לפי חודשים',
    'post': 'פוסט',
    'place': 'אטרקציה',
    'kosher': 'מקום כשר',
    'tool': 'כלי',
    'update': 'מה חדש',
}


def meta(html, name):
    m = re.search(r'<meta\s+name="%s"\s+content="(.*?)"' % name, html, re.S)
    return m.group(1).strip() if m else ''


def title_of(html):
    m = re.search(r'<title>(.*?)</title>', html, re.S)
    if not m:
        return ''
    t = m.group(1).strip()
    return re.sub(r'\s*\|\s*גו לונדון\s*$', '', t)


def hero_img(html):
    m = re.search(r'<meta\s+property="og:image"\s+content="(.*?)"', html)
    if not m:
        return ''
    u = m.group(1)
    return u.replace('https://golondon.co.il/', '')


def body_text(html):
    """טקסט נקי מגוף העמוד, לחיפוש בתוך התוכן ולא רק בכותרת"""
    m = re.search(r'<div class="content">(.*?)</div>\s*</main>', html, re.S)
    chunk = m.group(1) if m else html
    chunk = re.sub(r'<script.*?</script>', ' ', chunk, flags=re.S)
    chunk = re.sub(r'<style.*?</style>', ' ', chunk, flags=re.S)
    chunk = re.sub(r'<[^>]+>', ' ', chunk)
    chunk = re.sub(r'&[a-z]+;', ' ', chunk)
    return re.sub(r'\s+', ' ', chunk).strip()



# כינויי חיפוש. נועד למקרה שהמשתמש מקליד באנגלית מונח שהעמוד מכסה
# בעברית בלבד. בלי זה חיפוש "West End" נופל על עמודים אחרים שסתם
# מזכירים את הצירוף בגוף הטקסט, במקום על העמוד שבאמת עוסק בו.
ALIASES = {
    'guide-attractions-westend.html': (
        'west end westend west-end theatre theater musical musicals show shows '
        'הצגה הצגות מחזמר מחזות זמר מופע מופעים תיאטרון ווסט אנד'
    ),
}

items = []

# ---------- עמודי HTML ----------
for f in sorted(glob.glob('*.html')):
    if f in SKIP:
        continue
    html = open(f, encoding='utf-8').read()
    t = _html.unescape(title_of(html))
    if not t:
        continue

    if f.startswith('london-') and f != 'london-by-month.html':
        typ, cat = 'month', 'לפי חודשים'
    elif f == 'london-by-month.html':
        typ, cat = 'month', 'לפי חודשים'
    elif f.startswith('guide-'):
        typ = 'guide'
        cat = {'guide-transport': 'תחבורה', 'guide-kosher': 'אוכל כשר', 'guide-stay': 'לינה',
               'guide-kids': 'עם ילדים', 'guide-attractions': 'אטרקציות',
               'guide-football': 'כדורגל', 'guide-flight': 'לפני הטיסה',
               'guide-winter': 'לונדון בחורף', 'guide-events': 'אירועים ומועדים',
               'guide-oyster': 'תחבורה'}.get(f.rsplit('-', 1)[0] if f.count('-') > 1 else f[:-5], 'מדריך')
        for k, v in [('transport', 'תחבורה'), ('kosher', 'אוכל כשר'), ('stay', 'לינה'),
                     ('kids', 'עם ילדים'), ('attractions', 'אטרקציות'), ('winter', 'לונדון בחורף'),
                     ('events', 'אירועים ומועדים'),
                     ('football', 'כדורגל'), ('flight', 'לפני הטיסה'), ('oyster', 'תחבורה')]:
            if k in f:
                cat = v
                break
    elif f.startswith('whats-new'):
        typ, cat = 'update', 'מה חדש בלונדון'
    elif f in ('planner.html', 'kosher-map.html', 'before-you-fly.html', 'index.html',
               'join.html', 'contact.html', 'about.html'):
        typ, cat = 'tool', 'כלים'
    else:
        typ, cat = 'guide', 'מדריך'

    items.append({
        'type': typ, 'title': t, 'cat': cat, 'url': f,
        'alias': ALIASES.get(f, ''),
        'desc': meta(html, 'description'),
        'img': hero_img(html),
        'text': body_text(html)[:1400],
    })

# ---------- פוסטים ----------
for p in json.load(open('posts.json', encoding='utf-8')):
    items.append({
        'type': 'post', 'title': p['title'], 'cat': p.get('category', ''),
        'url': 'category.html?cat=%s#post-%s' % (p.get('category', ''), p['id']),
        'desc': (p.get('content') or '')[:180],
        'img': p.get('image', ''),
        'text': (p.get('content') or '')[:1400],
    })

# ---------- אטרקציות בבונה המסלול ----------
pd = json.load(open('planner-data.json', encoding='utf-8'))
areas = pd.get('areas', {})
for a in pd['attractions']:
    area = areas.get(a['area'], {}).get('name', '')
    items.append({
        'type': 'place', 'title': a['name'], 'cat': area,
        'url': 'planner.html',
        'desc': a.get('desc', '')[:180],
        'img': '',
        'text': ' '.join(filter(None, [a.get('desc'), a.get('tip'), a.get('nameEn'), a.get('tube'), a.get('priceBand')])),
    })

# ---------- מקומות כשרים ----------
if os.path.exists('kosher-places.json'):
    kp = json.load(open('kosher-places.json', encoding='utf-8'))
    places = kp if isinstance(kp, list) else kp.get('places', [])
    for k in places:
        if not isinstance(k, dict):
            continue
        name = k.get('name') or k.get('title')
        if not name:
            continue
        # הכתובות בקובץ באנגלית, ולכן חיפוש בעברית לא היה מוצא אותן.
        # כאן מתווספים שמות השכונות בעברית לטקסט שעליו רץ החיפוש.
        AREA_HE = {
            'Golders Green': 'גולדרס גרין', 'Hendon': 'הנדון', 'Edgware': 'אדגוור',
            'Temple Fortune': 'טמפל פורצ׳ן', 'Finchley': 'פינצ׳לי', 'Stamford Hill': 'סטמפורד היל',
            'Borehamwood': 'בורהמווד', 'Mill Hill': 'מיל היל', 'Hampstead': 'המפסטד',
        }
        addr = k.get('address') or ''
        he_areas = [he for en, he in AREA_HE.items() if en.lower() in addr.lower()]
        cat_he = k.get('category') or 'אוכל כשר'
        items.append({
            'type': 'kosher', 'title': name,
            'cat': (he_areas[0] if he_areas else 'אוכל כשר'),
            'url': 'kosher-map.html',
            'desc': ((cat_he + ', ' + addr) if addr else cat_he)[:180],
            'img': '',
            'text': ' '.join([name, cat_he, addr, k.get('kashrus') or '', 'כשר כשרות',
                              ' '.join(he_areas)])[:800],
        })

# הסרת כפילויות לפי כתובת וכותרת
seen = set()
clean = []
for it in items:
    key = (it['url'], it['title'])
    if key in seen:
        continue
    seen.add(key)
    clean.append(it)

out = collections.OrderedDict()
out['_מה_זה_הקובץ_הזה'] = 'אינדקס החיפוש של כל האתר. נבנה אוטומטית, אין לערוך ידנית.'
out['_עודכן'] = '2026-08-08'
out['labels'] = TYPE_LABEL
out['items'] = clean

json.dump(out, open('search-index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

c = collections.Counter(i['type'] for i in clean)
print('סה"כ פריטים באינדקס:', len(clean))
for k, v in c.most_common():
    print('  %-8s %-14s %d' % (k, TYPE_LABEL.get(k, ''), v))
print('גודל הקובץ:', round(os.path.getsize('search-index.json') / 1024), 'קילובייט')
