# -*- coding: utf-8 -*-
"""
בונה את רשימת האטרקציות בעמוד guide-attractions.html ואת קובץ המידע
attractions-info.json שנטען לצידו.

מקור האמת הוא planner-data.json. אותן אטרקציות בדיוק מופיעות בבונה
המסלול ובעמוד הזה, ולכן אי אפשר שיהיה הבדל בין מה שכתוב בשני המקומות.
שלושה פריטים אינם בבונה המסלול, והתוכן שלהם נשמר בקובץ EXTRA כאן.

להרצה אחרי כל שינוי באטרקציות:
    python3 build_attractions.py
"""
import json, collections, os, re, html, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

"""
העשרה חיצונית: attractions-research.json, קובץ נפרד שלא נגזר משום מקום
אחר. הוא מחזיק וידאו יוטיוב אמיתי ותוכן סיור מקורי לעברית שנאספו בפועל
מהרשת, לא הומצאו. אם קיים, מוזג לכל פריט. אם לא קיים, שום דבר לא נשבר,
פשוט אין וידאו ואין תוכן סיור מותאם, והכפתור הרגיל נשאר כמו קודם.
"""
RESEARCH = {}
if os.path.exists('attractions-research.json'):
    RESEARCH = json.load(open('attractions-research.json', encoding='utf-8'))

THEMES = collections.OrderedDict([
 ('אייקונים שאי אפשר לפספס', ['big-ben','tower-bridge','tower-of-london','buckingham','westminster-abbey','st-pauls','london-eye','trafalgar-square','piccadilly-circus']),
 ('המוזיאונים הגדולים, כניסה חינם', ['british-museum','national-gallery','natural-history','science-museum','va-museum','tate-modern','tate-britain','national-portrait-gallery','imperial-war-museum','maritime-museum','british-library','design-museum']),
 ('מוזיאונים קטנים שמעטים מכירים', ['wallace-collection','soane-museum','transport-museum','museum-of-brands','dickens-museum','bank-museum','postal-museum','wellcome-collection','sherlock-museum','museum-of-home','whitechapel-gallery','docklands-museum','raf-museum','old-operating-theatre','churchill-rooms','dennis-severs']),
 ('תצפיות ונקודות נוף', ['sky-garden','shard','royal-observatory','primrose-hill','monument','cable-car']),
 ('שווקים, אוכל וקניות', ['borough-market','camden-market','spitalfields-market','columbia-road','leadenhall-market','greenwich-market','brick-lane','chinatown-soho','coal-drops-yard','horizon-22','harrods']),
 ('פארקים ושטחים פתוחים', ['hyde-park','st-james-park','regents-park','hampstead-heath','holland-park','richmond-park','kew-gardens','little-venice']),
 ('שכונות ורחובות לשיטוט', ['covent-garden','notting-hill','notting-hill-pastel-streets','golborne-road','shoreditch-art','neals-yard','southbank-walk','greenwich','st-katharine-docks','battersea-power-station']),
 ('ארמונות ובתים היסטוריים', ['kensington-palace','hampton-court','windsor-castle','kenwood-house','queens-house','somerset-house']),
 ('פינות נסתרות והיסטוריה', ['st-dunstan','temple-of-mithras','guildhall','southwark-cathedral','leake-street','highgate-cemetery','greenwich-foot-tunnel','cutty-sark','hms-belfast','globe-theatre','barbican','st-pauls-church']),
 ('אטרקציות שילדים אוהבים', ['london-zoo','sea-life','madame-tussauds','harry-potter']),
 ('מוזיקה, תיאטרון וספורט', ['royal-albert-hall','royal-opera-house','electric-cinema','west-end-theatre','wembley-tour']),
])

