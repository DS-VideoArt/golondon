# -*- coding: utf-8 -*-
"""
הרצה מלאה על קבצי בדיקה, בלי רשת: מקורות, סיווג, דירוג, טיוטות, דוח, זיכרון בין ריצות,
ממשק ההרצה, קודי יציאה ושמירה על כך ששום קובץ של האתר לא משתנה.
"""
import datetime, glob, hashlib, json, os, re, shutil, socket, tempfile, unittest, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
BASIC = os.path.join(HERE, 'fixtures', 'basic')
QUIET = os.path.join(HERE, 'fixtures', 'quiet')
NOW = '2026-10-20T05:00:00Z'      # 08:00 בישראל

from news_pipeline import run as runner  # noqa: E402

SITE_FILES = ['whats-new.json', 'whats-new-registry.json', 'index.html', 'whats-new.html', 'sitemap.xml']


def md5s():
    out = {}
    for f in SITE_FILES:
        with open(os.path.join(REPO, f), 'rb') as fh:
            out[f] = hashlib.md5(fh.read()).hexdigest()
    return out


class NoNetwork:
    """כל ניסיון לפתוח חיבור במהלך בדיקה נכשל מיד."""

    def __enter__(self):
        self.urlopen, self.conn = urllib.request.urlopen, socket.create_connection

        def boom(*a, **k):
            raise AssertionError('network access during an offline test')
        urllib.request.urlopen = boom
        socket.create_connection = boom
        return self

    def __exit__(self, *a):
        urllib.request.urlopen, socket.create_connection = self.urlopen, self.conn


class PipelineTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='news-test-')
        self.out = os.path.join(self.tmp, 'out')
        self.state = os.path.join(self.tmp, 'state')
        self.registry = os.path.join(self.tmp, 'registry.json')
        self.write_registry([])

    def write_registry(self, published):
        with open(self.registry, 'w', encoding='utf-8') as f:
            json.dump({'published': published}, f, ensure_ascii=False)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def go(self, fixtures=BASIC, extra=(), now=NOW):
        args = ['--fixtures', fixtures, '--now', now, '--out', self.out, '--state', self.state,
                '--registry', self.registry] + list(extra)
        with NoNetwork():
            code = runner.run(args)
        runs = sorted(glob.glob(os.path.join(self.out, '*')), key=os.path.getmtime)
        d = runs[-1] if runs else None
        def read(n):
            with open(os.path.join(d, n), encoding='utf-8') as f:
                return f.read()
        if not d:
            return code, None, None, None, ''
        return (code, json.loads(read('run.json')), json.loads(read('decisions.json')),
                json.loads(read('drafts.json')), read('report.md'))

    @staticmethod
    def edit(path, old, new):
        with open(path, encoding='utf-8') as f:
            html = f.read()
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html.replace(old, new))

    def by_title(self, decisions, title):
        return next(r for r in decisions['results'] if r['candidate']['title'].startswith(title))

    # ------------------------------------------------------------------

    def test_basic_run_produces_explained_drafts(self):
        before = md5s()
        code, run, dec, drafts, report = self.go()
        self.assertEqual(code, 0)
        self.assertEqual(run['outcome'], 'drafts_ready')
        self.assertEqual(run['fetch_mode'], 'fixtures')
        self.assertFalse(run['handoff']['publish_allowed'])
        self.assertTrue(run['handoff']['requires_owner_approval'])
        for d in drafts['drafts']:
            self.assertTrue(d['why'], d['facts']['title'])
            self.assertTrue(d['fact_check']['passed'])
            self.assertIn('title', d['missing_fields'])
            item = d['proposed_whats_new_item']
            self.assertIsNone(item['title'])
            self.assertIsNone(item['summary'])
            self.assertIsNone(item['body'])
        for r in dec['results']:
            if r['decision'] == 'REJECT':
                self.assertTrue(r['main_reason'], r['candidate']['title'])
        self.assertEqual(before, md5s(), 'a site file changed')

    def test_positive_content_is_found_not_only_disruptions(self):
        _, run, dec, drafts, _ = self.go()
        groups = {d['facts']['kind'] for d in drafts['drafts'] if d['decision'] == 'ACCEPT_FOR_DRAFT'}
        self.assertIn('exhibition', groups)
        self.assertIn('event', groups)
        self.assertEqual(self.by_title(dec, 'Bright Lights')['decision'], 'ACCEPT_FOR_DRAFT')
        self.assertEqual(self.by_title(dec, 'Half Term Halloween Trail')['decision'], 'ACCEPT_FOR_DRAFT')
        self.assertEqual(self.by_title(dec, 'Piccadilly')['decision'], 'ACCEPT_FOR_DRAFT')

    def test_duplicate_listing_in_same_page_counted_once(self):
        _, _, dec, _, _ = self.go()
        self.assertEqual(sum(1 for r in dec['results'] if r['candidate']['title'].startswith('Bright Lights')), 1)

    def test_second_run_marks_everything_as_duplicate_and_has_nothing_to_publish(self):
        self.go()
        code, run, dec, drafts, report = self.go(now='2026-10-20T16:00:00Z')
        self.assertEqual(code, 0)
        self.assertEqual(run['outcome'], 'nothing_to_publish')
        self.assertEqual(drafts['drafts'], [])
        verdicts = {r['classification']['verdict'] for r in dec['results'] if r['candidate']['source_id'] == 'vam_whatson'
                    and r['candidate']['title'].startswith('Costumes')}
        self.assertEqual(verdicts, {'DUPLICATE'})
        self.assertIn('אין מה לפרסם', report)

    def test_update_detected_on_next_run(self):
        self.go()
        alt = os.path.join(self.tmp, 'alt')
        shutil.copytree(BASIC, alt)
        p = os.path.join(alt, 'tate_whatson.html')
        self.edit(p, '12 Nov 2026 – 11 Apr 2027', '12 Nov 2026 – 30 May 2027')
        _, _, dec, _, _ = self.go(fixtures=alt, now='2026-10-20T16:00:00Z')
        r = self.by_title(dec, 'Bright Lights')
        self.assertEqual(r['classification']['verdict'], 'UPDATE')
        self.assertEqual(r['decision'], 'HOLD_FOR_REVIEW')
        self.assertTrue(any('valid_to' in c for c in r['classification']['changes']))

    def test_cancelled_item(self):
        _, _, dec, _, _ = self.go()
        r = self.by_title(dec, 'Cancelled: Family Lantern Festival')
        self.assertEqual(r['candidate']['status'], 'cancelled')
        self.assertEqual(r['classification']['verdict'], 'CANCELLATION')
        self.assertNotEqual(r['decision'], 'ACCEPT_FOR_DRAFT')

    def test_cancellation_after_draft(self):
        self.go()
        alt = os.path.join(self.tmp, 'alt')
        shutil.copytree(BASIC, alt)
        p = os.path.join(alt, 'tate_whatson.html')
        self.edit(p, 'Light installations for the darker months',
                  'Light installations for the darker months. This exhibition has been postponed')
        _, _, dec, _, _ = self.go(fixtures=alt, now='2026-10-20T16:00:00Z')
        r = self.by_title(dec, 'Bright Lights')
        self.assertEqual((r['classification']['verdict'], r['candidate']['status']), ('CANCELLATION', 'postponed'))
        self.assertEqual(r['decision'], 'HOLD_FOR_REVIEW')

    def test_expired_item_rejected(self):
        _, _, dec, _, _ = self.go()
        r = self.by_title(dec, 'Early October Family Day')
        self.assertEqual(r['classification']['verdict'], 'EXPIRED')
        self.assertEqual(r['decision'], 'REJECT')

    def test_duplicate_of_published_item(self):
        self.write_registry([{
            'id': 'x', 'title': 'מבחן', 'datePublished': '2026-10-10',
            'sourceUrls': ['https://www.tate.org.uk/whats-on/tate-modern/bright-lights'],
            'entity': 'Bright Lights', 'entityNorm': 'bright lights', 'summaryNorm': ''}])
        _, _, dec, _, _ = self.go()
        r = self.by_title(dec, 'Bright Lights')
        self.assertEqual((r['classification']['verdict'], r['decision']), ('DUPLICATE', 'REJECT'))

    def test_live_status_always_rejected(self):
        _, _, dec, _, _ = self.go()
        r = self.by_title(dec, 'Central: Severe Delays')
        self.assertEqual(r['decision'], 'REJECT')
        self.assertIn('TfL', r['main_reason'])

    def test_sensitive_topic_held(self):
        _, _, dec, _, _ = self.go()
        r = self.by_title(dec, 'Protest Banners')
        self.assertEqual(r['decision'], 'HOLD_FOR_REVIEW')
        self.assertTrue(any('רגיש' in h for h in r['hold_reasons']))

    def test_missing_dates_are_not_filled(self):
        _, _, dec, drafts, _ = self.go()
        r = self.by_title(dec, 'Storehouse Spotlight')
        self.assertEqual(r['decision'], 'HOLD_FOR_REVIEW')
        self.assertIsNone(r['candidate']['valid_from'])
        self.assertIsNone(r['candidate']['valid_to'])
        d = next(d for d in drafts['drafts'] if d['facts']['title'] == 'Storehouse Spotlight')
        self.assertNotIn('event_start', d['proposed_whats_new_item'])

    def test_entry_rule_change_without_description_is_held(self):
        _, _, dec, _, _ = self.go()
        r = self.by_title(dec, 'GOV.UK updated: Bringing goods')
        self.assertEqual(r['decision'], 'HOLD_FOR_REVIEW')
        self.assertTrue(any('אסור לנחש' in h for h in r['hold_reasons']))

    def test_low_relevance_rejected(self):
        _, _, dec, _, _ = self.go()
        for t in ('Windrush: Part Closure', 'Evening Talk', 'Autumn Tennis Courses', 'Far Future Survey', 'Long Running Display'):
            self.assertEqual(self.by_title(dec, t)['decision'], 'REJECT', t)

    def test_quiet_day_has_nothing_to_publish(self):
        code, run, dec, drafts, report = self.go(fixtures=QUIET)
        self.assertEqual(code, 0)
        self.assertEqual(run['outcome'], 'nothing_to_publish')
        self.assertEqual(drafts['drafts'], [])
        self.assertIn('אין מה לפרסם', report)

    def test_one_source_failing_does_not_stop_the_run(self):
        alt = os.path.join(self.tmp, 'alt')
        shutil.copytree(BASIC, alt)
        os.remove(os.path.join(alt, 'tate_whatson.html'))
        code, run, _, _, report = self.go(fixtures=alt)
        self.assertEqual(code, 0)
        st = {s['id']: s['status'] for s in run['sources']}
        self.assertEqual(st['tate_whatson'], 'fixture_missing')
        self.assertEqual(st['vam_whatson'], 'ok')

    def test_broken_page_structure_is_a_failure_not_silence(self):
        alt = os.path.join(self.tmp, 'alt')
        shutil.copytree(BASIC, alt)
        with open(os.path.join(alt, 'tate_whatson.html'), 'w') as f:
            f.write('<html><body>new design</body></html>')
        _, run, _, _, _ = self.go(fixtures=alt)
        self.assertEqual({s['id']: s['status'] for s in run['sources']}['tate_whatson'], 'parse_error')

    def test_all_sources_failing_exits_2(self):
        empty = os.path.join(self.tmp, 'empty')
        os.makedirs(empty)
        code, run, _, _, report = self.go(fixtures=empty)
        self.assertEqual(code, 2)
        self.assertEqual(run['outcome'], 'all_sources_failed')
        self.assertIn('כל המקורות נכשלו', report)

    def test_publish_mode_does_not_exist(self):
        with NoNetwork():
            self.assertEqual(runner.run(['--mode', 'publish', '--fixtures', BASIC, '--out', self.out]), 1)
        self.assertFalse(os.path.exists(self.out))

    def test_no_state_write(self):
        self.go(extra=['--no-state-write'])
        self.assertFalse(os.path.exists(os.path.join(self.state, 'state.json')))

    def test_caps_limit_the_review_queue(self):
        from news_pipeline import config
        _, run, _, drafts, _ = self.go()
        acc = [d for d in drafts['drafts'] if d['decision'] == 'ACCEPT_FOR_DRAFT']
        self.assertLessEqual(len(acc), config.MAX_ACCEPT_PER_RUN)
        self.assertLessEqual(len(drafts['drafts']) - len(acc), config.MAX_HOLD_PER_RUN)

    def test_report_has_no_hebrew_dashes(self):
        _, _, _, _, report = self.go()
        for line in report.splitlines():
            prose = re.sub(r'`[^`]*`', '', line)
            if re.search(r'[֐-׿]', prose):
                self.assertNotIn('—', prose, line)
                self.assertNotIn('–', prose, line)
                self.assertNotIn(' - ', prose, line)


