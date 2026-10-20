# -*- coding: utf-8 -*-
"""
TfL Unified API. JSON רשמי, עובד בלי מפתח בקצב נמוך. רישום מומלץ למפתח לפני הפעלה קבועה.
ייחוס חובה: "Powered by TfL Open Data". אסור להציג סטטוס חי מיושן, ולכן סטטוס חי נאסף רק כהקשר
ונפסל תמיד, ורק עבודות מתוכננות (category=PlannedWork) הופכות למועמדים.
"""
import datetime, hashlib, json

from ..model import make_candidate
from .. import config
from .util import parse_utc, london_date, iso_utc

LINE_MODES = 'tube,elizabeth-line,overground,dlr'
LIVE_URL = 'https://api.tfl.gov.uk/Line/Mode/%s/Status' % LINE_MODES
STATUS_PAGE = 'https://tfl.gov.uk/tube-dlr-overground/status/'
DEFAULT_LINE_IDS = ['bakerloo', 'central', 'circle', 'district', 'hammersmith-city', 'jubilee',
                    'metropolitan', 'northern', 'piccadilly', 'victoria', 'waterloo-city',
                    'elizabeth', 'dlr', 'liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush']
GOOD_SERVICE = 10

COMMON = {
    'licence': 'TfL Open Data (Transport Data Service terms)',
    'attribution': 'Powered by TfL Open Data',
    'terms': 'anonymous access allowed at low rate; registration for an app key recommended before scheduled use',
}


def _status_candidates(source, data, today, verified, want_category):
    out, seen = [], set()
    for line in data:
        for st in line.get('lineStatuses', []):
            if st.get('statusSeverity') == GOOD_SERVICE:
                continue
            cat = (st.get('disruption') or {}).get('category') or ''
            if want_category == 'PlannedWork' and cat != 'PlannedWork':
                continue
            if want_category == 'RealTime' and cat == 'PlannedWork':
                continue
            reason = ' '.join((st.get('reason') or '').split())
            key = (line['id'], hashlib.sha1(reason.encode('utf-8')).hexdigest()[:10])
            if key in seen or not reason:
                continue
            seen.add(key)
            periods = [(parse_utc(v['fromDate']), parse_utc(v['toDate'])) for v in st.get('validityPeriods', [])
                       if v.get('fromDate') and v.get('toDate')]
            vf = vt = None
            ev = {}
            ptxt = ''
            if periods:
                start = min(p[0] for p in periods)
                end = max(p[1] for p in periods)
                vf, vt = london_date(start).isoformat(), london_date(end).isoformat()
                ptxt = 'validityPeriods fromDate=%s toDate=%s' % (iso_utc(start), iso_utc(end))
                ev = {'valid_from': 'fromDate=%s' % iso_utc(start), 'valid_to': 'toDate=%s' % iso_utc(end)}
            sev = st.get('statusSeverityDescription', '')
            # הכותרת בלי תאריכים: התאריכים בשדות התוקף, וכל פריט מזוהה לפי fingerprint ולא לפי כותרת
            title = '%s: %s' % (line.get('name', line['id']), sev)
            if line.get('name'):
                ev['location'] = line['name']
            kind = 'disruption_planned' if want_category == 'PlannedWork' else 'disruption_live'
            out.append(make_candidate(
                source, today,
                external_id='%s|%s|%s' % (line['id'], key[1], vf),
                item_url=STATUS_PAGE, kind=kind, title=title, summary=reason,
                entity='%s %s %s' % (line.get('name', line['id']), sev, vf or ''),
                source_text='%s %s. %s %s' % (line.get('name', ''), sev, reason, ptxt),
                published_at=st.get('created') or None, verified_at=verified,
                valid_from=vf, valid_to=vt, location=line.get('name'), evidence=ev,
                status='scheduled' if vf and vf > today.isoformat() else 'active',
                flags={'live_transient': kind == 'disruption_live', 'line_id': line['id'],
                       'severity': st.get('statusSeverity')},
            ))
    return out


def collect_live(fetcher, ctx):
    data = json.loads(fetcher.get(LIVE_URL, 'tfl_live'))
    ctx['tfl_line_ids'] = [l['id'] for l in data if l.get('id')]
    return _status_candidates(SOURCES[0], data, ctx['today'], ctx['verified_at'], 'RealTime')


def planned_url(line_ids, today):
    # מתחילים מחר ב-05:00 כדי שתקלה חיה של הלילה לא תיכנס כ"מתוכננת"
    start = today + datetime.timedelta(days=1)
    end = today + datetime.timedelta(days=config.LOOKAHEAD_DAYS)
    return 'https://api.tfl.gov.uk/Line/%s/Status/%sT05:00:00/to/%sT23:59:59' % (
        ','.join(line_ids), start.isoformat(), end.isoformat())


def collect_planned(fetcher, ctx):
    ids = ctx.get('tfl_line_ids') or DEFAULT_LINE_IDS
    url = planned_url(ids, ctx['today'])
    data = json.loads(fetcher.get(url, 'tfl_planned'))
    out = _status_candidates(SOURCES[1], data, ctx['today'], ctx['verified_at'], 'PlannedWork')
    for c in out:
        c['source_url'] = url
    return out


SOURCES = [
    dict(COMMON, id='tfl_live', name='Transport for London, live line status', url=LIVE_URL,
         group='practical', collect=collect_live,
         note='context only: live status goes stale within minutes and is always rejected'),
    dict(COMMON, id='tfl_planned', name='Transport for London, planned works', url='https://api.tfl.gov.uk/Line/{ids}/Status/{from}/to/{to}',
         group='practical', collect=collect_planned),
]