THEME_ICON = {
 'אייקונים שאי אפשר לפספס':'🏛️', 'המוזיאונים הגדולים, כניסה חינם':'🖼️',
 'מוזיאונים קטנים שמעטים מכירים':'🔎', 'תצפיות ונקודות נוף':'🌆',
 'שווקים, אוכל וקניות':'🥐', 'פארקים ושטחים פתוחים':'🌳',
 'שכונות ורחובות לשיטוט':'🚶', 'ארמונות ובתים היסטוריים':'👑',
 'פינות נסתרות והיסטוריה':'🗝️', 'אטרקציות שילדים אוהבים':'🧸',
 'מוזיקה, תיאטרון וספורט':'🎭',
}

"""
כתובת ההצעה המסחרית
===================
היא נגזרת מ-affiliate.json בלבד, שהוא מקור האמת להצעות. כתובת שכתובה
פעמיים בשני קבצים מתיישנת באחד מהם, וזה בדיוק מה שקרה כאן פעם: הקבוע
שהיה כתוב כאן הצביע על קטגוריה שהיעד הסופי שלה הוא ברצלונה, לא לונדון.
אם הקובץ חסר או שהכתובת אינה תקינה, הבנייה נעצרת לפני כתיבת פלט.
"""


def commercial_url():
    if not os.path.exists('affiliate.json'):
        sys.exit('עצירה: affiliate.json חסר, ואי אפשר לגזור ממנו כתובת הצעה.')
    try:
        aff = json.load(open('affiliate.json', encoding='utf-8'))
        url = aff['offers']['attractions_alt']['url']
    except (ValueError, KeyError, TypeError):
        sys.exit('עצירה: אין ל-affiliate.json מבנה offers.attractions_alt.url תקין.')
    if not isinstance(url, str) or not url.startswith('https://'):
        sys.exit('עצירה: כתובת ההצעה אינה כתובת HTTPS תקינה: ' + repr(url))
    return url


OFFER_URL = commercial_url()


"""
סיווג הקישורים
==============
לכל אחת מ-92 האטרקציות יש בדיוק סוג קישור אחד, והוא נקבע כאן ולא
בברירת מחדל. הסדר הזה הוא החלטת מותג: תוכן שימושי לקורא קודם
להכנסה מסחרית.

  1. מקום בתשלום שיש לו מחקר מאומת, מקבל את היעד שנבדק עבורו.
  2. מקום שיש לו המשך טבעי אצלנו, מקבל קישור פנימי לאותו מדריך.
  3. מקום חינמי עם אתר רשמי, מקבל את האתר הרשמי שלו.
  4. רק מקום אחד, מחזמר בווסט אנד, מקבל הצעה מסחרית כללית, כי אין
     לו כתובת רשמית אחת אלא עשרות אולמות.

מזהה שאינו נמצא באף קבוצה הוא שגיאת בנייה, לא הזמנה לקישור מסחרי.
"""

INTERNAL_LINKS = collections.OrderedDict([
 ('guide-attractions-free.html', ('עוד אטרקציות בחינם',
   ['trafalgar-square', 'piccadilly-circus', 'leake-street', 'harrods'])),
 ('guide-attractions-museums.html', ('כל המוזיאונים החינמיים',
   ['wallace-collection', 'soane-museum', 'bank-museum', 'wellcome-collection',
    'museum-of-home', 'docklands-museum', 'raf-museum', 'kenwood-house', 'queens-house'])),
 ('guide-attractions-views.html', ('עוד תצפיות על לונדון',
   ['primrose-hill'])),
 ('guide-attractions-markets.html', ('כל שווקי לונדון',
   ['borough-market', 'camden-market', 'spitalfields-market', 'columbia-road',
    'leadenhall-market', 'golborne-road'])),
 ('guide-areas-shoreditch.html', ('המדריך המלא לשורדיץ׳',
   ['brick-lane'])),
 ('guide-areas-greenwich.html', ('המדריך המלא לגריניץ׳',
   ['greenwich-market'])),
 ('guide-areas-covent-garden.html', ('המדריך המלא לקובנט גארדן',
   ['covent-garden'])),
 ('guide-areas.html', ('מדריכי האזורים של לונדון',
   ['chinatown-soho', 'notting-hill', 'notting-hill-pastel-streets'])),
 ('guide-attractions-hidden.html', ('עוד פינות נסתרות',
   ['coal-drops-yard', 'neals-yard', 'st-katharine-docks', 'st-dunstan',
    'guildhall', 'southwark-cathedral', 'greenwich-foot-tunnel'])),
 ('guide-attractions-parks.html', ('כל הפארקים המלכותיים',
   ['hyde-park', 'st-james-park', 'regents-park', 'hampstead-heath',
    'holland-park', 'richmond-park'])),
 ('guide-attractions-thames.html', ('עוד לאורך התמזה',
   ['southbank-walk', 'greenwich'])),
])

