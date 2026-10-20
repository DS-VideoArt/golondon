# -*- coding: utf-8 -*-
"""
נקודת ההרצה היחידה של איסוף החדשות. מתאימה גם לחיבור עתידי ל-DS AI Operations:
קלט בדגלים, פלט בתיקייה אחת, סיכום JSON בשורה האחרונה של stdout כשמבקשים --json,
וקוד יציאה קבוע.

    python3 news_pipeline/run.py --slot manual
    python3 news_pipeline/run.py --slot morning --respect-slot --json
    python3 news_pipeline/run.py --fixtures news_pipeline/tests/fixtures/basic --now 2026-10-20T05:00:00Z

פלט בתיקייה <out>/<run_id>/:
    drafts.json     טיוטות שהומלצו או ממתינות להחלטה, עם הסבר מלא לכל אחת
    decisions.json  כל מועמד שנבדק, כולל הנפסלים והסיבה
    report.md       דוח קריא בעברית
    run.json        תקציר הריצה ומבנה handoff לאישור בעלים

קודי יציאה: 0 הריצה הושלמה (כולל "אין מה לפרסם" ו"לא הזמן של החלון"),
            1 שגיאת שימוש, 2 כל המקורות נכשלו.

מה הסקריפט לא עושה בשום מצב: לא כותב ל-whats-new.json, למרשם, ל-index.html או לשום קובץ של
האתר. לא מפרסם. לא קורא למודל שפה. לא משתמש בשירות בתשלום.
"""
import argparse, datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
if REPO not in sys.path:
    sys.path.insert(0, REPO)

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    sys.exit('Python 3.9 or newer is required (zoneinfo)')

PHASE = 'phase0.1'
PENDING, BACKLOG = 'PENDING', 'BACKLOG'   # החלטות תור, בנוסף ל-ACCEPT, HOLD ו-REJECT של scoring
EXIT_OK, EXIT_USAGE, EXIT_ALL_FAILED = 0, 1, 2


def slot_due(slot, now_utc):
    """האם עכשיו השעה של החלון לפי שעון ישראל. מאפשר תזמון ב-UTC בשתי שעות, שאחת מהן תמיד נכונה."""
    from news_pipeline import config
    if slot not in config.SLOT_HOURS:
        return True
    return now_utc.astimezone(ZoneInfo(config.RUN_TZ)).hour == config.SLOT_HOURS[slot]


def _load_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _write_json(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1, default=str)
    os.replace(tmp, path)


