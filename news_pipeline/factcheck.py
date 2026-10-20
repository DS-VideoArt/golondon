# -*- coding: utf-8 -*-
"""
בדיקת עובדות לפי כללים, בלי מודל שפה.

שני סוגי בדיקה:
  verify_candidate  כל שדה עובדתי במועמד (תאריכים, מיקום, סטטוס) חייב evidence, והקטע הזה
                    חייב להופיע מילה במילה בטקסט המקור, ולהתאים לערך שנשמר.
  verify_text       כל תאריך, מחיר, שעה ומספר בטקסט כלשהו, למשל ניסוח עברי שייכתב בשלב הבא,
                    חייב להופיע גם בטקסט המקור. מה שלא נמצא מוחזר כ-unsupported.

מספר שלא נמצא במקור אינו "כנראה נכון". הוא נכשל, והטיוטה לא עוברת.
"""
import datetime, re

from . import dates

RE_MONEY = re.compile(r'£\s?(\d+(?:[.,]\d{1,2})?)')
RE_TIME_AMPM = re.compile(r'\b(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm)\b', re.I)
RE_TIME_24 = re.compile(r'\b([01]?\d|2[0-3]):([0-5]\d)\b')
RE_NUMBER = re.compile(r'(?<![\w.,£:])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\w:])')
RE_ISO = re.compile(r'\b(\d{4})-(\d{2})-(\d{2})')


def _ws(s):
    return ' '.join((s or '').split())


def claims(text):
    """מחזיר רשימת טענות: (type, raw, value). מספרים שהם חלק מתאריך או משעה לא נספרים פעמיים."""
    t = _ws(text)
    out, used = [], []

    def take(span):
        used.append(span)

    def free(span):
        return not any(a < span[1] and span[0] < b for a, b in used)

    for m in RE_ISO.finditer(t):
        out.append(('date', m.group(0), (int(m.group(2)), int(m.group(3)), int(m.group(1)))))
        take(m.span())
    for raw, mon, day, year in dates.date_mentions(t):
        i = t.find(raw)
        out.append(('date', raw, (mon, day, year)))
        if i >= 0:
            take((i, i + len(raw)))
    for m in RE_MONEY.finditer(t):
        out.append(('money', m.group(0), m.group(1).replace(',', '.')))
        take(m.span())
    for m in RE_TIME_AMPM.finditer(t):
        if not free(m.span()):
            continue
        h = int(m.group(1)) % 12 + (12 if m.group(3).lower() == 'pm' else 0)
        out.append(('time', m.group(0), '%02d:%s' % (h, m.group(2) or '00')))
        take(m.span())
    for m in RE_TIME_24.finditer(t):
        if not free(m.span()):
            continue
        out.append(('time', m.group(0), '%02d:%s' % (int(m.group(1)), m.group(2))))
        take(m.span())
    for m in RE_NUMBER.finditer(t):
        if not free(m.span()):
            continue
        out.append(('number', m.group(0), m.group(0).replace(',', '')))
    return out


def _date_supported(val, src_dates):
    mon, day, year = val
    for smon, sday, syear in src_dates:
        if (smon, sday) == (mon, day) and (year is None or syear is None or year == syear):
            return True
    return False


def verify_text(text, source_text):
    src = claims(source_text)
    src_dates = [v for k, _, v in src if k == 'date']
    # מספר בטקסט יכול להיתמך גם ככל רכיב מספרי במקור, כולל ימים ושנים מתוך תאריכים
    src_numbers = {v for k, _, v in src if k in ('number', 'money')}
    for k, _, v in src:
        if k == 'date':
            src_numbers.update({str(v[1])} | ({str(v[2])} if v[2] else set()))
        if k == 'time':
            src_numbers.add(v.split(':')[0].lstrip('0') or '0')
    src_times = {v for k, _, v in src if k == 'time'}
    src_money = {v for k, _, v in src if k == 'money'}

    checked, unsupported = [], []
    for k, raw, v in claims(text):
        if k == 'date':
            ok = _date_supported(v, src_dates)
        elif k == 'money':
            ok = v in src_money
        elif k == 'time':
            ok = v in src_times
        else:
            ok = v in src_numbers
        (checked if ok else unsupported).append({'type': k, 'text': raw})
    return {'passed': not unsupported, 'checked': checked, 'unsupported': unsupported}


def verify_candidate(c):
    """כל שדה עובדתי חייב evidence שמופיע במקור ומתאים לערך."""
    src = _ws(c.get('source_text'))
    problems, checked = [], []
    for field in ('valid_from', 'valid_to', 'location', 'status', 'published_at', 'updated_at'):
        val = c.get(field)
        if field == 'status':
            if val not in ('cancelled', 'postponed'):
                continue  # סטטוס שנגזר מתאריכים נבדק דרך התאריכים עצמם
        if not val:
            continue
        ev = (c.get('evidence') or {}).get(field)
        if field in ('published_at', 'updated_at') and not ev:
            continue  # תאריך פרסום שמגיע ממטא-דאטה של המקור אינו טענה שתוצג כעובדה
        if not ev:
            problems.append('%s=%s ללא evidence' % (field, val))
            continue
        if _ws(ev) not in src:
            problems.append('%s: הקטע "%s" לא נמצא בטקסט המקור' % (field, ev))
            continue
        if field in ('valid_from', 'valid_to'):
            d = datetime.date.fromisoformat(val[:10])
            iso_ok = val[:10] in ev or d.strftime('%Y-%m-%d') in ev
            ment = [(mon, day) for _, mon, day, _ in dates.date_mentions(ev)]
            if not iso_ok and (d.month, d.day) not in ment and not _structured_ok(ev, d):
                problems.append('%s=%s לא תואם לקטע "%s"' % (field, val, ev))
                continue
        checked.append(field)
    t = verify_text(' '.join([c.get('title') or '', c.get('summary') or '']), c.get('source_text'))
    if not t['passed']:
        problems.extend('בכותרת או בתקציר: "%s" לא נמצא במקור' % u['text'] for u in t['unsupported'])
    return {'passed': not problems, 'checked_fields': checked, 'problems': problems}


def _structured_ok(ev, d):
    """fromDate=2026-10-25T04:30:00Z שמתורגם ליום מקומי בלונדון יכול לזוז ביום אחד."""
    m = RE_ISO.search(ev)
    if not m:
        return False
    e = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return abs((e - d).days) <= 1