OFFICIAL_FREE = collections.OrderedDict([
 ('british-museum', ('תערוכות מתחלפות באתר המוזיאון', 'https://www.britishmuseum.org/exhibitions')),
 ('national-gallery', ('תערוכות מתחלפות באתר הגלריה', 'https://www.nationalgallery.org.uk/exhibitions')),
 ('natural-history', ('תערוכות ואירועים באתר המוזיאון', 'https://www.nhm.ac.uk/events.html')),
 ('science-museum', ('תערוכות וחוויות באתר המוזיאון', 'https://www.sciencemuseum.org.uk/see-and-do')),
 ('va-museum', ('תערוכות מתחלפות באתר המוזיאון', 'https://www.vam.ac.uk/exhibitions')),
 ('tate-modern', ('תערוכות מתחלפות באתר טייט', 'https://www.tate.org.uk/visit/tate-modern')),
 ('tate-britain', ('תערוכות מתחלפות באתר טייט', 'https://www.tate.org.uk/visit/tate-britain')),
 ('national-portrait-gallery', ('תערוכות מתחלפות באתר הגלריה', 'https://www.npg.org.uk/whatson/')),
 ('imperial-war-museum', ('תערוכות ואירועים באתר המוזיאון', 'https://www.iwm.org.uk/events')),
 ('maritime-museum', ('תערוכות מתחלפות באתר המוזיאון', 'https://www.rmg.co.uk/national-maritime-museum')),
 ('british-library', ('תערוכות ואירועים באתר הספרייה', 'https://events.bl.uk/')),
 ('design-museum', ('תערוכות מתחלפות באתר המוזיאון', 'https://designmuseum.org/exhibitions')),
 ('royal-opera-house', ('מופעים, סיורים ומה פתוח היום באתר הרשמי', 'https://www.rbo.org.uk/visit/visitor-information')),
 ('somerset-house', ('תערוכות ואירועים באתר סומרסט האוס', 'https://www.somersethouse.org.uk/whats-on')),
 ('st-pauls-church', ('שעות פתיחה ואירועים באתר הכנסייה', 'https://actorschurch.org/visit/')),
 ('whitechapel-gallery', ('תערוכות מתחלפות באתר הגלריה', 'https://www.whitechapelgallery.org/exhibitions/')),
 ('sky-garden', ('הזמנת כרטיס חינם באתר הרשמי', 'https://skygarden.london/')),
 ('battersea-power-station', ('המעלית והאירועים באתר הרשמי', 'https://batterseapowerstation.co.uk/')),
 ('temple-of-mithras', ('הזמנת כרטיס חינם באתר הרשמי', 'https://www.londonmithraeum.com/visit/')),
 ('barbican', ('הופעות ותערוכות באתר הברביקן', 'https://www.barbican.org.uk/whats-on')),
 ('horizon-22', ('הזמנת כרטיס חינם באתר הרשמי', 'https://horizon22.co.uk/')),
])

