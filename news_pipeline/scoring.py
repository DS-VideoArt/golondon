# -*- coding: utf-8 -*-
"""
דירוג לפי כללים קבועים, 0 עד 100, ושערים שגוברים על הניקוד.

שישה קריטריונים:
  source_authority  20  מקור רשמי של המפעיל או הממשלה
  timeliness        20  האם זה רלוונטי עכשיו ובחלון של "מה חדש" (60 יום קדימה)
  tourist_relevance 25  מקומות, קווים ומוסדות שמטיילים מגיעים אליהם, פחות תוכן שאינו למטיילים
  specificity       15  תאריכים כתובים, מיקום, עמוד ייעודי אצל המקור
  novelty           10  חדש, עדכון או ביטול של משהו שכבר הצענו
  audience_fit      10  משפחות, כניסה חופשית, ישראל וקהילה יהודית

שערי פסילה (REJECT בכל ניקוד): פג תוקף, כפילות, סטטוס חי, יסתיים לפני שאפשר לפרסם,
בדיקת עובדות נכשלה.
שערי עצירה (HOLD בכל ניקוד מעל סף הפסילה): נושא רגיש, ביטול, עדכון כללי כניסה בלי תיאור
השינוי, אירוע בלי תאריכים כתובים.
"""
import datetime, re

from . import config

ACCEPT, HOLD, REJECT = 'ACCEPT_FOR_DRAFT', 'HOLD_FOR_REVIEW', 'REJECT'


def _hits(words, text):
    found = []
    for w in words:
        if re.search(r'(?<![\w])%s(?![\w])' % re.escape(w), text, re.I):
            found.append(w)
    return found


def _days(a, b):
    return (datetime.date.fromisoformat(a) - b).days