class SlotTest(unittest.TestCase):
    """שתי הרצות ביום לפי שעון ישראל, גם כשהשעון עובר לשעון חורף (25.10.2026 בישראל)."""

    def at(self, s):
        return datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))

    def test_summer_time(self):
        self.assertTrue(runner.slot_due('morning', self.at('2026-10-20T05:00:00Z')))    # 08:00 IDT
        self.assertFalse(runner.slot_due('morning', self.at('2026-10-20T06:00:00Z')))
        self.assertTrue(runner.slot_due('evening', self.at('2026-10-20T16:00:00Z')))    # 19:00 IDT

    def test_winter_time(self):
        self.assertFalse(runner.slot_due('morning', self.at('2026-10-26T05:00:00Z')))   # 07:00 IST
        self.assertTrue(runner.slot_due('morning', self.at('2026-10-26T06:00:00Z')))    # 08:00 IST
        self.assertTrue(runner.slot_due('evening', self.at('2026-10-26T17:00:00Z')))    # 19:00 IST

    def test_manual_always_due(self):
        self.assertTrue(runner.slot_due('manual', self.at('2026-10-26T03:17:00Z')))

    def test_respect_slot_skips_without_fetching(self):
        tmp = tempfile.mkdtemp()
        try:
            with NoNetwork():
                code = runner.run(['--slot', 'morning', '--respect-slot', '--now', '2026-10-26T05:00:00Z',
                                   '--out', os.path.join(tmp, 'out'), '--state', os.path.join(tmp, 's')])
            self.assertEqual(code, 0)
            self.assertFalse(os.path.exists(os.path.join(tmp, 'out')))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    unittest.main()
