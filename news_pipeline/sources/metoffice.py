# -*- coding: utf-8 -*-
"""
Met Office, אזהרות מזג אוויר ללונדון ודרום מזרח אנגליה (RSS).

נכון ל-20.10.2026 קובץ robots.txt של metoffice.gov.uk אוסר את /public/data/ לכל סוכן, וה-RSS
יושב בדיוק שם. שכבת הרשת מכבדת את האיסור, ולכן בריצה חיה המקור מדווח כחסום. המפענח נשאר
ונבדק על fixture, למקרה שתתקבל גישה מותרת (למשל Met Office Weather DataHub, שדורש רישום).
"""
import datetime, re, xml.etree.ElementTree as ET

from ..model import make_candidate
from .. import dates
from .util import text

URL = 'https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/se'
RE_VALID = re.compile(r'valid from (\d{4}) \w{3} (\d{1,2}) (\w{3}) to (\d{4}) \w{3} (\d{1,2}) (\w{3})', re.I)


def collect(fetcher, ctx):
    src = SOURCES[0]
    root = ET.fromstring(fetcher.get(URL, 'metoffice_se'))
    out = []
    for it in root.iter('item'):
        title = ' '.join((it.findtext('title') or '').split())
        desc = text(it.findtext('description') or '')
        link = (it.findtext('link') or '').strip()
        guid = (it.findtext('guid') or link).strip()
        m = RE_VALID.search(desc)
        vf = vt = None
        ev = {}
        if m:
            s = dates.infer_year(dates.MONTHS[m.group(3).lower()], int(m.group(2)), ctx['today'])
            e = dates.infer_year(dates.MONTHS[m.group(6).lower()], int(m.group(5)), ctx['today'])
            if s and e:
                vf, vt = s.isoformat(), e.isoformat()
                ev = {'valid_from': m.group(0), 'valid_to': m.group(0)}
        region = 'London & South East England'
        if region in title:
            ev['location'] = region
        out.append(make_candidate(
            src, ctx['today'], external_id=guid, item_url=link or src['url'], kind='weather_warning',
            title=title, summary=desc, entity='%s %s' % (title, vf or ''), source_text='%s. %s' % (title, desc),
            verified_at=ctx['verified_at'], valid_from=vf, valid_to=vt, evidence=ev,
            year_inferred=bool(m), location=region if region in title else None,
        ))
    return out


SOURCES = [dict(id='metoffice_se', name='Met Office, weather warnings for London & South East', url=URL,
                licence='Crown copyright', attribution='Contains Met Office data',
                terms='UNVERIFIED; robots.txt disallows /public/data/', group='practical', collect=collect)]