def score(c, cls, today, now):
    blob = ' '.join([c.get('title') or '', c.get('summary') or '', c.get('location') or ''])
    words = ' '.join([c.get('title') or '', c.get('summary') or ''])
    reasons = []
    br = {}

    # 1. סמכות המקור. כל המקורות בשלב 0 הם אתרי המפעיל או הממשלה עצמם
    br['source_authority'] = 20
    reasons.append('מקור רשמי: %s' % c['source_name'])

    # 2. עיתוי
    k = c['kind']
    vf, vt = c.get('valid_from'), c.get('valid_to')
    t = 0
    if k in config.EVENT_KINDS:
        if vf and _days(vf, today) > 0:
            d = _days(vf, today)
            t = 20 if d <= config.EVENT_HORIZON_DAYS else (8 if d <= 120 else 2)
            reasons.append('מתחיל בעוד %d ימים' % d)
        elif vf and -_days(vf, today) <= config.NEW_OPENING_DAYS:
            t = 18
            reasons.append('נפתח לפני %d ימים' % -_days(vf, today))
        elif vt:
            left = _days(vt, today)
            t = 12 if left <= config.CLOSING_SOON_DAYS else 0
            reasons.append('פעיל כבר, נשארו %d ימים' % left)
        else:
            reasons.append('אין תאריכים כתובים במקור, אי אפשר לקבוע עיתוי')
    elif k == 'disruption_planned':
        t = 20 if vf and _days(vf, today) <= config.LOOKAHEAD_DAYS else 10
        reasons.append('עבודות מתוכננות בתוך %d הימים הקרובים' % config.LOOKAHEAD_DAYS)
    elif k in ('entry_rules',):
        t = 20
        reasons.append('עדכון רשמי בתוך %d הימים האחרונים' % config.LOOKAHEAD_DAYS)
    elif k == 'airport_news':
        p = c.get('published_at')
        age = (today - datetime.date.fromisoformat(p[:10])).days if p else None
        t = 15 if age is not None and age <= 7 else (8 if age is not None and age <= 30 else 0)
        reasons.append('פורסם לפני %s ימים' % (age if age is not None else 'מספר לא ידוע של'))
    elif k == 'public_holiday':
        t = 15
        reasons.append('חג רשמי בתוך 30 יום')
    elif k == 'weather_warning':
        t = 20 if vf else 5
    br['timeliness'] = t

    # 3. רלוונטיות למטייל
    flags = c.get('flags') or {}
    venues = _hits(config.MAJOR_VENUES, blob)
    places = _hits(config.TOURIST_PLACES, words)     # המיקום הקבוע של מוסד לא נספר פעמיים
    line_id = flags.get('line_id')
    lines = [line_id] if line_id in config.TOURIST_LINE_IDS else []
    seasonal = _hits(config.SEASONAL_WORDS, words)
    negative = _hits(config.NOT_FOR_TOURISTS, words)
    institution = c['source_id'] in config.INSTITUTION_SOURCES
    r = 10 if (venues or institution) else 0
    r += min(10, 5 * len(places)) + (10 if lines else 0) + (5 if seasonal else 0)
    if lines and flags.get('severity') is not None and flags['severity'] <= 4:
        r += 5  # סגירה מלאה של קו מרכזי, לא רק שיבוש חלקי
    ltype = flags.get('listing_type')
    tw = config.LISTING_TYPE_WEIGHT.get(ltype, 0) if ltype else 0
    r += tw
    if k in ('entry_rules', 'public_holiday'):
        r += 15  # נוגע לכל מי שנכנס לבריטניה או מטייל ביום הזה
    if k == 'weather_warning' and re.search(r'\bLondon\b', c.get('summary') or ''):
        r += 15  # אזהרה רשמית שחלה על לונדון עצמה
    r -= 10 * len(negative)
    br['tourist_relevance'] = max(0, min(25, r))
    if venues or institution:
        reasons.append('מוסד או אזור מרכזי: %s' % (', '.join(venues[:3]) or c['source_name']))
    if ltype:
        reasons.append('סוג הפריט אצל המקור: %s (%+d)' % (ltype, tw))
    if places:
        reasons.append('מקומות תיירותיים: %s' % ', '.join(places[:4]))
    if lines:
        reasons.append('קווים שמשרתים מטיילים: %s' % ', '.join(lines[:3]))
    if seasonal:
        reasons.append('עונתי: %s' % ', '.join(seasonal[:3]))
    if negative:
        reasons.append('סימנים לתוכן שאינו למטיילים: %s' % ', '.join(negative[:4]))

    # 4. ספציפיות
    s = 0
    ev = c.get('evidence') or {}
    if vf and 'valid_from' in ev:
        s += 3 if c.get('year_inferred') else 5
    if vt and 'valid_to' in ev:
        s += 2 if c.get('year_inferred') else 4
    if c.get('location'):
        s += 3
    if c.get('item_url') and c['item_url'].rstrip('/') != (c.get('source_url') or '').rstrip('/'):
        s += 3
    br['specificity'] = s
    if c.get('year_inferred'):
        reasons.append('השנה לא כתובה במקור והוסקה מתאריך הריצה')

    # 5. חידוש
    v = cls['verdict']
    br['novelty'] = {'NEW': 10, 'UPDATE': 7, 'CANCELLATION': 10 if cls.get('matched') else 3}.get(v, 0)

    # 6. התאמה לקהל
    a = 0
    fam = _hits(config.FAMILY_WORDS, words)
    free = _hits(config.FREE_WORDS, words) or (flags.get('free') and ['free'])
    aud = _hits(config.AUDIENCE_WORDS, words)
    a += 5 if fam else 0
    a += 5 if free else 0
    a += 10 if aud else 0
    br['audience_fit'] = min(10, a)
    if fam:
        reasons.append('מתאים למשפחות')
    if free:
        reasons.append('כניסה חופשית לפי המקור')
    if aud:
        reasons.append('נוגע ישירות לקהל הישראלי: %s' % ', '.join(aud))

    return sum(br.values()), br, reasons


