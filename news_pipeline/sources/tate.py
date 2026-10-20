# -*- coding: utf-8 -*-
"""
Tate, עמוד What's On. robots.txt מתיר. אין נתונים מובנים, ולכן התאריכים מפוענחים מהטקסט
של הכרטיס, למשל `Until 3 Jan 2027` או טווח של שני תאריכים מלאים. מבנה ה-HTML עלול להשתנות:
אם לא נמצא אף כרטיס, המקור מדווח כתקלת פענוח ולא כ"אין חדש".
"""
import re

from ..model import make_candidate
from .. import dates
from ..fetch import SourceError
from .util import attr, first, text

URL = 'https://www.tate.org.uk/whats-on'
BASE = 'https://www.tate.org.uk'


def collect(fetcher, ctx):
    src = SOURCES[0]
    page = fetcher.get(URL, 'tate_whatson').decode('utf-8', 'replace')
    blocks = page.split('class="card__inner"')[1:]
    out, seen = [], set()
    for b in blocks:
        b = b[:6000]
        href = attr(first(r'(<a [^>]*href="[^"]+"[^>]*>)', b) or '', 'href')
        title = text(first(r'<span class="card__title--maintitle">(.*?)</span>', b) or '')
        if not href or not title or not href.startswith('/whats-on/') or href in seen:
            continue
        seen.add(href)
        tag = text(first(r'<div class="card-tags">(.*?)</div>', b) or '')
        desc = text(first(r'<div class="card__description">(.*?)</div>', b) or '')
        venue = text(first(r'event-info__venue">.*?<span>(.*?)</span>', b) or '') or None
        when = text(first(r'event-info__date">.*?<span>(.*?)</span>', b) or '')
        r = dates.parse_range(when, ctx['today'])
        ev = {}
        if r['valid_from']:
            ev['valid_from'] = r['evidence']
        if r['valid_to']:
            ev['valid_to'] = r['evidence']
        if venue:
            ev['location'] = venue
        out.append(make_candidate(
            src, ctx['today'], external_id=href, item_url=BASE + href,
            kind='exhibition' if tag.lower() in ('exhibition', 'display') else 'event',
            title=title, summary=desc, entity='%s, %s' % (title, venue or 'Tate'),
            source_text='%s. %s. %s. %s. %s' % (title, tag, desc, venue or '', when),
            verified_at=ctx['verified_at'], valid_from=r['valid_from'], valid_to=r['valid_to'],
            location=venue, evidence=ev, year_inferred=r['year_inferred'],
            flags={'date_text': when, 'date_kind': r['kind'], 'listing_type': tag.lower()},
        ))
    if not out:
        raise SourceError('parse_error', 'no Tate cards found; page structure may have changed')
    return out


SOURCES = [dict(id='tate_whatson', name="Tate, What's On", url=URL, licence='© Tate',
                attribution='Source: tate.org.uk', terms='facts only with link; no copying of descriptions or images',
                group='positive', collect=collect)]
