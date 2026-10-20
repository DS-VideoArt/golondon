# -*- coding: utf-8 -*-
"""
GOV.UK. רישיון Open Government Licence v3.0.

1. מעקב שינויים בעמודי כניסה לבריטניה (Content API): מועמד נוצר רק כשהעמוד עודכן בתוך
   חלון ה-LOOKAHEAD ולא ראינו את העדכון הזה קודם. מה שהשתנה בפועל נלקח מ-change_history
   כשקיים. אם אין תיאור שינוי, לא מנחשים: הטיוטה מסומנת לבדיקת אדם.
2. ימי חג רשמיים (bank-holidays.json): חג באנגליה בתוך 30 יום.
3. הודעות ממשלתיות על ETA (Atom של החיפוש).
"""
import datetime, json, re, xml.etree.ElementTree as ET

from ..model import make_candidate
from .. import config
from .util import parse_utc, text

COMMON = {'licence': 'Open Government Licence v3.0', 'attribution': 'Contains public sector information licensed under the Open Government Licence v3.0',
          'terms': 'OGL v3.0, free reuse with attribution'}

WATCH = [
    ('/eta', 'govuk_content_eta'),
    ('/standard-visitor', 'govuk_content_standard_visitor'),
    ('/bringing-goods-into-uk-personal-use', 'govuk_content_bringing_goods'),
]
BANK_URL = 'https://www.gov.uk/bank-holidays.json'
ATOM_URL = 'https://www.gov.uk/search/news-and-communications.atom?keywords=electronic+travel+authorisation'
ATOM_NS = {'a': 'http://www.w3.org/2005/Atom'}
HOLIDAY_DAYS = 30
RE_ENTRY = re.compile(r'\b(ETA|electronic travel authori[sz]ation|visit visa|visitor visa|visitors? to the UK|'
                      r'border|e-?gates?|entry requirements?)\b', re.I)


def collect_watch(fetcher, ctx):
    src = SOURCES[0]
    seen = ctx['state'].setdefault('govuk_watch', {})
    since = ctx['now'] - datetime.timedelta(days=config.LOOKAHEAD_DAYS)
    out = []
    for path, key in WATCH:
        url = 'https://www.gov.uk/api/content' + path
        d = json.loads(fetcher.get(url, key))
        pu = d.get('public_updated_at')
        prev = seen.get(path)
        seen[path] = pu
        if not pu or parse_utc(pu) < since or pu == prev:
            continue
        changes = (d.get('details') or {}).get('change_history') or []
        note = ''
        if changes:
            last = sorted(changes, key=lambda c: c.get('public_timestamp', ''))[-1]
            note = ' '.join((last.get('note') or '').split())
        title = d.get('title') or path
        out.append(make_candidate(
            src, ctx['today'], source_url=url,
            external_id='%s|%s' % (path, pu), item_url='https://www.gov.uk' + path,
            kind='entry_rules', title='GOV.UK updated: %s' % title,
            summary=note or (d.get('description') or ''),
            entity='GOV.UK %s update %s' % (title, pu[:10]),
            source_text='%s. %s. public_updated_at=%s. %s' % (title, d.get('description') or '', pu, note),
            published_at=pu, updated_at=pu, verified_at=ctx['verified_at'],
            evidence={'updated_at': 'public_updated_at=%s' % pu},
            status='active',
            flags={'source_updated': True, 'change_note': bool(note)},
        ))
    return out


def collect_bank_holidays(fetcher, ctx):
    src = SOURCES[1]
    d = json.loads(fetcher.get(BANK_URL, 'govuk_bank_holidays'))
    out = []
    for e in d.get('england-and-wales', {}).get('events', []):
        day = datetime.date.fromisoformat(e['date'])
        delta = (day - ctx['today']).days
        if not 1 <= delta <= HOLIDAY_DAYS:
            continue
        line = '%s %s %s' % (e['title'], e['date'], e.get('notes') or '')
        out.append(make_candidate(
            src, ctx['today'], external_id='bank-holiday|%s' % e['date'],
            item_url='https://www.gov.uk/bank-holidays', kind='public_holiday',
            title='Bank holiday in England: %s' % e['title'], summary=line.strip(),
            entity='Bank holiday %s' % e['date'], source_text=line,
            verified_at=ctx['verified_at'], valid_from=e['date'], valid_to=e['date'],
            evidence={'valid_from': e['date'], 'valid_to': e['date']},
        ))
    return out


def collect_eta_news(fetcher, ctx):
    src = SOURCES[2]
    root = ET.fromstring(fetcher.get(ATOM_URL, 'govuk_eta_news'))
    since = ctx['now'] - datetime.timedelta(days=config.LOOKAHEAD_DAYS)
    out = []
    for e in root.findall('a:entry', ATOM_NS):
        upd = e.findtext('a:updated', default='', namespaces=ATOM_NS)
        if not upd or parse_utc(upd) < since:
            continue
        link = e.find('a:link', ATOM_NS)
        href = link.get('href') if link is not None else None
        title = ' '.join((e.findtext('a:title', default='', namespaces=ATOM_NS)).split())
        summ = text(e.findtext('a:summary', default='', namespaces=ATOM_NS))
        if not href or not title:
            continue
        if not RE_ENTRY.search('%s %s' % (title, summ)):
            ctx.setdefault('filtered', {}).setdefault(src['id'], []).append(title)
            continue  # חיפוש מילות המפתח של GOV.UK מחזיר גם הודעות שאינן על כניסה לבריטניה
        out.append(make_candidate(
            src, ctx['today'], external_id=e.findtext('a:id', default=href, namespaces=ATOM_NS),
            item_url=href, kind='entry_rules', title=title, summary=summ, entity=title,
            source_text='%s. %s. updated=%s' % (title, summ, upd),
            published_at=upd, verified_at=ctx['verified_at'],
            evidence={'published_at': 'updated=%s' % upd}, status='active',
        ))
    return out


SOURCES = [
    dict(COMMON, id='govuk_watch', name='GOV.UK, visitor entry pages', url='https://www.gov.uk/api/content/{path}',
         group='practical', collect=collect_watch),
    dict(COMMON, id='govuk_bank_holidays', name='GOV.UK, bank holidays', url=BANK_URL,
         group='practical', collect=collect_bank_holidays),
    dict(COMMON, id='govuk_eta_news', name='GOV.UK, news about ETA', url=ATOM_URL,
         group='practical', collect=collect_eta_news),
]
