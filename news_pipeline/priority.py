# -*- coding: utf-8 -*-
"""
סדר העדיפויות בין פריטים שכבר עברו את שערי הכשירות.

הניקוד ב-scoring.py עונה על השאלה "האם הפריט ראוי לטיוטה". הוא כמעט זהה לכל פריט רשמי עם
תאריכים, ולכן אינו מתאים לסידור. כאן נשאלת שאלה אחרת: כמה הפריט משנה למטייל ישראלי בלונדון.

ארבעה רכיבים, 0 עד 100:
  practical  0..40  השפעה מעשית: סגירה מלאה מול שיבוש חלקי, קו מרכזי מול קו שולי, הגעה לשדה תעופה,
                    כללי כניסה שחלים על כל מי שטס
  interest   0..40  עניין לתייר: אטרקציה חדשה, תערוכה גדולה, פסטיבל, מול פעילות קטנה, הרצאה או קורס
  urgency    0..10  כמה קרוב המועד
  reliability 0..10 נתונים מובנים ממקור רשמי מול HTML, שנה מוסקת, או כותרת בלבד

לשיבוש תחבורה יש רק practical, ולאירוע תרבות יש רק interest, ושניהם מוגבלים לאותה תקרה.
כך ידיעה שלילית לא מקבלת יתרון מובנה: סגירה מלאה של קו לשדה התעופה מגיעה ל-40, תערוכה גדולה
או אטרקציה חדשה מגיעות לאותו מקום, ושיבוש קטן בקו שולי נשאר נמוך מאוד.
"""
import datetime, re

from . import config

# בסיס ההשפעה המעשית לפי חומרת השיבוש של TfL
FULL_CLOSURE = 26        # Planned Closure, או "no service on the entire line"
PART_CLOSURE = 16        # Part Closure, או "no service between"
DEGRADED = 8             # Reduced Service, Minor Delays וכדומה
AIRPORT_BONUS = 12       # השיבוש עצמו חוסם או פוגע בהגעה לשדה תעופה
NON_TOURIST_LINE = 0.3   # קו שלא עובר באזורי תיירות: אותו שיבוש שווה פחות משליש
RE_FULL = re.compile(r'no service on the entire line|entire line|whole line', re.I)
RE_NO_SERVICE = re.compile(r'\bno service\b|\bclosed\b', re.I)
RE_AIRPORT_HIT = re.compile(r'no service[^.]*\b(Heathrow|Gatwick|Stansted|Luton)\b', re.I)
RE_AIRPORT_ANY = re.compile(r'\b(Heathrow|Gatwick|Stansted|Luton)\b', re.I)

# עניין לתייר לפי סוג הפריט אצל המקור
INTEREST_BY_TYPE = {
    'exhibition': 30, 'festival': 24, 'special-event': 18, 'season': 14, 'family': 14,
    'late': 14, 'display': 12, 'event': 14, 'performance': 12, 'drop-in': 8, 'film-screening': 6,
    'tour': 6, 'open-studio': 4, 'talk': 3, 'workshop': 3, 'course': 2, 'conferences-and-study-days': 2,
}
DEFAULT_EVENT_INTEREST = 14
NEW_ATTRACTION_INTEREST = 36
RE_NEW_ATTRACTION = re.compile(r'\b(new (museum|gallery|attraction|space|landmark)|opens to the public|'
                               r'now open|reopens|grand opening|first (ever|time))\b', re.I)

STRUCTURED_SOURCES = ('tfl_planned', 'tfl_live', 'govuk_watch', 'govuk_bank_holidays', 'govuk_eta_news', 'vam_whatson')


def _days(iso, today):
    return (datetime.date.fromisoformat(iso) - today).days


def _hits(words, text):
    return [w for w in words if re.search(r'(?<![\w])%s(?![\w])' % re.escape(w), text, re.I)]


