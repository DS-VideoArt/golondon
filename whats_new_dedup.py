# -*- coding: utf-8 -*-
"""
מנגנון מניעת הכפילויות של "מה חדש בלונדון".

הבעיה שהוא פותר: אותו נושא חוזר כעבור כמה ימים תחת כותרת אחרת ומקור אחר,
ונראה כמו ידיעה חדשה. בדיקת כתובת או כותרת בלבד לא תופסת את זה.

ארבע שכבות בדיקה, לפי הסדר:
  1. כתובת מקור זהה שכבר שימשה
  2. אותו entity בתוך חלון ההמתנה. זו השכבה שתופסת "תערוכת הוקני" מול
     "התערוכה של הוקני שכדאי להכיר", כי שתיהן מצביעות על אותו גוף נושא
  3. דמיון גבוה בין הכותרות
  4. דמיון גבוה בין התקצירים

שימוש מתוך המשימה היומית:
    from whats_new_dedup import check, record
    verdict = check(candidate)      # מחזיר None אם מותר לפרסם, אחרת סיבת הפסילה
    ...
    record(item)                    # רק אחרי פרסום בפועל

הרצה ישירה מריצה בדיקה עצמית על כל האייטמים שכבר פורסמו.
"""
import json, os, re, hashlib, datetime, difflib
from urllib.parse import urlparse

os.chdir(os.path.dirname(os.path.abspath(__file__)))

REGISTRY = 'whats-new-registry.json'

ENTITY_WINDOW_DAYS = 180   # אותו נושא לא חוזר בתוך חצי שנה
TITLE_SIMILARITY = 0.72
SUMMARY_SIMILARITY = 0.80

# מילים שלא מזהות נושא ולכן מוסרות לפני ההשוואה
STOP = set('''the a an of in on at to for and or is are was were this that with from
new london לונדון של את עם על אל כל זה זו הוא היא גם רק כבר עוד מה מי איך למה
חדש חדשה החדש החדשה כדאי שווה להכיר לדעת המדריך מדריך'''.split())


def _load():
    if not os.path.exists(REGISTRY):
        return {'_מה_זה_הקובץ_הזה': 'מרשם היסטורי מלא של כל מה שפורסם ב"מה חדש בלונדון". משמש למניעת פרסום כפול. אין למחוק ממנו רשומות.',
                'published': []}
    return json.load(open(REGISTRY, encoding='utf-8'))


def _save(d):
    json.dump(d, open(REGISTRY, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def norm(s):
    """מוריד ניקוד, סימני פיסוק ומילות קישור, כדי שההשוואה תהיה על המהות ולא על הניסוח."""
    s = (s or '').lower()
    s = re.sub(r'[֑-ׇ]', '', s)          # ניקוד וטעמים
    s = re.sub(r'[^\w\s֐-׿]', ' ', s)     # פיסוק
    words = [w for w in s.split() if w not in STOP and len(w) > 1]
    return ' '.join(words)


def entity_key(e):
    return norm(e)


def sim(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


def content_hash(s):
    return hashlib.sha256(norm(s).encode('utf-8')).hexdigest()[:16]


def check(cand, today=None):
    """
    cand הוא מילון עם title, entity, summary, sources.
    מחזיר None אם מותר לפרסם, אחרת מחרוזת שמסבירה למה נפסל.
    """
    d = _load()
    pub = d['published']
    today = today or datetime.date.today()

    cand_urls = {s['url'] for s in cand.get('sources', [])}
    cand_ent = entity_key(cand.get('entity', ''))
    cand_title = norm(cand.get('title', ''))
    cand_sum = norm(cand.get('summary', ''))

    for p in pub:
        # 1. אותה כתובת מקור
        shared = cand_urls & set(p.get('sourceUrls', []))
        if shared:
            return 'כתובת המקור כבר שימשה אותנו ב-%s: %s' % (p['datePublished'], list(shared)[0])

        # 2. אותו נושא בתוך חלון ההמתנה
        if cand_ent and p.get('entityNorm') and cand_ent == p['entityNorm']:
            days = (today - datetime.date.fromisoformat(p['datePublished'])).days
            if days <= ENTITY_WINDOW_DAYS:
                return ('אותו נושא כבר פורסם לפני %d ימים תחת הכותרת "%s". '
                        'מותר רק אם יש התפתחות חדשה ומהותית, ואז יש לסמן את האייטם כהמשך.'
                        % (days, p['title']))

        # 3. דמיון כותרות
        r = sim(cand_title, norm(p['title']))
        if r >= TITLE_SIMILARITY:
            return 'כותרת דומה מדי (%.0f אחוז) לכותרת מ-%s: "%s"' % (r * 100, p['datePublished'], p['title'])

        # 4. דמיון תקצירים
        if cand_sum and p.get('summaryNorm'):
            r = sim(cand_sum, p['summaryNorm'])
            if r >= SUMMARY_SIMILARITY:
                return 'תוכן דומה מדי (%.0f אחוז) לאייטם מ-%s: "%s"' % (r * 100, p['datePublished'], p['title'])

    return None


def record(item):
    """נקרא רק אחרי שהאייטם באמת פורסם."""
    d = _load()
    if any(p['id'] == item['id'] for p in d['published']):
        return False
    urls = [s['url'] for s in item.get('sources', [])]
    d['published'].append({
        'id': item['id'],
        'title': item['title'],
        'titleNorm': norm(item['title']),
        'slug': item.get('standalone') or item['anchor'],
        'datePublished': item['date'],
        'sourceUrls': urls,
        'sourceDomains': sorted({urlparse(u).netloc for u in urls}),
        'entity': item.get('entity', ''),
        'entityNorm': entity_key(item.get('entity', '')),
        'category': item.get('category', ''),
        'summary': item.get('summary', ''),
        'summaryNorm': norm(item.get('summary', '')),
        'summaryHash': content_hash(item.get('summary', '')),
    })
    d['published'].sort(key=lambda p: p['datePublished'], reverse=True)
    _save(d)
    return True


def sync_from_feed():
    """רושם למרשם כל אייטם שכבר קיים ב-whats-new.json ועדיין לא נרשם."""
    feed = json.load(open('whats-new.json', encoding='utf-8'))
    n = 0
    for it in feed['items']:
        if record(it):
            n += 1
    return n


if __name__ == '__main__':
    added = sync_from_feed()
    d = _load()
    print('מרשם הפרסומים: %d רשומות, נוספו כעת %d' % (len(d['published']), added))
    print()
    print('בדיקה עצמית, כל אייטם שפורסם צריך להיפסל אם יוגש שוב:')
    feed = json.load(open('whats-new.json', encoding='utf-8'))
    for it in feed['items']:
        v = check(it)
        print('  %-46s %s' % (it['entity'][:44], 'נפסל כצפוי' if v else 'לא נפסל, תקלה'))
    print()
    print('בדיקת ניסוח מחדש של אותו נושא, כותרת ומקור שונים לגמרי:')
    fake = {
        'title': 'התערוכה של טרייסי אמין שכדאי להכיר לפני שהיא נעלמת',
        'entity': 'Tracey Emin A Second Life, Tate Modern',
        'summary': 'סקירה על התערוכה המדוברת בטייט מודרן ולמה שווה להגיע אליה.',
        'sources': [{'name': 'מקור אחר לגמרי', 'url': 'https://example.com/emin-review'}],
    }
    print('  ', check(fake) or 'לא נפסל, תקלה')
