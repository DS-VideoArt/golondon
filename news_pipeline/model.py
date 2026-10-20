# -*- coding: utf-8 -*-
"""
מודל הנתונים של מועמד. כל מתאם מקור מחזיר רשימת מועמדים במבנה הזה בדיוק.

שדות:
  fingerprint        מזהה יציב: מקור + מזהה הפריט במקור. אותו פריט בריצה הבאה מקבל אותו fingerprint
  source_id          המתאם שאסף, למשל tate_whatson
  source_name        שם המקור הרשמי
  source_url         הכתובת שממנה נקרא המידע בפועל
  item_url           עמוד הפריט עצמו אצל המקור, לקישור ולייחוס
  licence, attribution  תנאי שימוש וייחוס נדרש, כפי שידועים לנו
  kind               אחד מ-config.KINDS
  title, summary     בשפת המקור, כפי שנכתבו שם. אין כאן תרגום או ניסוח מחדש
  entity             הנושא שמזהה כפילויות, באותו מובן כמו ב-whats_new_dedup
  source_text        הטקסט המלא שממנו נגזרו כל העובדות. בדיקת העובדות נשענת עליו בלבד
  published_at       מתי המקור פרסם, אם המקור כותב זאת
  updated_at         מתי המקור עדכן, אם המקור כותב זאת
  verified_at        מתי קראנו את המקור (UTC). זה תאריך האימות
  valid_from, valid_to  התוקף לפי המקור, YYYY-MM-DD או None. לא משלימים תאריך חסר
  status             scheduled, active, cancelled, postponed, ended, unknown
  location           מיקום כפי שמופיע במקור, או None
  evidence           לכל שדה עובדתי, הקטע המדויק מתוך source_text שממנו נלקח
  year_inferred      True כשהשנה לא כתובה במקור והוסקה מתאריך הריצה
  flags              live_transient (מצב חי שמתיישן מהר), source_updated (המקור מסמן עדכון), free
"""
import datetime, hashlib, re

from . import config

STATUSES = ('scheduled', 'active', 'cancelled', 'postponed', 'ended', 'unknown')
REQUIRED = ('source_id', 'source_name', 'external_id', 'item_url', 'kind', 'title', 'source_text', 'verified_at')


def fingerprint(source_id, external_id):
    return '%s:%s' % (source_id, hashlib.sha1(str(external_id).encode('utf-8')).hexdigest()[:12])


def _iso_date(v):
    if v is None:
        return None
    datetime.date.fromisoformat(v)
    return v


def detect_cancel(text):
    for pat, status in config.CANCEL_PATTERNS:
        m = re.search(pat, text or '', re.I)
        if m:
            return status, m.group(0)
    return None, None


def status_from_dates(valid_from, valid_to, today):
    if valid_to and datetime.date.fromisoformat(valid_to) < today:
        return 'ended'
    if valid_from and datetime.date.fromisoformat(valid_from) > today:
        return 'scheduled'
    if valid_from or valid_to:
        return 'active'
    return 'unknown'


def make_candidate(source, today, **kw):
    """source הוא מילון המקור מ-sources. זורק ValueError אם חסר שדה חובה או שערך לא תקין."""
    c = {
        'source_id': source['id'],
        'source_name': source['name'],
        'source_url': kw.pop('source_url', source.get('url')),
        'licence': source.get('licence'),
        'attribution': source.get('attribution'),
        'external_id': None, 'item_url': None, 'kind': None,
        'title': None, 'summary': '', 'entity': None, 'source_text': None,
        'published_at': None, 'updated_at': None, 'verified_at': None,
        'valid_from': None, 'valid_to': None, 'status': None, 'location': None,
        'evidence': {}, 'year_inferred': False, 'flags': {},
    }
    unknown = set(kw) - set(c)
    if unknown:
        raise ValueError('unknown fields: %s' % sorted(unknown))
    c.update(kw)
    missing = [k for k in REQUIRED if not c.get(k)]
    if missing:
        raise ValueError('missing required fields: %s' % missing)
    if c['kind'] not in config.KINDS:
        raise ValueError('unknown kind %r' % c['kind'])
    _iso_date(c['valid_from'])
    _iso_date(c['valid_to'])

    cancel, ev = detect_cancel(' '.join([c['title'], c['summary'] or '']))
    if cancel:
        c['status'] = cancel
        c['evidence']['status'] = ev
    elif not c['status']:
        c['status'] = status_from_dates(c['valid_from'], c['valid_to'], today)
    if c['status'] not in STATUSES:
        raise ValueError('unknown status %r' % c['status'])

    c['entity'] = c['entity'] or c['title']
    c['fingerprint'] = fingerprint(c['source_id'], c['external_id'])
    c['sources'] = [{'name': c['source_name'], 'url': c['item_url']}]
    c['category'] = config.KINDS[c['kind']]['category']
    c['group'] = config.KINDS[c['kind']]['group']
    return c