def gates(c, cls, fact, today, now):
    """מחזיר (reject_reasons, hold_reasons)."""
    rej, hold = [], []
    v = cls['verdict']
    if v == 'EXPIRED':
        rej.append('פג תוקף: ' + cls['reason'])
    if v == 'DUPLICATE':
        rej.append('כפילות: ' + cls['reason'])
    if (c.get('flags') or {}).get('live_transient'):
        rej.append('סטטוס חי של TfL מתיישן תוך דקות, ותנאי TfL אוסרים להציג סטטוס מיושן. מתאים להקשר בלבד')
    vt = c.get('valid_to')
    if vt and v not in ('EXPIRED', 'CANCELLATION'):
        lag_day = (now + datetime.timedelta(hours=config.PUBLISH_LAG_HOURS)).date()
        if datetime.date.fromisoformat(vt) < lag_day:
            rej.append('יסתיים ב-%s, לפני שטיוטה תעבור אישור ותתפרסם (%d שעות)' % (vt, config.PUBLISH_LAG_HOURS))
    if not fact['passed']:
        rej.append('בדיקת העובדות נכשלה: ' + '; '.join(fact['problems']))
    if c['kind'] in config.EVENT_KINDS and v not in ('EXPIRED', 'CANCELLATION'):
        vf = c.get('valid_from')
        if vf and _days(vf, today) > config.EVENT_HORIZON_DAYS:
            rej.append('מתחיל בעוד %d ימים, מחוץ לחלון של %d. ייבדק שוב כשיתקרב' % (_days(vf, today), config.EVENT_HORIZON_DAYS))
        elif (vf or vt) and (not vf or -_days(vf, today) > config.NEW_OPENING_DAYS):
            # פריט שכבר פתוח זמן מה הוא חדשה רק כ"הזדמנות אחרונה" לתערוכה, ורק כשהיא נסגרת בקרוב
            ltype = (c.get('flags') or {}).get('listing_type')
            last_chance = vt and _days(vt, today) <= config.CLOSING_SOON_DAYS and ltype in (None, '', 'exhibition')
            if not last_chance:
                since = ('פתוח כבר %d ימים' % -_days(vf, today)) if vf else 'כבר פתוח'
                rej.append('%s ונסגר %s. אין כאן חדשה, זה תוכן למדריך' % (
                    since, ('בעוד %d ימים' % _days(vt, today)) if vt else 'במועד שלא כתוב במקור'))

    blob = ' '.join([c.get('title') or '', c.get('summary') or ''])
    sens = _hits(config.SENSITIVE_WORDS, blob)
    if sens:
        hold.append('נושא רגיש (%s). דורש שיקול דעת אנושי לפני כל ניסוח' % ', '.join(sens))
    if v == 'CANCELLATION':
        hold.append('ביטול או דחייה. ' + cls['reason'])
    if v == 'UPDATE':
        hold.append('עדכון לפריט מוכר. שינויים: %s' % ('; '.join(cls.get('changes') or []) or cls['reason']))
    if c['kind'] == 'entry_rules' and not (c.get('flags') or {}).get('change_note') and c['source_id'] == 'govuk_watch':
        hold.append('GOV.UK מסמן שהעמוד עודכן אבל לא מפרט מה השתנה. אדם צריך לקרוא את העמוד, אסור לנחש')
    if c['kind'] in config.EVENT_KINDS and not (c.get('valid_from') or c.get('valid_to')):
        hold.append('אין תאריכים כתובים במקור. לא משלימים תאריך חסר')
    if (c.get('flags') or {}).get('body_not_read'):
        hold.append('נקראה רק הכותרת. כל פרט מעבר לה דורש קריאה של ההודעה המלאה')
    return rej, hold


def decide(total, rej, hold, relevance):
    if rej:
        return REJECT
    if total < config.HOLD_THRESHOLD or relevance < config.HOLD_MIN_RELEVANCE:
        return REJECT
    if hold or total < config.ACCEPT_THRESHOLD or relevance < config.ACCEPT_MIN_RELEVANCE:
        return HOLD
    return ACCEPT


def why_not(total, rej, relevance):
    """הסיבה העיקרית לפסילה, לדוח."""
    if rej:
        return rej[0]
    if relevance < config.HOLD_MIN_RELEVANCE:
        return 'רלוונטיות למטייל %d, מתחת לסף %d' % (relevance, config.HOLD_MIN_RELEVANCE)
    return 'ניקוד %d, מתחת לסף %d' % (total, config.HOLD_THRESHOLD)
