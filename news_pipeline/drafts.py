# -*- coding: utf-8 -*-
"""
בניית הטיוטות והדוח.

טיוטה היא הצעה לאייטם במבנה של whats-new.json, שבה כל שדה עברי ריק (None) ורשום
ב-missing_fields. בשלב 0 אין ניסוח: שום שדה לא מתמלא בטקסט שלא הגיע מהמקור.
"""
import datetime, os

from . import config

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# מדריך קיים באתר שהכרטיס יכול להוביל אליו. הצעה בלבד, נבדק שהקובץ קיים
GUIDE_BY_SOURCE = {
    'tfl_planned': 'guide-transport-lines.html',
    'tfl_live': 'guide-transport-tube.html',
    'govuk_watch': 'guide-flight-eta.html',
    'govuk_eta_news': 'guide-flight-eta.html',
    'govuk_bank_holidays': 'guide-events-closures.html',
    'metoffice_se': 'guide-winter-weather.html',
    'vam_whatson': 'guide-attractions-museums.html',
    'tate_whatson': 'guide-attractions-museums.html',
    'royalparks_whatson': 'guide-attractions-parks.html',
    'heathrow_media': 'guide-flight-airports.html',
}
HEBREW_FIELDS = ('title', 'summary', 'body', 'imageAlt', 'primary_guide_label')
ASSIGNED_ON_APPROVAL = ('id', 'date', 'anchor', 'image', 'links')

DECISION_HE = {'ACCEPT_FOR_DRAFT': 'מומלץ לטיוטה', 'HOLD_FOR_REVIEW': 'ממתין להחלטת אדם', 'REJECT': 'נפסל'}
VERDICT_HE = {'NEW': 'חדש', 'UPDATE': 'עדכון', 'CANCELLATION': 'ביטול', 'DUPLICATE': 'כפילות', 'EXPIRED': 'פג תוקף'}
SOURCE_STATUS_HE = {'ok': 'תקין', 'blocked_robots': 'חסום ב-robots.txt, לא נעקף', 'blocked_http': 'חסום על ידי האתר, לא נעקף',
                    'http_error': 'שגיאת שרת', 'network': 'תקלת רשת', 'too_large': 'תשובה גדולה מדי',
                    'fixture_missing': 'אין קובץ בדיקה', 'parse_error': 'מבנה הדף לא זוהה', 'error': 'תקלה'}


def suggest_guide(c):
    g = GUIDE_BY_SOURCE.get(c['source_id'])
    if c['source_id'] == 'vam_whatson' and 'east' in (c.get('location') or '').lower():
        g = 'guide-attractions-va-east.html'
    return g if g and os.path.exists(os.path.join(REPO, g)) else None


def proposal(c, today):
    upcoming = bool(c.get('valid_from')) and c['valid_from'] > today.isoformat() and (
        c['kind'] in config.EVENT_KINDS or c['kind'] in ('disruption_planned', 'public_holiday', 'weather_warning'))
    item = {
        'id': None, 'date': None, 'anchor': None,
        'item_type': 'upcoming_event' if upcoming else 'news',
        'title': None, 'category': c['category'], 'entity': c['entity'],
        'summary': None, 'body': None, 'image': None, 'imageAlt': None,
        'sources': [{'name': c['source_name'], 'url': c['item_url']}],
        'links': [], 'standalone': None,
        'primary_guide_url': suggest_guide(c), 'primary_guide_label': None,
    }
    missing = list(HEBREW_FIELDS) + list(ASSIGNED_ON_APPROVAL)
    if upcoming:
        item['event_start'] = c.get('valid_from')
        item['event_end'] = c.get('valid_to')
        if not c.get('valid_to'):
            missing.append('event_end')
    elif c.get('valid_to'):
        item['expires'] = (datetime.date.fromisoformat(c['valid_to']) + datetime.timedelta(days=1)).isoformat()
    if not item['primary_guide_url']:
        missing.append('primary_guide_url')
    return item, missing


def build(results, today):
    drafts = []
    for r in results:
        if r['decision'] == 'REJECT':
            continue
        c = r['candidate']
        item, missing = proposal(c, today)
        drafts.append({
            'decision': r['decision'],
            'classification': r['classification']['verdict'],
            'score': r['score'], 'score_breakdown': r['score_breakdown'],
            'why': r['reasons'], 'hold_reasons': r['hold_reasons'],
            'facts': {k: c.get(k) for k in ('title', 'summary', 'kind', 'status', 'valid_from', 'valid_to',
                                            'location', 'published_at', 'updated_at', 'verified_at',
                                            'year_inferred', 'evidence')},
            'source': {k: c.get(k) for k in ('source_id', 'source_name', 'item_url', 'source_url',
                                             'licence', 'attribution')},
            'fingerprint': c['fingerprint'],
            'fact_check': r['fact_check'],
            'proposed_whats_new_item': item,
            'missing_fields': missing,
            'requires_human_approval': True,
            'publish': 'disabled in phase 0',
        })
    order = {'ACCEPT_FOR_DRAFT': 0, 'HOLD_FOR_REVIEW': 1}
    drafts.sort(key=lambda d: (order[d['decision']], -d['score']))
    return drafts


def _code(s):
    s = ' '.join(str(s or '').split()).replace('`', "'")
    return '`%s`' % s if s else ''


