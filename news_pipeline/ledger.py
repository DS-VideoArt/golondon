# -*- coding: utf-8 -*-
"""
זיכרון התור בין ריצות. לכל פריט (fingerprint) יש סטטוס אחד:

  pending         הוצג לבדיקה וממתין להחלטה. נשאר בתור ותופס מקום עד החלטה, עדכון או תפוגה
  backlog         כשיר, אבל לא הוצג בגלל המכסה. בריצה הבאה הוא "ממתין בתור", לא "חדש"
  rejected_rules  נפסל לפי הכללים. נבדק שוב בכל ריצה, כי הזמן משנה כשירות, אבל לעולם לא נחשב חדש
  approved        אושר על ידי הבעלים. לא מוצג שוב, אלא אם השתנה מהותית
  rejected_owner  נדחה על ידי הבעלים. לא מוצג שוב, אלא אם השתנה מהותית
  expired         יצא מהתור כי פג תוקפו או כי כבר אינו כשיר

מצב הריצה (lifecycle) נגזר מכאן: new, pending, backlog, known, updated, approved, rejected_owner.
"""
import datetime

import whats_new_dedup as dedup

PENDING, BACKLOG, REJECTED_RULES = 'pending', 'backlog', 'rejected_rules'
APPROVED, REJECTED_OWNER, EXPIRED = 'approved', 'rejected_owner', 'expired'
STATUSES = (PENDING, BACKLOG, REJECTED_RULES, APPROVED, REJECTED_OWNER, EXPIRED)
# רשומות שמשמשות לזיהוי כפילויות מול פריטים אחרים
DEDUP_STATUSES = (PENDING, BACKLOG, APPROVED, REJECTED_OWNER)
FORGET_DAYS = 30

LIFECYCLE_HE = {
    'new': 'חדש, התגלה בריצה הזו',
    'updated': 'עודכן מהותית אחרי שכבר נבדק',
    'pending': 'ממתין להחלטה מריצה קודמת',
    'backlog': 'חיכה בתור מחוץ למכסה',
    'known': 'מוכר מריצה קודמת, נכנס עכשיו לכשירות',
    'approved': 'כבר אושר',
    'rejected_owner': 'נדחה על ידי הבעלים',
    'expired': 'יצא מהתור בעבר',
}


def load(state):
    """מחזיר את מילון הפריטים, וממיר את המבנה של שלב 0 (רשימת drafted) אם צריך."""
    items = state.get('items')
    if items is None:
        items = {}
        for d in state.get('drafted', []):
            rec = dict(d, status=PENDING, first_seen=d.get('datePublished'), first_seen_run=d.get('run_id'),
                       shown_run=d.get('run_id'), shown_decision='HOLD_FOR_REVIEW')
            items[d['fingerprint']] = rec
    state.pop('drafted', None)
    state['items'] = items
    return items


def lifecycle(hist):
    if not hist:
        return 'new'
    return {PENDING: 'pending', BACKLOG: 'backlog', REJECTED_RULES: 'known', EXPIRED: 'known',
            APPROVED: 'approved', REJECTED_OWNER: 'rejected_owner'}[hist['status']]


def upsert(items, c, status, run_id, today, **extra):
    fp = c['fingerprint']
    old = items.get(fp, {})
    c['drafted_on'] = old.get('first_seen') or today.isoformat()
    rec = dedup.draft_record(c, run_id)
    rec.update({
        'status': status,
        'first_seen': old.get('first_seen') or today.isoformat(),
        'first_seen_run': old.get('first_seen_run') or run_id,
        'last_seen': today.isoformat(),
        'last_seen_run': run_id,
        'valid_to': c.get('valid_to'),
        'item_url': c.get('item_url'),
    })
    for k in ('shown_run', 'shown_decision', 'decided', 'priority'):
        if k in old:
            rec[k] = old[k]
    rec.update(extra)
    items[fp] = rec
    return rec


def expire_unseen(items, seen_fps, today):
    """פריט ממתין שלא נראה בריצה ופג תוקפו, יוצא מהתור. פריט שלא נראה אבל עדיין בתוקף נשאר."""
    out = []
    for fp, rec in items.items():
        if fp in seen_fps or rec['status'] != PENDING:
            continue
        vt = rec.get('valid_to')
        if vt and datetime.date.fromisoformat(vt) < today:
            rec['status'] = EXPIRED
            rec['expired_reason'] = 'התוקף הסתיים ב-%s' % vt
            out.append(rec)
    return out


def forget_old(items, today):
    """רשומות שאינן ממתינות ולא נראו 30 יום נמחקות מהזיכרון. החלטות בעלים נשמרות."""
    cutoff = (today - datetime.timedelta(days=FORGET_DAYS)).isoformat()
    for fp in [fp for fp, r in items.items()
               if r['status'] in (BACKLOG, REJECTED_RULES, EXPIRED) and (r.get('last_seen') or '') < cutoff]:
        del items[fp]


def decide(items, ref, decision, when):
    """החלטת בעלים על פריט לפי fingerprint מלא או תחילית ייחודית."""
    hits = [fp for fp in items if fp == ref] or [fp for fp in items if fp.startswith(ref)]
    if len(hits) != 1:
        raise KeyError('%d items match %r' % (len(hits), ref))
    rec = items[hits[0]]
    rec['status'] = {'approve': APPROVED, 'reject': REJECTED_OWNER}[decision]
    rec['decided'] = {'decision': decision, 'at': when}
    return rec