def run(argv=None, fetcher=None):
    p = argparse.ArgumentParser(description='GoLondon news beta, phase 0: drafts for review only')
    p.add_argument('--slot', choices=['morning', 'evening', 'manual'], default='manual')
    p.add_argument('--mode', default='draft', help='only "draft" exists in phase 0')
    p.add_argument('--respect-slot', action='store_true', help='skip unless it is the slot hour in Asia/Jerusalem')
    p.add_argument('--now', help='ISO time for reproducible runs, e.g. 2026-10-20T05:00:00Z')
    p.add_argument('--fixtures', help='read local fixture files instead of the network')
    p.add_argument('--sources', help='comma separated source ids (default: all)')
    p.add_argument('--out', default=os.path.join(HERE, 'out'))
    p.add_argument('--state', default=os.path.join(HERE, 'state'))
    p.add_argument('--registry', help='registry JSON to classify against (default: whats-new-registry.json, read only)')
    p.add_argument('--no-state-write', action='store_true')
    p.add_argument('--json', action='store_true', help='print a one line JSON summary at the end')
    p.add_argument('--decide', action='append', metavar='ID=approve|reject',
                   help='record an owner decision on a queued item (full id or unique prefix) and exit; no fetching')
    a = p.parse_args(argv)

    if a.mode != 'draft':
        print('mode %r is not available in phase 0. Only drafts for review exist; publishing needs an approved next phase.' % a.mode,
              file=sys.stderr)
        return EXIT_USAGE

    out_root, state_dir = os.path.abspath(a.out), os.path.abspath(a.state)
    fixtures = os.path.abspath(a.fixtures) if a.fixtures else None
    registry_path = os.path.abspath(a.registry) if a.registry else None

    # הייבוא כאן, אחרי שכל הנתיבים נפתרו: whats_new_dedup משנה את תיקיית העבודה בזמן הייבוא
    import whats_new_dedup as dedup
    from news_pipeline import config, drafts as drafts_mod, factcheck, ledger, priority as priority_mod, scoring, sources as S
    from news_pipeline.fetch import FixtureFetcher, LiveFetcher, SourceError

    now = (datetime.datetime.fromisoformat(a.now.replace('Z', '+00:00')) if a.now
           else datetime.datetime.now(datetime.timezone.utc)).astimezone(datetime.timezone.utc)
    local = now.astimezone(ZoneInfo(config.RUN_TZ))
    today = now.astimezone(ZoneInfo(config.LONDON_TZ)).date()
    run_id = '%s-%s' % (local.strftime('%Y%m%d-%H%M%S'), a.slot)

    summary = {'run_id': run_id, 'phase': PHASE, 'slot': a.slot, 'mode': 'draft',
               'started_utc': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'started_local': local.strftime('%Y-%m-%d %H:%M %Z'),
               'today_london': today.isoformat()}

    state_file = os.path.join(state_dir, 'state.json')
    if a.decide:
        # החלטת בעלים: מעדכנת רק את זיכרון התור המקומי. לא מפרסמת ולא כותבת לשום קובץ של האתר
        state = _load_json(state_file, {})
        items = ledger.load(state)
        for spec in a.decide:
            ref, _, verdict = spec.partition('=')
            if verdict not in ('approve', 'reject'):
                print('bad --decide %r, expected ID=approve or ID=reject' % spec, file=sys.stderr)
                return EXIT_USAGE
            try:
                rec = ledger.decide(items, ref.strip(), verdict, summary['started_utc'])
            except KeyError as e:
                print('cannot decide %r: %s' % (ref, e), file=sys.stderr)
                return EXIT_USAGE
            print('%s: %s -> %s' % (rec['fingerprint'], rec['title'], rec['status']))
        os.makedirs(state_dir, exist_ok=True)
        _write_json(state_file, state)
        return EXIT_OK

    if a.respect_slot and not slot_due(a.slot, now):
        summary.update(outcome='skipped_not_due', detail='local hour %d is not the %s slot hour %d' % (
            local.hour, a.slot, config.SLOT_HOURS[a.slot]))
        print('skipped: %s' % summary['detail'])
        if a.json:
            print(json.dumps(summary, ensure_ascii=False))
        return EXIT_OK

    fetcher = fetcher or (FixtureFetcher(fixtures) if fixtures else LiveFetcher())
    wanted = [s.strip() for s in a.sources.split(',')] if a.sources else None
    if wanted and set(wanted) - set(S.BY_ID):
        print('unknown sources: %s' % sorted(set(wanted) - set(S.BY_ID)), file=sys.stderr)
        return EXIT_USAGE

    state = _load_json(state_file, {'items': {}, 'govuk_watch': {}})
    registry = _load_json(registry_path, {'published': []})['published'] if registry_path else None
    ctx = {'now': now, 'today': today, 'verified_at': summary['started_utc'], 'state': state}

    # 1. איסוף
    src_report, candidates = [], []
    for s in S.ALL:
        if wanted and s['id'] not in wanted:
            continue
        entry = {'id': s['id'], 'name': s['name'], 'url': s['url'], 'licence': s.get('licence'),
                 'terms': s.get('terms'), 'status': 'ok', 'detail': '', 'candidates': 0}
        try:
            got = s['collect'](fetcher, ctx)
            entry['candidates'] = len(got)
            skipped = ctx.get('filtered', {}).get(s['id'])
            if skipped:
                entry['detail'] = '%d entries skipped as not about entry to the UK' % len(skipped)
            candidates.extend(got)
        except SourceError as e:
            entry.update(status=e.kind, detail=e.detail)
        except Exception as e:  # מקור אחד שבור לא מפיל את כל הריצה
            entry.update(status='parse_error', detail='%s: %s' % (type(e).__name__, e))
        src_report.append(entry)

    # 2. סיווג, בדיקת עובדות וכשירות. ההיסטוריה של כל פריט מגיעה מזיכרון התור
    items = ledger.load(state)
    run_seen, results = [], []
    for c in candidates:
        fp = c['fingerprint']
        hist = items.get(fp)
        others = [r for f_, r in items.items() if f_ != fp and r['status'] in ledger.DEDUP_STATUSES] + run_seen
        cls = dedup.classify(c, today=today, registry=registry, drafted=others)
        life = ledger.lifecycle(hist)
        shown_cls = cls
        if hist:
            own = dedup.classify(c, today=today, registry=[], drafted=[hist])
            if own['verdict'] in (dedup.UPDATE, dedup.CANCELLATION):
                cls = shown_cls = own
                # רק פריט שכבר הוצג לאדם חוזר אוטומטית כשהוא משתנה. פריט מהתור נשאר בתור
                if hist['status'] in (ledger.PENDING, ledger.APPROVED, ledger.REJECTED_OWNER):
                    life = 'updated'
            elif own['verdict'] == dedup.DUPLICATE and cls['verdict'] == dedup.NEW:
                shown_cls = dict(own, reason='כבר מוכר מהריצה %s (%s)' % (hist.get('first_seen_run'), ledger.LIFECYCLE_HE[life]))
        fact = factcheck.verify_candidate(c)
        total, br, reasons = scoring.score(c, cls, today, now)
        rej, hold = scoring.gates(c, cls, fact, today, now)
        decision = scoring.decide(total, rej, hold, br['tourist_relevance'])
        prio, pbr, pnotes = priority_mod.priority(c, today)
        main = None if decision != scoring.REJECT else scoring.why_not(total, rej, br['tourist_relevance'])
        if decision != scoring.REJECT and life in ('approved', 'rejected_owner'):
            decision = scoring.REJECT
            main = '%s ב-%s, ולא השתנה מאז' % (ledger.LIFECYCLE_HE[life], (hist.get('decided') or {}).get('at', ''))
        if decision != scoring.REJECT:
            run_seen.append(dedup.draft_record(dict(c, drafted_on=today.isoformat()), run_id))
        results.append({'candidate': c, 'classification': {k: v for k, v in shown_cls.items() if k != 'matched'},
                        'matched': (shown_cls.get('matched') or {}).get('title'), 'fact_check': fact,
                        'score': total, 'score_breakdown': br, 'reasons': reasons,
                        'priority': prio, 'priority_breakdown': pbr, 'priority_notes': pnotes,
                        'queue': {'lifecycle': life, 'first_seen': (hist or {}).get('first_seen') or today.isoformat(),
                                  'first_seen_run': (hist or {}).get('first_seen_run') or run_id},
                        'reject_reasons': rej, 'hold_reasons': hold, 'decision': decision, 'main_reason': main})

    # 3. התור. פריט ממתין נשאר ממתין ותופס מקום. מקומות פנויים מתמלאים לפי סדר העדיפות,
    #    מתוך פריטים חדשים ופריטים שחיכו בתור. עדכון מהותי מוצג תמיד. דחוף במיוחד נכנס גם לתור מלא
    seen_fps = {r['candidate']['fingerprint'] for r in results}
    dropped = []
    for r in results:
        if r['queue']['lifecycle'] == 'pending':
            if r['decision'] == scoring.REJECT:
                dropped.append(r)
                r['queue']['left_queue'] = r['main_reason']
            else:
                r['decision'] = PENDING
                r['main_reason'] = None
    dropped_unseen = ledger.expire_unseen(items, seen_fps, today)

    pending_recs = [rec for rec in items.values() if rec['status'] == ledger.PENDING
                    and rec['fingerprint'] not in {r['candidate']['fingerprint'] for r in dropped}]
    n_acc = sum(1 for rec in pending_recs if rec.get('shown_decision') == scoring.ACCEPT)
    n_hold = len(pending_recs) - n_acc
    per_acc, per_hold = {}, {}
    for rec in pending_recs:
        bucket = per_acc if rec.get('shown_decision') == scoring.ACCEPT else per_hold
        bucket[rec.get('source_id')] = bucket.get(rec.get('source_id'), 0) + 1

    contenders = sorted((r for r in results if r['decision'] in (scoring.ACCEPT, scoring.HOLD)),
                        key=lambda r: (-r['priority'], r['candidate']['fingerprint']))
    urgent_used = 0
    for r in contenders:
        sid = r['candidate']['source_id']
        life = r['queue']['lifecycle']
        if life == 'updated':
            r['queue']['admitted'] = 'update'
            continue
        if (r['decision'] == scoring.ACCEPT and n_acc < config.MAX_ACCEPT_PER_RUN
                and per_acc.get(sid, 0) < config.MAX_ACCEPT_PER_SOURCE):
            n_acc += 1
            per_acc[sid] = per_acc.get(sid, 0) + 1
            r['queue']['admitted'] = 'slot'
            continue
        if n_hold < config.MAX_HOLD_PER_RUN and per_hold.get(sid, 0) < config.MAX_HOLD_PER_SOURCE:
            if r['decision'] == scoring.ACCEPT:
                r['decision'] = scoring.HOLD
                r['hold_reasons'].append('עבר את הסף, אבל אין מקום פנוי בהמלצות (%d בסך הכול, %d לכל מקור, כולל מה שממתין)' % (
                    config.MAX_ACCEPT_PER_RUN, config.MAX_ACCEPT_PER_SOURCE))
            n_hold += 1
            per_hold[sid] = per_hold.get(sid, 0) + 1
            r['queue']['admitted'] = 'slot'
            continue
        if r['priority'] >= config.URGENT_PRIORITY and urgent_used < config.MAX_URGENT_OVER_CAP:
            urgent_used += 1
            r['queue']['admitted'] = 'urgent'
            r['hold_reasons'].append('עדיפות %d: נכנס לתור גם מעבר למכסה' % r['priority'])
            continue
        r['decision'] = BACKLOG
        r['main_reason'] = 'כשיר, אבל התור מלא. נשאר בתור ההמתנה מאז %s, ולא יוצג כחדש' % r['queue']['first_seen']

    # 4. עדכון הזיכרון
    for r in results:
        c, d, life = r['candidate'], r['decision'], r['queue']['lifecycle']
        if d in (scoring.ACCEPT, scoring.HOLD):
            ledger.upsert(items, c, ledger.PENDING, run_id, today, shown_run=run_id, shown_decision=d,
                          priority=r['priority'])
        elif d == PENDING:
            ledger.upsert(items, c, ledger.PENDING, run_id, today, priority=r['priority'])
        elif d == BACKLOG:
            ledger.upsert(items, c, ledger.BACKLOG, run_id, today, priority=r['priority'])
        elif life in ('approved', 'rejected_owner'):
            items[c['fingerprint']]['last_seen'] = today.isoformat()
        elif life == 'pending':
            ledger.upsert(items, c, ledger.EXPIRED, run_id, today, expired_reason=r['main_reason'])
        else:
            ledger.upsert(items, c, ledger.REJECTED_RULES, run_id, today)
    ledger.forget_old(items, today)
    queue_left = [{'title': r['candidate']['title'], 'reason': r['main_reason']} for r in dropped] + \
                 [{'title': rec['title'], 'reason': rec['expired_reason']} for rec in dropped_unseen]
    pending_unseen = [rec for rec in items.values() if rec['status'] == ledger.PENDING and rec['fingerprint'] not in seen_fps]

    drafts = drafts_mod.build(results, today)
    queue_view = drafts_mod.queue_view(results, pending_unseen, queue_left)
    ok_sources = [s for s in src_report if s['status'] == 'ok']
    if src_report and not ok_sources:
        outcome = 'all_sources_failed'
    elif not drafts:
        outcome = 'nothing_to_publish'
    else:
        outcome = 'drafts_ready'

    counts = {d: sum(1 for r in results if r['decision'] == d)
              for d in (scoring.ACCEPT, scoring.HOLD, PENDING, BACKLOG, scoring.REJECT)}
    counts.update(new_admitted=sum(1 for r in results if r['decision'] in (scoring.ACCEPT, scoring.HOLD)
                                   and r['queue']['lifecycle'] == 'new'),
                  updated=sum(1 for r in results if r['queue'].get('admitted') == 'update'),
                  from_backlog=sum(1 for r in results if r['decision'] in (scoring.ACCEPT, scoring.HOLD)
                                   and r['queue']['lifecycle'] in ('backlog', 'known')),
                  pending_total=sum(1 for rec in items.values() if rec['status'] == ledger.PENDING),
                  backlog_total=sum(1 for rec in items.values() if rec['status'] == ledger.BACKLOG),
                  left_queue=len(queue_left))
    summary.update({
        'outcome': outcome, 'fetch_mode': fetcher.mode,
        'sources': [{k: s[k] for k in ('id', 'status', 'candidates', 'detail')} for s in src_report],
        'counts': dict(counts, candidates=len(results), drafts=len(drafts)),
        'finished_utc': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'handoff': {
            'type': 'golondon_news_drafts', 'requires_owner_approval': True, 'approval_decision': None,
            'publish_allowed': False, 'drafts_file': 'drafts.json', 'report_file': 'report.md',
            'next_action': 'owner reviews drafts.json; nothing is published by this run',
        },
    })

    out_dir = os.path.join(out_root, run_id)
    os.makedirs(out_dir, exist_ok=True)
    _write_json(os.path.join(out_dir, 'drafts.json'), dict({'run_id': run_id, 'drafts': drafts}, **queue_view))
    _write_json(os.path.join(out_dir, 'decisions.json'), {'run_id': run_id, 'results': results})
    _write_json(os.path.join(out_dir, 'run.json'), dict(summary, fetch_log=fetcher.log))
    with open(os.path.join(out_dir, 'report.md'), 'w', encoding='utf-8') as f:
        f.write(drafts_mod.report(summary, src_report, results, drafts, queue_view))

    if not a.no_state_write:
        os.makedirs(state_dir, exist_ok=True)
        _write_json(state_file, state)

    print('%s: %s, %d candidates, %d new for review (%d accept, %d hold), %d pending, %d in backlog, output %s' % (
        run_id, outcome, len(results), len(drafts), counts[scoring.ACCEPT], counts[scoring.HOLD],
        counts['pending_total'], counts['backlog_total'], out_dir))
    if a.json:
        print(json.dumps(dict(summary, out_dir=out_dir), ensure_ascii=False))
    return EXIT_ALL_FAILED if outcome == 'all_sources_failed' else EXIT_OK


if __name__ == '__main__':
    sys.exit(run())