"""
מחזמר בווסט אנד הוא היחיד שמקבל הצעה מסחרית כללית: אין לו אתר רשמי
אחד אלא עשרות אולמות, ואין לנו מדריך פנימי שמחליף את חיפוש הכרטיסים.
"""
GENERIC_COMMERCIAL = 'west-end-theatre'

INTERNAL_BY_ID = {}
for _page, (_label, _ids) in INTERNAL_LINKS.items():
    for _pid in _ids:
        INTERNAL_BY_ID[_pid] = (_label, _page)

"""
קישור מדריך אזור, שדה נפרד ואופציונלי
======================================
ה-cta הוא חריץ אחד: הזמנה, אתר רשמי או מדריך נושאי, לפי סדר עדיפות
קבוע. מדריך אזור גיאוגרפי לא מתחרה עליו, אלא מקבל שדה משלו, areaGuide,
שהחלון מציג כקישור משני מתחת לכפתור הראשי.

המקור הוא places-taxonomy.json בלבד: שכונה שנושאת guide מקבלת אותו
ישירות, ושכונה בלי guide יורשת מאזור הכיסוי שהיא שייכת אליה (לדוגמה
בת'נל גרין נופלת לאזור שורדיץ'). מדריך שהקובץ שלו עדיין לא קיים בריפו
אינו מקושר, כדי שאזור עתידי בטקסונומיה לא ייצור קישור שבור.

התווית נגזרת מהמדריך ולא מהשכונה: כמה שכונות יכולות להצביע על אותו
מדריך (נייטסברידג', דרום קנזינגטון וקנזינגטון על guide-areas-kensington),
ואז השם שבתווית הוא של השכונה שהמזהה שלה זהה לסיומת המדריך, קנזינגטון.
אם אין שכונה כזאת, התווית נופלת לשם השכונה שנשאה את ה-guide.
"""
TAXONOMY = {}
if os.path.exists('places-taxonomy.json'):
    TAXONOMY = json.load(open('places-taxonomy.json', encoding='utf-8'))
_HOODS = TAXONOMY.get('hoods', {}) or {}
_ZONE_OF_HOOD = {}
for _z in ((TAXONOMY.get('coverage') or {}).get('zones') or []):
    for _h in _z.get('hoods', []):
        _ZONE_OF_HOOD.setdefault(_h, _z['id'])

def area_guide(hood, cta_href):
    """מחזיר {'label','href'} או None. לעולם לא מכפיל את הקישור הראשי."""
    if not hood:
        return None
    guide_hood = hood if _HOODS.get(hood, {}).get('guide') else _ZONE_OF_HOOD.get(hood)
    entry = _HOODS.get(guide_hood or '', {})
    guide = entry.get('guide')
    if not guide or not os.path.exists(guide + '.html'):
        return None
    href = guide + '.html'
    if href == cta_href:
        return None
    return {'label': 'המדריך המלא ל' + guide_label_name(guide, entry), 'href': href}


AREA_GUIDE_PREFIX = 'guide-areas-'

def guide_label_name(guide, origin_entry):
    """שם התווית לפי המדריך: השכונה שמזהה שלה הוא סיומת המדריך, אחרת השכונה המקורית."""
    if guide.startswith(AREA_GUIDE_PREFIX):
        owner = _HOODS.get(guide[len(AREA_GUIDE_PREFIX):], {})
        if owner.get('name'):
            return owner['name']
    return origin_entry.get('name', '')