def priority(c, today):
    """מחזיר (ניקוד, פירוט, הסברים)."""
    k = c['kind']
    f = c.get('flags') or {}
    words = ' '.join([c.get('title') or '', c.get('summary') or ''])
    notes = []
    practical = interest = 0.0

    # השפעה מעשית
    if k.startswith('disruption'):
        sev = f.get('severity')
        reason = c.get('summary') or ''
        full = sev == 4 or bool(RE_FULL.search(reason))
        if full:
            practical, label = FULL_CLOSURE, 'סגירה מלאה של הקו'
        elif sev in (5, 6) or RE_NO_SERVICE.search(reason):
            practical, label = PART_CLOSURE, 'סגירה חלקית'
        else:
            practical, label = DEGRADED, 'שירות מופחת או עיכובים'
        tourist_line = f.get('line_id') in config.TOURIST_LINE_IDS
        if not tourist_line:
            practical *= NON_TOURIST_LINE
            label += ', בקו שאינו עובר באזורי התיירות'
        notes.append(label)
        airport = f.get('line_id') in config.AIRPORT_LINE_IDS and (full or RE_AIRPORT_HIT.search(reason))
        if airport:
            practical += AIRPORT_BONUS
            notes.append('פוגע בהגעה לשדה התעופה')
        elif tourist_line and RE_AIRPORT_ANY.search(reason) and not full:
            practical += 2   # מוזכר שדה תעופה, אבל השירות אליו ממשיך
        span = (_days(c['valid_to'], today) - _days(c['valid_from'], today) + 1) if c.get('valid_from') and c.get('valid_to') else 1
        if span >= 3:
            practical += 2
            notes.append('נמשך %d ימים' % span)
    elif k == 'entry_rules':
        practical = 30 if (f.get('change_note') or c['source_id'] == 'govuk_eta_news') else 22
        notes.append('כללי כניסה לבריטניה, חלים על כל מי שטס')
    elif k == 'public_holiday':
        practical = 15
        notes.append('חג רשמי: חנויות ותחבורה פועלות אחרת')
    elif k == 'weather_warning':
        practical = 15 if re.search(r'\bLondon\b', c.get('summary') or '') else 5
        notes.append('אזהרת מזג אוויר רשמית')
    elif k == 'airport_news':
        practical = 10 + (12 if _hits(config.AUDIENCE_WORDS, words) else 0)
        notes.append('חדשות שדה התעופה' + (' שנוגעות לטיסות מישראל' if practical > 10 else ''))

    # עניין לתייר
    if k in config.EVENT_KINDS:
        ltype = f.get('listing_type') or ''
        interest = INTEREST_BY_TYPE.get(ltype, DEFAULT_EVENT_INTEREST)
        label = 'סוג הפריט: %s' % (ltype or k)
        if k == 'new_attraction' or RE_NEW_ATTRACTION.search(words):
            interest = max(interest, NEW_ATTRACTION_INTEREST)
            label = 'אטרקציה או חלל חדש'
        notes.append(label)
        if _hits(config.SEASONAL_WORDS, words):
            interest += 4
            notes.append('עונתי')
        if _hits(config.FAMILY_WORDS, words):
            interest += 4
            notes.append('למשפחות')
        if _hits(config.AUDIENCE_WORDS, words):
            interest += 6
            notes.append('נוגע לקהל הישראלי')
        interest -= 5 * len(_hits(config.NOT_FOR_TOURISTS, words))

    # דחיפות
    urgency = 2
    vf, vt = c.get('valid_from'), c.get('valid_to')
    if vf and _days(vf, today) >= 0:
        d = _days(vf, today)
        urgency = 10 if d <= 7 else (7 if d <= 21 else (4 if d <= config.EVENT_HORIZON_DAYS else 1))
    elif vf and -_days(vf, today) <= config.NEW_OPENING_DAYS:
        urgency = 6
    elif vt and _days(vt, today) <= config.CLOSING_SOON_DAYS:
        urgency = 6
    elif k == 'entry_rules':
        urgency = 6

    # אמינות
    reliability = 10 if c['source_id'] in STRUCTURED_SOURCES else 8
    if c.get('year_inferred'):
        reliability -= 3
    if f.get('body_not_read'):
        reliability -= 3

    br = {'practical': round(max(0, min(40, practical))), 'interest': round(max(0, min(40, interest))),
          'urgency': urgency, 'reliability': reliability}
    return sum(br.values()), br, notes
