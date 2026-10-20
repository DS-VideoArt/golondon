# -*- coding: utf-8 -*-
"""
The Royal Parks, עמוד What's On. robots.txt מתיר. רק כרטיסים שיש בהם שורת תאריך נחשבים
לאירוע. כרטיסי תוכן כלליים בלי תאריך מדולגים. השנה כמעט אף פעם לא כתובה, ולכן היא מוסקת
ומסומנת year_inferred.
"""
import re

from ..model import make_candidate
from .. import dates
from ..fetch import SourceError
from .util import attr, first, text

URL = 'https://www.royalparks.org.uk/whats-on'
BASE = 'https://www.royalparks.org.uk'


def collect(fetcher, ctx):
    src = SOURCES[0]
    page = fetcher.get(URL, 'royalparks_whatson').decode('utf-8', 'replace')
    blocks = page.split('class="m-card__content')[1:]
    if not blocks:
        raise SourceError('parse_error', 'no Royal Parks cards found; page structure may have changed')
    out, seen = [], set()
    for b in blocks:
        b = b[:5000]
        link = first(r'(<a class="m-card__link[^"]*"[^>]*>.*?</a>)', b)
        if not link:
            continue
        href = attr(link, 'href')
        title = text(link)
        when = text(first(r'class="m-card__meta[^"]*">(.*?)</', b) or '')
        desc = text(first(r'class="m-card__description[^"]*">(.*?)</p>', b) or '')
        if not href or not title or not when or href in seen:
            continue
        seen.add(href)
        r = dates.parse_range(when, ctx['today'])
        ev = {}
        if r['valid_from']:
            ev['valid_from'] = r['evidence']
        if r['valid_to']:
            ev['valid_to'] = r['evidence']
        url = href if href.startswith('http') else BASE + href
        out.append(make_candidate(
            src, ctx['today'], external_id=href, item_url=url, kind='event',
            title=title, summary=desc, entity='%s, Royal Parks' % title,
            source_text='%s. %s. %s' % (title, when, desc), verified_at=ctx['verified_at'],
            valid_from=r['valid_from'], valid_to=r['valid_to'], evidence=ev,
            year_inferred=r['year_inferred'], flags={'date_text': when, 'date_kind': r['kind']},
        ))
    return out


SOURCES = [dict(id='royalparks_whatson', name="The Royal Parks, What's On", url=URL, licence='© The Royal Parks',
                attribution='Source: royalparks.org.uk', terms='facts only with link; no copying of descriptions or images',
                group='positive', collect=collect)]
