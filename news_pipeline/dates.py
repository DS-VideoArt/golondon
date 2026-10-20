# -*- coding: utf-8 -*-
"""
פענוח תאריכים מטקסט המקור. כל תאריך מוחזר יחד עם הקטע המדויק שממנו נלקח (evidence).

כשהמקור לא כותב שנה, השנה מוסקת מתאריך הריצה ומסומנת year_inferred. אין כאן השלמה של
תאריך שלא קיים בטקסט: אם אין יום וחודש, אין תאריך.
"""
import datetime, re

MONTHS = {}
for i, names in enumerate([('jan', 'january'), ('feb', 'february'), ('mar', 'march'), ('apr', 'april'),
                           ('may',), ('jun', 'june'), ('jul', 'july'), ('aug', 'august'),
                           ('sep', 'sept', 'september'), ('oct', 'october'), ('nov', 'november'),
                           ('dec', 'december')], 1):
    for n in names:
        MONTHS[n] = i
HE_MONTHS = {'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7,
             'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12}

MON = r'(?:%s)' % '|'.join(sorted(MONTHS, key=len, reverse=True))
DASH = r'\s*[-–—]\s*'
YEAR = r'(?:,?\s+(\d{4}))?'

RE_FULL_RANGE = re.compile(r'\b(\d{1,2})\s+(%s)\.?(?:\s+(\d{4}))?%s(\d{1,2})\s+(%s)\.?%s' % (MON, DASH, MON, YEAR), re.I)
RE_DAY_RANGE = re.compile(r'\b(\d{1,2})%s(\d{1,2})\s+(%s)\.?%s' % (DASH, MON, YEAR), re.I)
RE_UNTIL = re.compile(r'\buntil\s+(\d{1,2})\s+(%s)\.?%s' % (MON, YEAR), re.I)
RE_SINGLE = re.compile(r'\b(\d{1,2})\s+(%s)\.?%s' % (MON, YEAR), re.I)
RE_HE_DATE = re.compile(r'(\d{1,2})\s+ב(%s)(?:\s+(\d{4}))?' % '|'.join(HE_MONTHS))


def _mon(s):
    return MONTHS[s.lower().rstrip('.')]


def _safe(y, m, d):
    try:
        return datetime.date(y, m, d)
    except ValueError:
        return None


def infer_year(m, d, ref):
    """השנה הקרובה ביותר שבה התאריך לא רחוק יותר מ-3 חודשים אחורה מתאריך הריצה."""
    c = _safe(ref.year, m, d)
    if c and c < ref - datetime.timedelta(days=92):
        c = _safe(ref.year + 1, m, d)
    return c


def _pair(d1, m1, y1, d2, m2, y2, ref):
    inferred = False
    if y2:
        end = _safe(int(y2), m2, int(d2))
    else:
        end = infer_year(m2, int(d2), ref)
        inferred = True
    if not end:
        return None, None, inferred
    if y1:
        start = _safe(int(y1), m1, int(d1))
    else:
        sy = end.year if (m1, int(d1)) <= (m2, int(d2)) else end.year - 1
        start = _safe(sy, m1, int(d1))
    return start, end, inferred


def parse_range(text, ref):
    """
    מחזיר מילון: kind (range, until, single, multiple, ongoing, None), valid_from, valid_to,
    evidence, year_inferred. התאריכים כ-YYYY-MM-DD או None.
    """
    t = ' '.join((text or '').split())
    out = {'kind': None, 'valid_from': None, 'valid_to': None, 'evidence': None, 'year_inferred': False}
    if not t:
        return out

    m = RE_FULL_RANGE.search(t)
    if m:
        s, e, inf = _pair(m.group(1), _mon(m.group(2)), m.group(3), m.group(4), _mon(m.group(5)), m.group(6), ref)
        if s and e:
            out.update(kind='range', valid_from=s.isoformat(), valid_to=e.isoformat(), evidence=m.group(0),
                       year_inferred=inf)
            return out

    m = RE_DAY_RANGE.search(t)
    if m:
        mon = _mon(m.group(3))
        s, e, inf = _pair(m.group(1), mon, None, m.group(2), mon, m.group(4), ref)
        if s and e:
            out.update(kind='range', valid_from=s.isoformat(), valid_to=e.isoformat(), evidence=m.group(0),
                       year_inferred=inf)
            return out

    m = RE_UNTIL.search(t)
    if m:
        y = m.group(3)
        e = _safe(int(y), _mon(m.group(2)), int(m.group(1))) if y else infer_year(_mon(m.group(2)), int(m.group(1)), ref)
        if e:
            out.update(kind='until', valid_to=e.isoformat(), evidence=m.group(0), year_inferred=not y)
            return out

    singles = []
    for m in RE_SINGLE.finditer(t):
        y = m.group(3)
        d = _safe(int(y), _mon(m.group(2)), int(m.group(1))) if y else infer_year(_mon(m.group(2)), int(m.group(1)), ref)
        if d:
            singles.append((d, m.group(0), not y))
    if len(singles) == 1:
        d, ev, inf = singles[0]
        out.update(kind='single', valid_from=d.isoformat(), valid_to=d.isoformat(), evidence=ev, year_inferred=inf)
        return out
    if len(singles) > 1:
        ds = sorted(x[0] for x in singles)
        out.update(kind='multiple', valid_from=ds[0].isoformat(), valid_to=ds[-1].isoformat(), evidence=t,
                   year_inferred=any(x[2] for x in singles))
        return out

    if re.search(r'\bongoing\b|\bpermanent\b', t, re.I):
        out.update(kind='ongoing', evidence=re.search(r'\bongoing\b|\bpermanent\b', t, re.I).group(0))
    return out


def date_mentions(text):
    """כל אזכורי יום וחודש בטקסט, באנגלית ובעברית: [(raw, month, day, year או None)]"""
    t = ' '.join((text or '').split())
    found = []
    for m in RE_SINGLE.finditer(t):
        found.append((m.group(0), _mon(m.group(2)), int(m.group(1)), int(m.group(3)) if m.group(3) else None))
    for m in RE_HE_DATE.finditer(t):
        found.append((m.group(0), HE_MONTHS[m.group(2)], int(m.group(1)), int(m.group(3)) if m.group(3) else None))
    # טווח ימים באותו חודש, למשל `27 to 29 October` עם קו מפריד, מזכיר גם את ה-27
    for m in RE_DAY_RANGE.finditer(t):
        found.append((m.group(0), _mon(m.group(3)), int(m.group(1)), int(m.group(4)) if m.group(4) else None))
    return found
