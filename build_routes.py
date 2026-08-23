#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
מאמת המסלולים המוכנים.

routes.json הוא מקור האמת: זהות, סדר ימים, עצירות חובה וחלופות.
הסקריפט בודק שכל עמוד מסלול באתר תואם למקור, ושכל מזהה קיים
ב-planner-data.json עם נתונים מלאים. הוא לא כותב לעמודים, רק מתריע,
כדי שאי התאמה תיתפס לפני פריסה ולא אצל הקוראים.

עמוד מסלול עתידי (למשל 7 ימים) נבנה מהקובץ הזה: הכתובת למתכנן,
כפתורי הימים, המונים והתיאורים נגזרים ממנו, ואז הסקריפט מאמת אותם.
"""
import json
import re
import sys

ROOT = '.'
errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def planner_url(route):
    parts = ['day=' + ','.join(d['stops']) for d in sorted(route['days'], key=lambda d: d['day_position'])]
    parts.append('from=' + route['route_id'])
    parts.append('route=' + route['route_id'])
    parts.append('rv=' + str(route['route_version']))
    return 'planner.html?' + '&amp;'.join(parts)


def main():
    routes = json.load(open('routes.json', encoding='utf-8'))['routes']
    data = json.load(open('planner-data.json', encoding='utf-8'))
    attractions = {a['id']: a for a in data['attractions']}

    sitemap = read('sitemap.xml')

    for route in routes:
        rid = route['route_id']
        page = route['page']
        html = read(page)

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

        # 2. סדר הימים רציף ומתחיל מ-1
        positions = sorted(d['day_position'] for d in route['days'])
        if positions != list(range(1, len(positions) + 1)):
            err('%s: day_position לא רציף: %s' % (rid, positions))

        # 3. הכתובת הראשית בעמוד תואמת למקור, כולל route ו-rv
        url = planner_url(route)
        if url not in html:
            err('%s: הכתובת הראשית למתכנן בעמוד לא תואמת ל-routes.json:\n  צפוי: %s' % (rid, url))

        # 4. כפתור של כל יום טוען בדיוק את עצירות החובה שלו
        buttons = re.findall(r'data-pday-add="([^"]+)"', html)
        expected = [','.join(d['stops']) for d in sorted(route['days'], key=lambda d: d['day_position'])]
        if buttons != expected:
            err('%s: כפתורי data-pday-add לא תואמים לימים במקור\n  בעמוד: %s\n  צפוי:  %s' % (rid, buttons, expected))

        # 5. כל חלופה מופיעה בעמוד כשורת חלופה, ואף חלופה לא נטענת אוטומטית
        alt_ids = [sid for d in route['days'] for sid in d['alternatives']]
        for sid in alt_ids:
            row = re.search(r'<li class="pday-alt">.*?data-trip-add="%s"' % re.escape(sid), html, re.S)
            if not row:
                err('%s: החלופה %s לא מופיעה כשורת חלופה בעמוד' % (rid, sid))
        for day in route['days']:
            for sid in day['alternatives']:
                if sid in day['stops']:
                    err('%s: %s גם חובה וגם חלופה באותו יום' % (rid, sid))

        # 6. המונים הסטטיים בעמוד שווים למחושבים מהמקור
        stops_total = sum(len(d['stops']) for d in route['days'])
        free_total = sum(1 for d in route['days'] for sid in d['stops']
                         if attractions.get(sid, {}).get('free'))
        for span_id, val in (('sync-stops-hero', stops_total), ('sync-stops', stops_total), ('sync-free', free_total)):
            m = re.search(r'id="%s">(\d+)<' % span_id, html)
            if not m:
                warn('%s: לא נמצא מונה %s בעמוד' % (rid, span_id))
            elif int(m.group(1)) != val:
                err('%s: המונה %s בעמוד הוא %s, מהמקור יוצא %s' % (rid, span_id, m.group(1), val))

        # 7. תגי SEO: כותרת, קנוני, ותיאורים שמדברים על מספר הימים הנכון
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
                err('%s: התג %s לא מזכיר %s ימים: %s' % (rid, tag, n_days, content[:60]))
            for other in routes:
                o = str(len(other['days']))
                if o != n_days and ('-%s ימים' % o) in content:
                    err('%s: התג %s מתאר מסלול של %s ימים' % (rid, tag, o))

        # 8. העמוד נמצא במפת האתר בכתובת הנקייה
        if canonical not in sitemap:
            err('%s: הכתובת %s חסרה במפת האתר' % (rid, canonical))

        # 9. קישורים פנימיים לעמודי מסלול משתמשים בכתובת הנקייה, לא ב-.html
        for other in routes:
            if ('href="%s"' % other['page']) in html:
                warn('%s: קישור אל %s משתמש ב-.html במקום ב-%s' % (rid, other['page'], other['url']))

    # 10. גם המתכנן ועמוד הקטגוריה מקשרים בכתובת הנקייה
    for page in ('planner.html', 'category.html'):
        html = read(page)
        for route in routes:
            if ('href="%s"' % route['page']) in html or ("'" + route['page'] + "'") in html:
                warn('%s: קישור אל %s משתמש ב-.html במקום ב-%s' % (page, route['page'], route['url']))

    for w in warnings:
        print('אזהרה: ' + w)
    if errors:
        for e in errors:
            print('שגיאה: ' + e)
        sys.exit(1)
    print('כל הבדיקות עברו: %d מסלולים תואמים למקור' % len(routes))


if __name__ == '__main__':
    main()
