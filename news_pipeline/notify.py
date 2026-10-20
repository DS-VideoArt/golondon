# -*- coding: utf-8 -*-
"""
גוף התגובה ל-Issue "News queue" במאגר ההפעלה, אחרי כל ריצת סריקה בענן.

מחליט אם בכלל לכתוב: רק כשנכנס לתור פריט חדש או מעודכן, או כשהריצה נכשלה. ריצה שלא היה בה
חדש, או שדילגה (חלון שכבר רץ, מוקדם, מאוחר, זיכרון תפוס), לא מייצרת רעש.

הסקריפט לא פונה לרשת ולא מפרסם דבר. ה-workflow קורא את ההחלטה (post או skip) ושולח את הגוף עם
gh, אחרי שבדק שהסימון של הריצה עוד לא קיים ב-Issue, כך שגם הרצה חוזרת לא מכפילה תגובה.

    python3 news_pipeline/notify.py --stdout out/stdout.txt --out out --exit-code 0 \\
        --repo OWNER/golondon-news-ops --run-url URL --body-file out/comment.md
"""
import argparse, glob, json, os, sys

FAIL_HE = {
    2: 'כל המקורות נכשלו. אין לפרש זאת כ"אין חדש".',
    3: 'התנגשות בכתיבת הזיכרון. שום שינוי של הריצה לא נשמר.',
    4: 'הזיכרון היה תפוס.',
    5: 'הזיכרון חסר, פגום או לא נגיש. הריצה לא התחילה.',
    6: 'הקוד שנטען אינו ה-commit הנעוץ. הריצה לא התחילה.',
}


def _safe(text, limit=140):
    """טקסט מהמקור, כקוד: בלי markdown פעיל, בלי תיוג משתמשים, באורך מוגבל."""
    t = ' '.join(str(text or '').split()).replace('`', "'").replace('@', '@​')
    return '`%s`' % (t[:limit] + ('...' if len(t) > limit else ''))


def _last_json(path):
    try:
        with open(path, encoding='utf-8') as f:
            lines = [l for l in f.read().splitlines() if l.strip().startswith('{')]
        return json.loads(lines[-1]) if lines else None
    except (OSError, ValueError):
        return None


def build(summary, exit_code, drafts=None, repo=None, run_url=None, fallback_id=None):
    """מחזיר (post, body)."""
    run_id = (summary or {}).get('run_id') or fallback_id or 'unknown'
    marker = '<!-- golondon-news run=%s -->' % run_id
    outcome = (summary or {}).get('outcome')
    failed = exit_code != 0 or outcome == 'all_sources_failed' or summary is None
    if not failed and outcome != 'drafts_ready':
        return False, None

    L = [marker]
    if failed:
        L.append('**ריצת סריקה נכשלה** (%s, קוד %s)' % (run_id, exit_code))
        L.append('')
        L.append(FAIL_HE.get(exit_code, 'הריצה הסתיימה בשגיאה. הפרטים ביומן הריצה.'))
        if outcome:
            L.append('')
            L.append('תוצאה: %s' % _safe(outcome))
    else:
        c = summary.get('counts', {})
        L.append('**נכנסו לתור %d פריטים** (%s)' % (c.get('drafts', 0), run_id))
        L.append('')
        L.append('ממתינים להחלטה: %s. מחוץ למכסה: %s. עדכונים: %s.' % (
            c.get('pending_total', 0), c.get('backlog_total', 0), c.get('updated', 0)))
        if drafts:
            L.append('')
            for d in drafts[:14]:
                L.append('* %s עדיפות %s, %s. מזהה %s' % (
                    _safe(d['facts']['title'], 90), d.get('priority'),
                    'מומלץ' if d['decision'] == 'ACCEPT_FOR_DRAFT' else 'להחלטה', _safe(d['fingerprint'], 40)))
        if repo:
            L.append('')
            L.append('דוח מלא: https://github.com/%s/blob/main/runs/%s/report.md' % (repo, run_id))
        L.append('')
        L.append('החלטה על פריט נרשמת ב-workflow בשם golondon-news-decide. זו בחירה לניסוח בלבד: '
                 'פרסום עובר רק דרך האישור של DS AI Operations.')
    if run_url:
        L.append('')
        L.append('יומן הריצה: %s' % run_url)
    return True, '\n'.join(L) + '\n'


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('--stdout', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--exit-code', type=int, required=True)
    p.add_argument('--repo')
    p.add_argument('--run-url')
    p.add_argument('--fallback-id')
    p.add_argument('--body-file', required=True)
    a = p.parse_args(argv)
    summary = _last_json(a.stdout)
    drafts = None
    if summary and summary.get('run_id'):
        hits = glob.glob(os.path.join(a.out, summary['run_id'], 'drafts.json'))
        if hits:
            with open(hits[0], encoding='utf-8') as f:
                drafts = json.load(f).get('drafts')
    post, body = build(summary, a.exit_code, drafts, a.repo, a.run_url, a.fallback_id)
    if post:
        with open(a.body_file, 'w', encoding='utf-8') as f:
            f.write(body)
    print('post' if post else 'skip')
    return 0


if __name__ == '__main__':
    sys.exit(main())
