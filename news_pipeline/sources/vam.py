# -*- coding: utf-8 -*-
"""
V&A, עמוד What's On. robots.txt מתיר. כל כרטיס נושא microdata של schema.org/Event עם
startDate ו-endDate בפורמט ISO, ולכן התאריכים כאן מובנים ולא מוסקים מטקסט חופשי.
שדה המיקום שב-microdata כתוב תמיד כ-South Kensington גם לסניפים אחרים, ולכן המיקום נלקח
מהמאפיין data-wo-venue של הכרטיס.
"""
import html as _h, re

from ..model import make_candidate
from .util import attr, first, text

URL = 'https://www.vam.ac.uk/whatson'
BASE = 'https://www.vam.ac.uk'
VENUES = {
    'south-kensington': 'V&A South Kensington',
    'east-storehouse': 'V&A East Storehouse, Hackney Wick',
    'east-museum': 'V&A East Museum, Queen Elizabeth Olympic Park',
    'young-v-and-a': 'Young V&A, Bethnal Green',
}
EXHIBITION_TYPES = ('exhibition', 'display')


def _meta(block, prop):
    m = re.search(r'<meta itemprop="%s" content="([^"]*)"' % prop, block)
    return m.group(1) if m else None


def collect(fetcher, ctx):
    src = SOURCES[0]
    page = fetcher.get(URL, 'vam_whatson').decode('utf-8', 'replace')
    out, seen = [], set()
    for block in re.findall(r'(<li class="b-event-teaser\b.*?</li>)', page, re.S):
        href = attr(first(r'(<a class="b-event-teaser__link"[^>]*>)', block) or '', 'href')
        name = _meta(block, 'name')
        if not href or not name or href in seen:
            continue
        seen.add(href)
        name = _h.unescape(name).strip()
        start, end = _meta(block, 'startDate'), _meta(block, 'endDate')
        desc = ' '.join(_h.unescape(_meta(block, 'description') or '').split())
        wtype = (attr(block, 'data-wo-type') or '').lower()
        venue_slug = attr(block, 'data-wo-venue') or ''
        venue = VENUES.get(venue_slug, venue_slug or None)
        free = attr(block, 'data-wo-free') == 'true'
        label = text(first(r'<div class="b-event-teaser__type">(.*?)</div>', block) or '')
        ev = {}
        stext = '%s. %s. %s. startDate=%s endDate=%s venue=%s free=%s' % (
            name, label, desc, start, end, venue_slug, 'true' if free else 'false')
        if start:
            ev['valid_from'] = 'startDate=%s' % start
        if end:
            ev['valid_to'] = 'endDate=%s' % end
        if venue_slug:
            ev['location'] = 'venue=%s' % venue_slug
        out.append(make_candidate(
            src, ctx['today'], external_id=href, item_url=BASE + href,
            kind='exhibition' if wtype in EXHIBITION_TYPES else 'event',
            title=name, summary=desc, entity='%s, %s' % (name, venue or 'V&A'),
            source_text=stext, verified_at=ctx['verified_at'],
            valid_from=start[:10] if start else None, valid_to=end[:10] if end else None,
            location=venue, evidence=ev, flags={'free': free, 'listing_type': wtype},
        ))
    return out


SOURCES = [dict(id='vam_whatson', name="V&A, What's On", url=URL, licence='© Victoria and Albert Museum',
                attribution='Source: vam.ac.uk', terms='facts only with link; no copying of descriptions or images',
                group='positive', collect=collect)]