# שלושת הפריטים הפעילים שאינם בבונה המסלול. התוכן נשמר כאן כדי שלא יאבד בבנייה מחדש.
EXTRA = {
 'primrose-hill': {
   'name':'פרימרוז היל', 'area':'קמדן וצפון', 'free':True,
   'short':'אחד הנופים הפנורמיים היפים בעיר, בחינם ובלי תור.',
   'desc':'גבעה נמוכה מצפון לריג׳נטס פארק, ובראשה אחד הנופים הפתוחים היפים ביותר על קו הרקיע של לונדון. אין כניסה, אין תור ואין כרטיס.',
   'tip':'צמודה לריג׳נטס פארק ולגן החיות, כך שאפשר לחבר את שלושתם ליום אחד ברגל.'},
 'temple-of-mithras': {
   'name':'מקדש מיתרס הרומי', 'area':'הסיטי ומזרח', 'free':True, 'bookAhead':True,
   'short':'מקדש רומי מתחת לרחוב, בחינם, עם הזמנה מראש.',
   'desc':'שרידי מקדש רומי מהמאה השלישית לספירה, שהתגלו בעבודות בנייה ושוחזרו במקומם המקורי, שבע מטרים מתחת לפני הרחוב. התצוגה כוללת שחזור אור וקול.',
   'tip':'הכניסה חינם אבל מחייבת שריון חלון זמן מראש באתר הרשמי, והמקומות אוזלים בסופי שבוע.'},
 'west-end-theatre': {
   'name':'מחזמר בווסט אנד', 'area':'וסטמינסטר ומרכז העיר', 'free':False,
   'short':'אחד מאזורי התיאטרון המפורסמים והחשובים בעולם, במרחק הליכה מקובנט גארדן.',
   'desc':'רובע התיאטראות של לונדון, המקבילה המקומית לברודוויי. עשרות אולמות פעילים בו זמנית, ממחזות זמר גדולים ועד הצגות קאמריות.',
   'tip':'דוכני הכרטיסים המוזלים בלב לסטר סקוור מוכרים מקומות לאותו יום. אין ערובה למופע מסוים, אבל ההנחה אמיתית.'},
}


def esc(s):
    return html.escape(str(s or ''), quote=True)


def build_cta(pid, tour, problems):
    """
    מחזירה את הקישור היחיד שמתאים למקום, לפי סדר ההכרעה שלמעלה.
    מזהה שאינו מסווג מדווח כבעיה ומקבל None, כדי שהבנייה תיעצר
    לפני שהוא מקבל קישור מסחרי שלא התכוונו לו.
    """
    if tour and tour.get('applicable'):
        src = tour.get('source_url') or OFFER_URL
        """
        רוב האתרים המלכותיים והממלכתיים (פרלמנט, ארמונות, מוזיאונים
        ממלכתיים) מוכרים כרטיסים ישירות ולא דרך טיקטס בכלל. הכפתור
        חייב לתאר נכון לאן הוא באמת שולח, אחרת זו הבטחת שווא.
        """
        label = 'מעבר לטיקטס ותשלום' if 'tiqets.com' in src else 'מעבר לאתר הרשמי ותשלום'
        cta = {
            'label': label,
            'offer': 'attractions_alt',
            'href': src,
            'custom': True,
            'desc': tour.get('desc_he', ''),
            'price': tour.get('price'),
            'currency': tour.get('currency'),
            'duration': tour.get('duration'),
            'priceNote': tour.get('price_note'),
        }
        """
        מחיר יכול להיות נכון היום ולא נכון בעוד שבוע. מחיר שמשתנה לפי
        תאריך ושעה לא מוצג כמספר בכלל, ומחיר קבוע שידוע מתי הוא נגמר
        נושא מועד תפוגה, כדי שהוא לא יתיישן בשקט אחרי שהמבצע נסגר.
        """
        if tour.get('price_varies'):
            cta.pop('price', None)
            cta['priceVaries'] = True
        if tour.get('price_until'):
            cta['priceUntil'] = tour['price_until']
        return cta

    if pid in INTERNAL_BY_ID:
        label, page = INTERNAL_BY_ID[pid]
        return {'label': label, 'href': page, 'internal': True}

    if pid in OFFICIAL_FREE:
        label, url = OFFICIAL_FREE[pid]
        return {'label': label, 'href': url, 'custom': True, 'free': True}

    if pid == GENERIC_COMMERCIAL:
        return {'label': 'כרטיסים ומחירים', 'offer': 'attractions_alt', 'href': OFFER_URL}

    problems.append(pid + ': אינו מסווג באף קבוצת קישורים')
    return None


