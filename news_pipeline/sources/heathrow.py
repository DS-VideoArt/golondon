# -*- coding: utf-8 -*-
"""
Heathrow Media Centre, הודעות לעיתונות. robots.txt מתיר. אין RSS (‎/rss‎ מחזיר 404), ולכן
נקרא רק עמוד הרשימה: כותרת, קישור ותאריך פרסום. גוף ההודעה לא נקרא בשלב 0, ולכן כל עובדה
מעבר לכותרת דורשת קריאה של אדם או של השלב הבא.
"""
import datetime, re

from ..model import make_candidate
from .. import dates
from .util import attr, first, text

URL = 'https://mediacentre.heathrow.com/'
RECENT_DAYS = 30


def collect(fetcher, ctx):
    src = SOURCES[0]
    page = fetcher.get(URL, 'heathrow_media').decode('utf-8', 'replace')
    out, seen = [], set()
    for a in re.findall(r'(<a class="content-listing-card[^"]*"[^>]*>.*?</a>)', page, re.S):
        href = attr(a, 'href')
        title = text(first(r'<h2 class="description[^"]*">(.*?)</h2>', a) or '')
        dt = attr(first(r'(<time [^>]*>)', a) or '', 'datetime')
        if not href or not title or '/pressrelease/' not in href or href in seen:
            continue  # כרטיסי ניווט כמו Image Library או Investor centre אינם הודעות
        seen.add(href)
        pub = None
        ev = {}
        if dt:
            r = dates.parse_range(dt, ctx['today'])
            if r['kind'] == 'single' and not r['year_inferred']:
                pub = r['valid_from']
                ev['published_at'] = 'datetime="%s"' % dt
        if pub and (ctx['today'] - datetime.date.fromisoformat(pub)).days > RECENT_DAYS:
            continue
        out.append(make_candidate(
            src, ctx['today'], external_id=href, item_url=href, kind='airport_news',
            title=title, summary='', entity=title,
            source_text='%s. datetime="%s"' % (title, dt or ''), published_at=pub,
            verified_at=ctx['verified_at'], status='active', evidence=ev,
            flags={'body_not_read': True},
        ))
    return out


SOURCES = [dict(id='heathrow_media', name='Heathrow Media Centre, press releases', url=URL,
                licence='© Heathrow Airport Limited, press material', attribution='Source: mediacentre.heathrow.com',
                terms='press releases intended for publication; facts with link', group='practical', collect=collect)]
