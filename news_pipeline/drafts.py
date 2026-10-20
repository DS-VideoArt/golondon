# -*- coding: utf-8 -*-
"""
בניית הטיוטות והדוח.

טיוטה היא הצעה לאייטם במבנה של whats-new.json, שבה כל שדה עברי ריק (None) ורשום
ב-missing_fields. בשלב 0 אין ניסוח: שום שדה לא מתמלא בטקסט שלא הגיע מהמקור.
"""
import datetime, os

from . import config
from .ledger import LIFECYCLE_HE

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
ADMITTED_HE = {'slot': 'מקום פנוי בתור', 'update': 'עדכון מהותי לפריט שכבר נבדק, מוצג תמיד',
               'urgent': 'עדיפות גבוהה במיוחד, נכנס גם לתור מלא'}
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
    """טיוטות שנכנסו לתור בריצה הזו בלבד, לפי סדר העדיפות. פריטים שממתינים מריצות קודמות לא חוזרים כאן."""
    drafts = []
    for r in results:
        if r['decision'] not in ('ACCEPT_FOR_DRAFT', 'HOLD_FOR_REVIEW'):
            continue
        c = r['candidate']
        item, missing = proposal(c, today)
        drafts.append({
            'decision': r['decision'],
            'classification': r['classification']['verdict'],
            'queue': r['queue'],
            'priority': r['priority'], 'priority_breakdown': r['priority_breakdown'],
            'priority_notes': r['priority_notes'],
            'score': r['score'], 'score_breakdown': r['score_breakdown'],
            'why': r['reasons'], 'hold_reasons': r['hold_reasons'],
            'facts': {k: c.get(k) for k in ('title', 'summary', 'kind', 'status', 'valid_from', 'valid_to',
                                            'location', 'published_at', 'updated_at', 'verified_at',
                                            'year_inferred', 'evidence')},
            'source': {k: c.get(k) for k in ('source_id', 'source_name', 'item_url', 'source_url',
                                             'licence', 'attribution')},
            'fingerprint': c['fingerprint'],
            'changes': r['classification'].get('changes') or [],
            'fact_check': r['fact_check'],
            'proposed_whats_new_item': item,
            'missing_fields': missing,
            'requires_human_approval': True,
            'publish': 'disabled in phase 0',
        })
    drafts.sort(key=lambda d: (-d['priority'], d['fingerprint']))
    return drafts


def _brief(r):
    c = r['candidate']
    return {'fingerprint': c['fingerprint'], 'title': c['title'], 'source_id': c['source_id'],
            'priority': r['priority'], 'first_seen': r['queue']['first_seen'],
            'first_seen_run': r['queue']['first_seen_run'], 'valid_from': c.get('valid_from'),
            'valid_to': c.get('valid_to'), 'item_url': c.get('item_url')}


def queue_view(results, pending_unseen, left):
    """מצב התור אחרי הריצה: מה ממתין להחלטה, מה מחכה מחוץ למכסה, ומה יצא."""
    pending = [_brief(r) for r in results if r['decision'] == 'PENDING']
    pending += [{'fingerprint': rec['fingerprint'], 'title': rec['title'], 'source_id': rec.get('source_id'),
                 'priority': rec.get('priority', 0), 'first_seen': rec.get('first_seen'),
                 'first_seen_run': rec.get('first_seen_run'), 'valid_to': rec.get('valid_to'),
                 'item_url': rec.get('item_url'), 'not_seen_this_run': True} for rec in pending_unseen]
    backlog = [_brief(r) for r in results if r['decision'] == 'BACKLOG']
    key = lambda x: (-(x.get('priority') or 0), x['fingerprint'])
    return {'pending': sorted(pending, key=key), 'backlog': sorted(backlog, key=key), 'left_queue': left}


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


def _draft_block(L, d):
    f = d['facts']
    L.append('### %s' % _code(f['title']))
    L.append('')
    L.append('* עדיפות %d מתוך 100 (השפעה מעשית %d, עניין לתייר %d, דחיפות %d, אמינות %d): %s' % (
        d['priority'], d['priority_breakdown']['practical'], d['priority_breakdown']['interest'],
        d['priority_breakdown']['urgency'], d['priority_breakdown']['reliability'], '; '.join(d['priority_notes'])))
    L.append('* מצב בתור: %s. נראה לראשונה ב-%s. נכנס: %s' % (
        LIFECYCLE_HE.get(d['queue']['lifecycle'], d['queue']['lifecycle']), d['queue']['first_seen'],
        ADMITTED_HE.get(d['queue'].get('admitted'), '')))
    L.append('* סיווג: %s. כשירות %d מתוך 100' % (VERDICT_HE[d['classification']], d['score']))
    for ch in d.get('changes') or []:
        L.append('* שינוי: %s' % _code(ch))
    L.append('* סוג: %s, קטגוריה באתר: %s, תוקף: %s' % (_code(f['kind']), d['proposed_whats_new_item']['category'], _validity(f)))
    if f.get('location'):
        L.append('* מיקום לפי המקור: %s' % _code(f['location']))
    L.append('* למה כשיר: %s' % '; '.join(d['why']))
    for h in d['hold_reasons']:
        L.append('* עצירה: %s' % h)
    L.append('* בדיקת עובדות: %s (%s)' % ('עברה' if d['fact_check']['passed'] else 'נכשלה',
                                         ', '.join(d['fact_check']['checked_fields']) or 'אין שדות תאריך'))
    L.append('* חסר ולא הושלם: %s' % ', '.join(d['missing_fields']))
    L.append('* מזהה להחלטה: %s' % _code(d['fingerprint']))
    L.append('* מקור: %s' % d['source']['item_url'])
    L.append('')


