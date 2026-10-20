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

PHASE = 'phase0'
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
    from news_pipeline import config, drafts as drafts_mod, factcheck, scoring, sources as S
    from news_pipeline.fetch import FixtureFetcher, LiveFetcher, SourceError

    now = (datetime.datetime.fromisoformat(a.now.replace('Z', '+00:00')) if a.now
           else datetime.datetime.now(datetime.timezone.utc)).astimezone(datetime.timezone.utc)
    local = now.astimezone(ZoneInfo(config.RUN_TZ))
    today = now.astimezone(ZoneInfo(config.LONDON_TZ)).date()
    run_id = '%s-%s' % (local.strftime('%Y%m%d-%H%M%S'), a.slot)

    summary = {'run_id': run_id, 'phase': PHASE, 'slot': a.slot, 'mode': 'draft',
               'started_utc': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'started_local': local.strftime('%Y-%m-%d %H:%M %Z'),
               'today_london': today.isoformat()}

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

    state_file = os.path.join(state_dir, 'state.json')
    state = _load_json(state_file, {'drafted': [], 'govuk_watch': {}})
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

    # 2. סיווג, בדיקת עובדות, דירוג והחלטה
    prior = list(state.get('drafted', []))
    seen = list(prior)          # לסיווג בתוך הריצה: כל מה שעבר עד עכשיו, לפני המכסה
    results = []
    for c in candidates:
        cls = dedup.classify(c, today=today, registry=registry, drafted=seen)
        fact = factcheck.verify_candidate(c)
        total, br, reasons = scoring.score(c, cls, today, now)
        rej, hold = scoring.gates(c, cls, fact, today, now)
        decision = scoring.decide(total, rej, hold, br['tourist_relevance'])
        if decision != scoring.REJECT:
            c['drafted_on'] = today.isoformat()
            seen.append(dedup.draft_record(c, run_id))
        results.append({'candidate': c, 'classification': {k: v for k, v in cls.items() if k != 'matched'},
                        'matched': (cls.get('matched') or {}).get('title'), 'fact_check': fact,
                        'score': total, 'score_breakdown': br, 'reasons': reasons,
                        'reject_reasons': rej, 'hold_reasons': hold, 'decision': decision,
                        'main_reason': None if decision != scoring.REJECT else scoring.why_not(total, rej, br['tourist_relevance'])})

    # מכסת התור: מה שמעבר למכסה לא נרשם בזיכרון, ולכן נבדק מחדש בריצה הבאה
    ranked = sorted((r for r in results if r['decision'] != scoring.REJECT),
                    key=lambda r: (-r['score'], -r['score_breakdown']['tourist_relevance']))
    n_acc = n_hold = 0
    per_acc, per_hold = {}, {}
    for r in ranked:
        sid = r['candidate']['source_id']
        if r['decision'] == scoring.ACCEPT:
            if n_acc < config.MAX_ACCEPT_PER_RUN and per_acc.get(sid, 0) < config.MAX_ACCEPT_PER_SOURCE:
                n_acc += 1
                per_acc[sid] = per_acc.get(sid, 0) + 1
                continue
            r['decision'] = scoring.HOLD
            r['hold_reasons'].append('עבר את הסף, אבל מעבר למכסת ההמלצות לריצה (%d בסך הכול, %d לכל מקור)' % (
                config.MAX_ACCEPT_PER_RUN, config.MAX_ACCEPT_PER_SOURCE))
        if n_hold < config.MAX_HOLD_PER_RUN and per_hold.get(sid, 0) < config.MAX_HOLD_PER_SOURCE:
            n_hold += 1
            per_hold[sid] = per_hold.get(sid, 0) + 1
            continue
        r['decision'] = scoring.REJECT
        r['main_reason'] = ('מעבר למכסת התור של הריצה (%d בסך הכול, %d לכל מקור). לא נרשם, וייבדק שוב בריצה הבאה'
                            % (config.MAX_HOLD_PER_RUN, config.MAX_HOLD_PER_SOURCE))
    drafted = prior
    for r in results:
        if r['decision'] != scoring.REJECT:
            rec = dedup.draft_record(r['candidate'], run_id)
            drafted = [d for d in drafted if d.get('fingerprint') != rec['fingerprint']] + [rec]

    drafts = drafts_mod.build(results, today)
    ok_sources = [s for s in src_report if s['status'] == 'ok']
    if src_report and not ok_sources:
        outcome = 'all_sources_failed'
    elif not drafts:
        outcome = 'nothing_to_publish'
    else:
        outcome = 'drafts_ready'

    counts = {d: sum(1 for r in results if r['decision'] == d) for d in (scoring.ACCEPT, scoring.HOLD, scoring.REJECT)}
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
    _write_json(os.path.join(out_dir, 'drafts.json'), {'run_id': run_id, 'drafts': drafts})
    _write_json(os.path.join(out_dir, 'decisions.json'), {'run_id': run_id, 'results': results})
    _write_json(os.path.join(out_dir, 'run.json'), dict(summary, fetch_log=fetcher.log))
    with open(os.path.join(out_dir, 'report.md'), 'w', encoding='utf-8') as f:
        f.write(drafts_mod.report(summary, src_report, results, drafts))

    if not a.no_state_write:
        os.makedirs(state_dir, exist_ok=True)
        state['drafted'] = drafted
        _write_json(state_file, state)

    print('%s: %s, %d candidates, %d drafts (%d accept, %d hold), output %s' % (
        run_id, outcome, len(results), len(drafts), counts[scoring.ACCEPT], counts[scoring.HOLD], out_dir))
    if a.json:
        print(json.dumps(dict(summary, out_dir=out_dir), ensure_ascii=False))
    return EXIT_ALL_FAILED if outcome == 'all_sources_failed' else EXIT_OK


if __name__ == '__main__':
    sys.exit(run())