def _validity(f):
    a, b = f.get('valid_from'), f.get('valid_to')
    if a and b:
        return '%s עד %s' % (a, b) if a != b else a
    if b:
        return 'עד %s' % b
    if a:
        return 'מ-%s' % a
    return 'לא כתוב במקור'


def report(run, sources, results, drafts):
    acc = [d for d in drafts if d['decision'] == 'ACCEPT_FOR_DRAFT']
    hold = [d for d in drafts if d['decision'] == 'HOLD_FOR_REVIEW']
    rej = [r for r in results if r['decision'] == 'REJECT']
    L = []
    L.append('# ריצת איסוף חדשות %s' % run['run_id'])
    L.append('')
    L.append('**טיוטות לבדיקה בלבד.** שום דבר לא פורסם, לא באתר ולא ברשתות, ושום קובץ של האתר לא השתנה.')
    L.append('')
    L.append('* זמן הריצה בשעון ישראל: %s (חלון %s)' % (run['started_local'], run['slot']))
    L.append('* תאריך בלונדון: %s' % run['today_london'])
    L.append('* מצב איסוף: %s' % ('קבצי בדיקה מקומיים, בלי רשת' if run['fetch_mode'] == 'fixtures' else 'קריאה חיה ממקורות רשמיים'))
    if run['outcome'] == 'nothing_to_publish':
        L.append('* **תוצאה: אין מה לפרסם.** %d מועמדים נבדקו וכולם נפסלו או שלא נמצאו מועמדים.' % len(results))
    elif run['outcome'] == 'all_sources_failed':
        L.append('* **תוצאה: כל המקורות נכשלו.** אין לפרש זאת כ"אין חדש".')
    else:
        L.append('* **תוצאה:** %d מומלצות לטיוטה, %d ממתינות להחלטה, %d נפסלו.' % (len(acc), len(hold), len(rej)))
    L.append('')

    L.append('## מקורות')
    L.append('')
    L.append('| מקור | מצב | מועמדים | פרט |')
    L.append('|---|---|---|---|')
    for s in sources:
        L.append('| %s | %s | %d | %s |' % (_code(s['name']), SOURCE_STATUS_HE.get(s['status'], s['status']),
                                           s['candidates'], _code(s.get('detail'))))
    L.append('')

    pos = sum(1 for d in drafts if config.KINDS[d['facts']['kind']]['group'] == 'positive')
    L.append('## איזון התוכן')
    L.append('')
    L.append('* חוויות, אירועים ותערוכות: %d טיוטות' % pos)
    L.append('* מידע מעשי, תחבורה וכללי כניסה: %d טיוטות' % (len(drafts) - pos))
    if drafts and not pos:
        L.append('* שימו לב: אין בריצה הזו אף טיוטה חיובית. לא ממלאים את החסר בתוכן שלא נמצא.')
    L.append('')

    for title, group in (('מומלצות לטיוטה', acc), ('ממתינות להחלטת אדם', hold)):
        L.append('## %s (%d)' % (title, len(group)))
        L.append('')
        if not group:
            L.append('אין.')
            L.append('')
        for d in group:
            f = d['facts']
            L.append('### %s' % _code(f['title']))
            L.append('')
            L.append('* סיווג: %s. ניקוד %d מתוך 100 (%s)' % (
                VERDICT_HE[d['classification']], d['score'],
                ', '.join('%s %d' % (k, v) for k, v in d['score_breakdown'].items())))
            L.append('* סוג: %s, קטגוריה באתר: %s, תוקף: %s' % (_code(f['kind']), d['proposed_whats_new_item']['category'], _validity(f)))
            if f.get('location'):
                L.append('* מיקום לפי המקור: %s' % _code(f['location']))
            L.append('* למה: %s' % '; '.join(d['why']))
            for h in d['hold_reasons']:
                L.append('* עצירה: %s' % h)
            L.append('* בדיקת עובדות: %s (%s)' % ('עברה' if d['fact_check']['passed'] else 'נכשלה',
                                                 ', '.join(d['fact_check']['checked_fields']) or 'אין שדות תאריך'))
            L.append('* חסר ולא הושלם: %s' % ', '.join(d['missing_fields']))
            L.append('* מקור: %s' % d['source']['item_url'])
            L.append('')

    L.append('## נפסלו (%d)' % len(rej))
    L.append('')
    if rej:
        L.append('| פריט | סיווג | ניקוד | הסיבה |')
        L.append('|---|---|---|---|')
        for r in sorted(rej, key=lambda r: -r['score']):
            why = r.get('main_reason') or (r['reject_reasons'][0] if r['reject_reasons'] else '')
            L.append('| %s | %s | %d | %s |' % (_code(r['candidate']['title'])[:120], VERDICT_HE[r['classification']['verdict']],
                                               r['score'], why.replace('|', '/')))
    else:
        L.append('אין.')
    L.append('')
    L.append('## הערות')
    L.append('')
    L.append('* כל השדות העבריים ריקים בכוונה. הניסוח בעברית שייך לשלב הבא, ויעבור את אותה בדיקת עובדות.')
    L.append('* שנה שלא כתובה במקור מסומנת year_inferred ומורידה את ניקוד הספציפיות.')
    L.append('* ייחוס נדרש לפי מקור מופיע בכל טיוטה בשדה source.attribution.')
    return '\n'.join(L) + '\n'
