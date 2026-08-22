# -*- coding: utf-8 -*-
"""
בונה את רשימת האטרקציות בעמוד guide-attractions.html ואת קובץ המידע
attractions-info.json שנטען לצידו.

מקור האמת הוא planner-data.json. אותן אטרקציות בדיוק מופיעות בבונה
המסלול ובעמוד הזה, ולכן אי אפשר שיהיה הבדל בין מה שכתוב בשני המקומות.
ארבעה פריטים אינם בבונה המסלול, והתוכן שלהם נשמר בקובץ EXTRA כאן.

להרצה אחרי כל שינוי באטרקציות:
    python3 build_attractions.py
"""
import json, collections, os, re, html

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
 ('מוזיאונים קטנים שמעטים מכירים', ['wallace-collection','soane-museum','transport-museum','dickens-museum','bank-museum','postal-museum','wellcome-collection','sherlock-museum','museum-of-home','whitechapel-gallery','docklands-museum','raf-museum','old-operating-theatre','churchill-rooms','dennis-severs']),
 ('תצפיות ונקודות נוף', ['sky-garden','shard','royal-observatory','primrose-hill','monument','cable-car']),
 ('שווקים, אוכל וחיי רחוב', ['borough-market','camden-market','spitalfields-market','columbia-road','leadenhall-market','greenwich-market','brick-lane','chinatown-soho','coal-drops-yard','horizon-22']),
 ('פארקים ושטחים פתוחים', ['hyde-park','st-james-park','regents-park','hampstead-heath','holland-park','richmond-park','kew-gardens','little-venice']),
 ('שכונות ורחובות לשיטוט', ['covent-garden','notting-hill','shoreditch-art','neals-yard','southbank-walk','greenwich','st-katharine-docks','battersea-power-station']),
 ('ארמונות ובתים היסטוריים', ['kensington-palace','hampton-court','windsor-castle','kenwood-house','queens-house']),
 ('פינות נסתרות והיסטוריה', ['st-dunstan','temple-of-mithras','guildhall','southwark-cathedral','leake-street','highgate-cemetery','greenwich-foot-tunnel','cutty-sark','hms-belfast','globe-theatre','barbican']),
 ('אטרקציות שילדים אוהבים', ['london-zoo','sea-life','madame-tussauds','harry-potter']),
 ('מוזיקה, תיאטרון וספורט', ['royal-albert-hall','west-end-theatre','wembley-tour']),
 ('קניות', ['harrods']),
])

THEME_ICON = {
 'אייקונים שאי אפשר לפספס':'🏛️', 'המוזיאונים הגדולים, כניסה חינם':'🖼️',
 'מוזיאונים קטנים שמעטים מכירים':'🔎', 'תצפיות ונקודות נוף':'🌆',
 'שווקים, אוכל וחיי רחוב':'🥐', 'פארקים ושטחים פתוחים':'🌳',
 'שכונות ורחובות לשיטוט':'🚶', 'ארמונות ובתים היסטוריים':'👑',
 'פינות נסתרות והיסטוריה':'🗝️', 'אטרקציות שילדים אוהבים':'🧸',
 'מוזיקה, תיאטרון וספורט':'🎭', 'קניות':'🛍️',
}

TIQETS = 'https://www.tiqets.com/en/london-attractions-c66342/'

# ארבעה פריטים שאינם בבונה המסלול. התוכן נשמר כאן כדי שלא יאבד בבנייה מחדש.
EXTRA = {
 'primrose-hill': {
   'name':'פרימרוז היל', 'area':'קמדן וצפון', 'free':True,
   'short':'אחד הנופים הפנורמיים היפים בעיר, בחינם ובלי תור.',
   'desc':'גבעה נמוכה מצפון לריג׳נטס פארק, ובראשה אחד הנופים הפתוחים היפים ביותר על קו הרקיע של לונדון. אין כניסה, אין תור ואין כרטיס.',
   'tip':'צמודה לריג׳נטס פארק ולגן החיות, כך שאפשר לחבר את שלושתם ליום אחד ברגל.'},
 'british-pub': {
   'name':'פאב בריטי ותיק', 'area':'בכל העיר', 'free':True,
   'short':'לא רק ארוחה. מוסד חברתי שקיים כאן מאות שנים.',
   'desc':'הפאב הוא הסלון הציבורי של הבריטים. מזמינים בבר ולא במקום הישיבה, משלמים מיד, ולרוב אין מלצר שיגיע לשולחן. חלק מהפאבים בעיר פועלים באותו מבנה כבר מאות שנים.',
   'tip':'בשעות הצהריים רוב הפאבים מגישים אוכל ומקבלים משפחות. בערב חלקם עוברים לגילאי שמונה עשרה ומעלה בלבד.'},
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


def cta_label(a):
    if not a.get('free'):
        return 'כרטיסים ומחירים'
    if a.get('bookAhead'):
        return 'תפיסת מקום מראש'
    if a.get('partlyPaid'):
        return 'כרטיסים לחלקים שבתשלום'
    return 'סיורים וכרטיסים באזור'


def main():
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

            cta = {'label': cta_label({'free': free, 'bookAhead': book, 'partlyPaid': partly}),
                   'offer': 'attractions_alt', 'href': TIQETS}
            if tour and tour.get('applicable'):
                src = tour.get('source_url') or TIQETS
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
            if video and video.get('verified') and video.get('youtube_id'):
                entry['video'] = {'id': video['youtube_id'], 'title': video.get('title', '')}
            info[pid] = entry

            if free and not partly:
                badge = ' <span class="free-badge">חינם</span>'
            elif free and partly:
                badge = ' <span class="free-badge is-partial">חינם חלקית</span>'
            else:
                badge = ''
            items.append(
                '      <div class="num-item" data-place="%s"><div class="num">%d</div>'
                '<div><h3>%s%s</h3><p>%s</p></div></div>'
                % (esc(pid), n, esc(name), badge, esc(short))
            )

        rows.append('    <h2>%s %s</h2>\n    <div class="num-list">\n%s\n    </div>'
                    % (THEME_ICON.get(theme, ''), esc(theme), '\n'.join(items)))

    json.dump(info, open('attractions-info.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    body = '\n\n'.join(rows)
    open('.attractions-list.html', 'w', encoding='utf-8').write(body)

    print('אטרקציות ברשימה:', n)
    print('ערכים בקובץ המידע:', len(info) - 1)
    print('נושאים:', len(THEMES))
    if problems:
        print('\nבעיות:')
        for p in problems:
            print('  •', p)
    else:
        print('אין בעיות. לכל אטרקציה יש שם, אזור, הסבר וכפתור הזמנה.')


main()