def audit_classification():
    """
    בודקת את המפות עצמן לפני שנוגעים בנתונים: אין מזהה בשתי קבוצות,
    ואין מזהה ב-THEMES שנשאר בלי סיווג. שתי הבדיקות רצות לפני כתיבת
    פלט כלשהו, כי פלט שגוי שנכתב כבר הזיק.
    """
    errs = []
    internal = set(INTERNAL_BY_ID)
    official = set(OFFICIAL_FREE)
    """קובץ המחקר מכיל גם שורות מטא שאינן מילון של אטרקציה"""
    research_paid = set(pid for pid, r in RESEARCH.items()
                        if isinstance(r, dict) and (r.get('tour') or {}).get('applicable'))
    generic = {GENERIC_COMMERCIAL}

    groups = [('פנימי', internal), ('רשמי חינמי', official),
              ('בתשלום ממחקר', research_paid), ('מסחרי כללי', generic)]
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            both = groups[i][1] & groups[j][1]
            if both:
                errs.append('חפיפה בין %s ל%s: %s' % (groups[i][0], groups[j][0], ', '.join(sorted(both))))

    all_ids = [pid for ids in THEMES.values() for pid in ids]
    classified = internal | official | research_paid | generic
    for pid in all_ids:
        if pid not in classified:
            errs.append('אין סיווג ל-' + pid)
    for pid in sorted(classified - set(all_ids)):
        errs.append('מסווג אך אינו ברשימת האטרקציות: ' + pid)
    return errs