def report(run, sources, results, drafts, queue):
    new = [d for d in drafts if d['queue'].get('admitted') != 'update']
    upd = [d for d in drafts if d['queue'].get('admitted') == 'update']
    rej = [r for r in results if r['decision'] == 'REJECT']
    L = []
    L.append('# ריצת איסוף חדשות %s' % run['run_id'])
    L.append('')
    L.append('**טיוטות לבדיקה בלבד.** שום דבר לא פורסם, לא באתר ולא ברשתות, ושום קובץ של האתר לא השתנה.')
    L.append('')
    L.append('* זמן הריצה בשעון ישראל: %s (חלון %s)' % (run['started_local'], run['slot']))
    L.append('* תאריך בלונדון: %s' % run['today_london'])
    L.append('* מצב איסוף: %s' % ('קבצי בדיקה מקומיים, בלי רשת' if run['fetch_mode'] == 'fixtures' else 'קריאה חיה ממקורות רשמיים'))
    if run['outcome'] == 'all_sources_failed':
        L.append('* **תוצאה: כל המקורות נכשלו.** אין לפרש זאת כ"אין חדש".')
    elif run['outcome'] == 'nothing_to_publish':
        L.append('* **תוצאה: אין מה לפרסם מעבר למה שכבר ממתין.** %d מועמדים נבדקו, ואף אחד לא נכנס לתור בריצה הזו.' % len(results))
    else:
        L.append('* **תוצאה:** %d נכנסו לתור בריצה הזו (%d מומלצות לטיוטה, %d להחלטה), מתוכם %d עדכונים.' % (
            len(drafts), sum(1 for d in drafts if d['decision'] == 'ACCEPT_FOR_DRAFT'),
            sum(1 for d in drafts if d['decision'] == 'HOLD_FOR_REVIEW'), len(upd)))
    L.append('* מצב התור: %d ממתינים להחלטה, %d מחכים מחוץ למכסה, %d יצאו מהתור, %d נפסלו בריצה.' % (
        len(queue['pending']) + len(drafts), len(queue['backlog']), len(queue['left_queue']), len(rej)))
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
    L.append('## איזון התוכן בריצה')
    L.append('')
    L.append('* חוויות, אירועים ותערוכות: %d' % pos)
    L.append('* מידע מעשי, תחבורה וכללי כניסה: %d' % (len(drafts) - pos))
    L.append('')

    L.append('## נכנסו לתור בריצה הזו (%d), לפי סדר עדיפות' % len(new))
    L.append('')
    if not new:
        L.append('אין.')
        L.append('')
    for d in new:
        _draft_block(L, d)

    L.append('## עדכונים לפריטים שכבר נבדקו (%d)' % len(upd))
    L.append('')
    if not upd:
        L.append('אין.')
        L.append('')
    for d in upd:
        _draft_block(L, d)

    L.append('## ממתינים להחלטה מריצות קודמות (%d)' % len(queue['pending']))
    L.append('')
    if not queue['pending']:
        L.append('אין.')
    for p in queue['pending']:
        L.append('* %s, עדיפות %s, בתור מאז %s%s. מזהה %s' % (
            _code(p['title']), p.get('priority'), p.get('first_seen'),
            ', לא נראה במקור בריצה הזו' if p.get('not_seen_this_run') else '', _code(p['fingerprint'])))
    L.append('')

    L.append('## מחכים מחוץ למכסה (%d)' % len(queue['backlog']))
    L.append('')
    if not queue['backlog']:
        L.append('אין.')
    else:
        L.append('כשירים, אבל התור מלא. לא מוצגים כחדשים, ויעלו לפי סדר העדיפות כשיתפנה מקום.')
        L.append('')
    for p in queue['backlog'][:15]:
        L.append('* %s, עדיפות %s, מחכה מאז %s' % (_code(p['title']), p.get('priority'), p.get('first_seen')))
    if len(queue['backlog']) > 15:
        L.append('* ועוד %d, ברשימה המלאה ב-drafts.json' % (len(queue['backlog']) - 15))
    L.append('')

    if queue['left_queue']:
        L.append('## יצאו מהתור (%d)' % len(queue['left_queue']))
        L.append('')
        for x in queue['left_queue']:
            L.append('* %s: %s' % (_code(x['title']), x['reason']))
        L.append('')

    L.append('## נפסלו (%d)' % len(rej))
    L.append('')
    if rej:
        L.append('| פריט | סיווג | כשירות | הסיבה |')
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
    L.append('* החלטה על פריט: %s' % _code('python3 news_pipeline/run.py --decide <מזהה>=approve|reject'))
    L.append('* שנה שלא כתובה במקור מסומנת year_inferred ומורידה גם את הכשירות וגם את האמינות.')
    L.append('* ייחוס נדרש לפי מקור מופיע בכל טיוטה בשדה source.attribution.')
    return '\n'.join(L) + '\n'
