#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
מחולל ומאמת המסלולים המוכנים.

routes.json הוא מקור האמת היחיד: זהות המסלול, גרסה, סדר הימים,
עצירות החובה והחלופות. הסקריפט עובד בשני שלבים:

שלב 1, יצירה: כותב לתוך עמודי המסלול את כל מה שנגזר מהמקור,
הכתובת הראשית למתכנן (בשלושת מופעיה), כפתור הטעינה של כל יום
(data-pday-add) וקישור היום הבודד (pday-go), ולתוך planner.html
את מפת שמות המסלולים בין סמני BUILD:ROUTE_NAMES.

שלב 2, אימות: בודק שהכל תואם, שאף מזהה לא חסר במאגר, שאף תחנה
לא מופיעה פעמיים באותו מסלול, ושהמונים והתגים נכונים.

שינוי מסלול נעשה כך: עורכים את routes.json, מריצים את הסקריפט,
וה-HTML והמתכנן מתעדכנים. אין רשימות מזהים ידניות בשום מקום אחר.
"""
import json
import re
import sys

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def sorted_days(route):
    return sorted(route['days'], key=lambda d: d['day_position'])


def multiday_url(route):
    """
    הכתובת שטוענת את המסלול המלא, בקידוד &amp; של HTML.
    כל יום נושא גם את הזהות שלו ב-did, כדי שהמתכנן יוכל למזג
    יום שחוזר במסלול ארוך יותר במקום לפצל אותו לשני ימים.
    """
    parts = []
    for d in sorted_days(route):
        parts.append('day=' + ','.join(d['stops']))
        parts.append('did=' + d['day_id'])
    parts.append('from=' + route['route_id'])
    parts.append('route=' + route['route_id'])
    parts.append('rv=' + str(route['route_version']))
    return 'planner.html?' + '&amp;'.join(parts)


def singleday_url(route, day):
    return ('planner.html?day=' + ','.join(day['stops']) +
            '&amp;did=' + day['day_id'] +
            '&amp;from=' + route['route_id'])


def generate_page(route):
    """כותב את כל הנגזרות של המקור לתוך עמוד המסלול. מחזיר האם השתנה."""
    page = route['page']
    html = read(page)
    orig = html
    days = sorted_days(route)
    rid = route['route_id']

    # א. הכתובת המלאה: כל href עם שני day= ומעלה ששייך למסלול הזה
    multi = re.compile(r'planner\.html\?day=[^"]*day=[^"]*from=' + re.escape(rid) + r'[^"]*')
    n_multi = len(multi.findall(html))
    if n_multi == 0:
        err('%s: לא נמצאה אף כתובת טעינה מלאה בעמוד' % rid)
    html = multi.sub(multiday_url(route), html)

    # ב. כפתור הטעינה של כל יום, לפי סדר day_position
    adds = ['data-pday-add="%s"' % ','.join(d['stops']) for d in days]
    found = re.findall(r'data-pday-add="[^"]*"', html)
    if len(found) != len(days):
        err('%s: בעמוד %d כפתורי יום, במקור %d ימים' % (rid, len(found), len(days)))
    else:
        it = iter(adds)
        html = re.sub(r'data-pday-add="[^"]*"', lambda m: next(it), html)

    # ג. קישור היום הבודד שליד כל כפתור
    singles = ['href="%s"' % singleday_url(route, d) for d in days]
    found = re.findall(r'class="pday-go" href="[^"]*"', html)
    if len(found) != len(days):
        err('%s: בעמוד %d קישורי יום בודד, במקור %d ימים' % (rid, len(found), len(days)))
    else:
        it2 = iter(singles)
        html = re.sub(r'(class="pday-go" )href="[^"]*"', lambda m: m.group(1) + next(it2), html)

    if html != orig:
        write(page, html)
    return html != orig


def generate_planner(routes):
    """מפת שמות המסלולים במתכנן נכתבת מהמקור, בין הסמנים."""
    p = 'planner.html'
    html = read(p)
    names = ', '.join("'%s': '%s'" % (r['route_id'], r['name']) for r in routes)
    block = ('/* BUILD:ROUTE_NAMES start — נוצר אוטומטית מ-routes.json על ידי build_routes.py, לא לערוך ידנית */\n'
             '  var ROUTE_NAMES = { %s };\n'
             '  /* BUILD:ROUTE_NAMES end */' % names)
    pattern = re.compile(r'/\* BUILD:ROUTE_NAMES start[^*]*\*/\n.*?\n\s*/\* BUILD:ROUTE_NAMES end \*/', re.S)
    if not pattern.search(html):
        err('planner.html: סמני BUILD:ROUTE_NAMES לא נמצאו')
        return False
    new = pattern.sub(block, html)
    if new != html:
        write(p, new)
    return new != html


def validate(routes):
    data = json.load(open('planner-data.json', encoding='utf-8'))
    attractions = {a['id']: a for a in data['attractions']}
    sitemap = read('sitemap.xml')

    for route in routes:
        rid = route['route_id']
        html = read(route['page'])
        days = sorted_days(route)

        # 1. כל מזהה קיים במאגר, עם נתונים מלאים
        for day in route['days']:
            for sid in day['stops'] + day['alternatives']:
                a = attractions.get(sid)
                if not a:
                    err('%s: המזהה %s לא קיים ב-planner-data.json' % (rid, sid))
                    continue
                for field in ('hours', 'tube', 'priceBand'):
                    if not a.get(field):
                        err('%s: לרשומה %s חסר %s' % (rid, sid, field))

        # 2. אף תחנה לא פעמיים באותו מסלול, ולא גם חובה וגם חלופה
        seen = {}
        for day in route['days']:
            for sid in day['stops']:
                if sid in seen:
                    err('%s: התחנה %s מופיעה גם ביום %s וגם ביום %s' % (rid, sid, seen[sid], day['day_position']))
                seen[sid] = day['day_position']
        alts_all = [sid for d in route['days'] for sid in d['alternatives']]
        for sid in alts_all:
            if sid in seen:
                err('%s: %s היא גם עצירת חובה וגם חלופה' % (rid, sid))

        # 3. כל יום נושא זהות, והזהות ייחודית בתוך המסלול
        ids_seen = {}
        for day in route['days']:
            did = day.get('day_id')
            if not did:
                err('%s: ליום במיקום %s אין day_id' % (rid, day.get('day_position')))
                continue
            if did in ids_seen:
                err('%s: ה-day_id "%s" מופיע פעמיים, בימים %s ו-%s'
                    % (rid, did, ids_seen[did], day['day_position']))
            ids_seen[did] = day['day_position']

        # 4. סדר הימים רציף ומתחיל מ-1
        positions = [d['day_position'] for d in days]
        if positions != list(range(1, len(positions) + 1)):
            err('%s: day_position לא רציף: %s' % (rid, positions))

        # 4. ההזרקה הצליחה: הכתובת, הכפתורים והקישורים בעמוד הם בדיוק מהמקור
        if multiday_url(route) not in html:
            err('%s: הכתובת הראשית בעמוד לא תואמת למקור' % rid)
        buttons = re.findall(r'data-pday-add="([^"]+)"', html)
        expected = [','.join(d['stops']) for d in days]
        if buttons != expected:
            err('%s: כפתורי data-pday-add לא תואמים למקור' % rid)
        singles = re.findall(r'class="pday-go" href="([^"]+)"', html)
        if singles != [singleday_url(route, d) for d in days]:
            err('%s: קישורי pday-go לא תואמים למקור' % rid)

        # 5. כל חלופה מופיעה כשורת חלופה, לא נטענת אוטומטית
        for sid in alts_all:
            if not re.search(r'<li class="pday-alt">.*?data-trip-add="%s"' % re.escape(sid), html, re.S):
                err('%s: החלופה %s לא מופיעה כשורת חלופה בעמוד' % (rid, sid))

        # 6. המונים הסטטיים שווים למחושבים מהמקור
        stops_total = sum(len(d['stops']) for d in route['days'])
        free_total = sum(1 for d in route['days'] for sid in d['stops']
                         if attractions.get(sid, {}).get('free'))
        for span_id, val in (('sync-stops-hero', stops_total), ('sync-stops', stops_total), ('sync-free', free_total)):
            m = re.search(r'id="%s">(\d+)<' % span_id, html)
            if not m:
                warn('%s: לא נמצא מונה %s בעמוד' % (rid, span_id))
            elif int(m.group(1)) != val:
                err('%s: המונה %s בעמוד הוא %s, מהמקור יוצא %s' % (rid, span_id, m.group(1), val))

        # 7. תגי SEO: כותרת, קנוני, ותיאורים על מספר הימים הנכון
        n_days = str(len(route['days']))
        title = re.search(r'<title>(.*?)</title>', html)
        if not title or title.group(1) != route['title']:
            err('%s: ה-title בעמוד שונה מהמקור' % rid)
        canonical = 'https://golondon.co.il' + route['url']
        if ('rel="canonical" href="%s"' % canonical) not in html:
            err('%s: הקנוני בעמוד אינו %s' % (rid, canonical))
        for tag in ('name="description"', 'property="og:description"', 'name="twitter:description"'):
            m = re.search(re.escape(tag) + r' content="([^"]+)"', html)
            if not m:
                err('%s: חסר תג %s' % (rid, tag))
                continue
            content = m.group(1)
            if ('-%s ' % n_days) not in content and ('%s ימים' % n_days) not in content:
                err('%s: התג %s לא מזכיר %s ימים' % (rid, tag, n_days))
            for other in routes:
                o = str(len(other['days']))
                if o != n_days and ('-%s ימים' % o) in content:
                    err('%s: התג %s מתאר מסלול של %s ימים' % (rid, tag, o))

        # 8. מפת האתר וכתובות נקיות
        if canonical not in sitemap:
            err('%s: הכתובת %s חסרה במפת האתר' % (rid, canonical))
        for other in routes:
            if ('href="%s"' % other['page']) in html:
                warn('%s: קישור אל %s משתמש ב-.html במקום ב-%s' % (rid, other['page'], other['url']))

    # 9. planner.html: מפת השמות נוצרה מהמקור, והקישורים נקיים
    phtml = read('planner.html')
    for r in routes:
        if ("'%s': '%s'" % (r['route_id'], r['name'])) not in phtml:
            err('planner.html: השם של %s חסר ב-ROUTE_NAMES' % r['route_id'])
    for page in ('planner.html', 'category.html'):
        html = read(page)
        for route in routes:
            if ('href="%s"' % route['page']) in html or ("'" + route['page'] + "'") in html:
                warn('%s: קישור אל %s משתמש ב-.html במקום ב-%s' % (page, route['page'], route['url']))


def main():
    routes = json.load(open('routes.json', encoding='utf-8'))['routes']

    changed = []
    for route in routes:
        if generate_page(route):
            changed.append(route['page'])
    if generate_planner(routes):
        changed.append('planner.html')

    if errors:
        for e in errors:
            print('שגיאה: ' + e)
        sys.exit(1)

    validate(routes)

    for w in warnings:
        print('אזהרה: ' + w)
    if errors:
        for e in errors:
            print('שגיאה: ' + e)
        sys.exit(1)

    if changed:
        print('נכתבו מחדש מהמקור: ' + ', '.join(changed))
    else:
        print('הכל כבר תואם למקור, לא נכתב דבר')
    print('כל הבדיקות עברו: %d מסלולים' % len(routes))


if __name__ == '__main__':
    main()