def main():
    bad = audit_classification()
    if bad:
        print('עצירה: הסיווג אינו תקין, לא נכתב שום פלט.')
        for b in bad:
            print('  •', b)
        sys.exit(1)

    d = json.load(open('planner-data.json', encoding='utf-8'))
    areas = {k: v['name'] for k, v in d['areas'].items()}
    by = {a['id']: a for a in d['attractions']}

    info = collections.OrderedDict()
    info['_מה_זה_הקובץ_הזה'] = ('מידע מורחב לכל אטרקציה בעמוד guide-attractions.html. '
                                'נבנה אוטומטית על ידי build_attractions.py מתוך planner-data.json. אין לערוך ידנית.')
    rows = []
    n = 0
    problems = []

    for theme, ids in THEMES.items():
        items = []
        for pid in ids:
            n += 1
            if pid in by:
                a = by[pid]
                name, area = a['name'], areas.get(a['area'], '')
                desc, tip = a.get('desc', ''), a.get('tip', '')
                free, book, partly = a.get('free'), a.get('bookAhead'), a.get('partlyPaid')
                kids = a.get('kids')
                short = (desc.split('.')[0] + '.') if desc else ''
            else:
                e = EXTRA.get(pid)
                if not e:
                    problems.append('אין תוכן לפריט ' + pid)
                    continue
                name, area = e['name'], e['area']
                desc, tip = e['desc'], e['tip']
                free, book, partly = e.get('free'), e.get('bookAhead'), e.get('partlyPaid')
                kids = e.get('kids')
                short = e['short']

            if not desc:
                problems.append(pid + ': אין הסבר')
            if not area:
                problems.append(pid + ': אין אזור')

            tags = []
            if free and not partly:
                tags.append({'label': 'כניסה חינם', 'type': 'free'})
            elif free and partly:
                tags.append({'label': 'כניסה חינם, תערוכות בתשלום', 'type': 'free'})
            else:
                tags.append({'label': 'בתשלום'})
            if book:
                tags.append({'label': 'הזמנה מראש'})
            tags.append({'label': area})
            """
            אין כמעט אף אטרקציה בלונדון עם גיל כניסה מינימלי אמיתי, זה בעיקר
            עניין של פאבים ומועדונים בערב. במקום למציא מספר גיל, מוצג תג רק
            כשיש בו ערך אמיתי: אזהרה עדינה שהמקום פחות מתאים לילדים קטנים.
            כשהמקום כן מתאים לילדים, ממילא אין צורך לציין את זה בכל פריט,
            כי זאת ברירת המחדל בעיר.
            """
            if kids is False:
                tags.append({'label': 'פחות מתאים לילדים קטנים', 'type': 'teen'})

            research = RESEARCH.get(pid) or {}
            video = research.get('video')
            tour = research.get('tour')

            cta = build_cta(pid, tour, problems)
            if cta is None:
                continue

            """
            כשיש לפריט מחיר סיור אמיתי שנבדק, שדה updated הוא תאריך הבדיקה
            עצמו ולא תאריך בנייה כללי, כי הוא זה שמוצג באתר כשורת "נבדק".
            בלי תאריך בדיקה ספציפי חוזרים לתווית החודשית הכללית.
            """
            updated = (tour and tour.get('applicable') and tour.get('checked')) or 'אוגוסט 2026'
            entry = collections.OrderedDict([
                ('title', name), ('tags', tags), ('body', desc), ('tip', tip),
                ('updated', updated),
                ('cta', cta),
            ])
            ag = area_guide(by[pid].get('hood') if pid in by else None, cta.get('href'))
            if ag:
                entry['areaGuide'] = ag
            if video and video.get('verified') and video.get('youtube_id'):
                entry['video'] = {'id': video['youtube_id'], 'title': video.get('title', '')}
            info[pid] = entry

            if free and not partly:
                badge = ' <span class="free-badge">חינם</span>'
            elif free and partly:
                badge = ' <span class="free-badge is-partial">חינם חלקית</span>'
            else:
                # בלי תג, פריט בתשלום נראה ברשימה כלא מסומן לצד
                # החינמיים המסומנים, והקורא לא יודע אם השמטה או מידע
                badge = ' <span class="paid-badge">בתשלום</span>'
            items.append(
                '      <div class="num-item" data-place="%s"><div class="num">%d</div>'
                '<div><h3>%s%s</h3><p>%s</p></div></div>'
                % (esc(pid), n, esc(name), badge, esc(short))
            )

        rows.append('    <h2>%s %s</h2>\n    <div class="num-list">\n%s\n    </div>'
                    % (THEME_ICON.get(theme, ''), esc(theme), '\n'.join(items)))

    if problems:
        print('עצירה: נמצאו בעיות, לא נכתב שום פלט.')
        for b in problems:
            print('  •', b)
        sys.exit(1)

    json.dump(info, open('attractions-info.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    body = '\n\n'.join(rows)
    open('.attractions-list.html', 'w', encoding='utf-8').write(body)

    kinds = collections.Counter()
    for pid, e in info.items():
        if not isinstance(e, dict) or 'cta' not in e:
            continue
        c = e['cta']
        if c.get('internal'):
            kinds['פנימי'] += 1
        elif c.get('free'):
            kinds['רשמי חינמי'] += 1
        elif c.get('custom'):
            kinds['בתשלום ממחקר'] += 1
        else:
            kinds['מסחרי כללי'] += 1

    print('אטרקציות ברשימה:', n)
    print('ערכים בקובץ המידע:', len(info) - 1)
    print('נושאים:', len(THEMES))
    print('כתובת ההצעה מ-affiliate.json:', OFFER_URL)
    print('סיווג הקישורים:')
    for k in ('פנימי', 'רשמי חינמי', 'בתשלום ממחקר', 'מסחרי כללי'):
        print('  %-14s %d' % (k, kinds[k]))
    print('אין בעיות. לכל אטרקציה יש שם, אזור, הסבר וקישור מסווג.')


main()
