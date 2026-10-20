# -*- coding: utf-8 -*-
"""
שלב 0.3: מוכנות לענן. חלון גמיש, מזהה חלון ייחודי, הרצות כפולות ומאוחרות, שחזור, זיהוי פריט
שפורסם, טעינה מ-SHA נעוץ, הודעת ה-Issue, קובצי ה-workflow, ובטיחות מול Netlify.
"""
import datetime, glob, json, os, re, shutil, subprocess, sys, tempfile, unittest
from unittest import mock

from news_pipeline import config, ledger, notify, published, run as runner
from news_pipeline.store import FileStore, GitStore
from news_pipeline.tests.test_pipeline import BASIC, NoNetwork
from news_pipeline.tests.test_store import Cloud, git

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)
REPO = os.path.dirname(PKG)
CLOUD = os.path.join(PKG, 'cloud')
UTC = datetime.timezone.utc


def at(s):
    return datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))


class WindowTest(unittest.TestCase):

    def w(self, slot, s):
        return runner.slot_window(slot, at(s))

    def test_summer_both_crons_and_delays_belong_to_one_window(self):
        self.assertEqual(self.w('morning', '2026-10-20T05:00:00Z'), ('due', '2026-10-20-morning'))   # 08:00
        self.assertEqual(self.w('morning', '2026-10-20T06:00:00Z'), ('due', '2026-10-20-morning'))   # 09:00, cron שני
        self.assertEqual(self.w('morning', '2026-10-20T07:55:00Z'), ('due', '2026-10-20-morning'))   # 10:55, עיכוב
        self.assertEqual(self.w('morning', '2026-10-20T08:01:00Z'), ('late', '2026-10-20-morning'))  # 11:01
        self.assertEqual(self.w('evening', '2026-10-20T16:00:00Z'), ('due', '2026-10-20-evening'))   # 19:00
        self.assertEqual(self.w('evening', '2026-10-20T18:59:00Z'), ('due', '2026-10-20-evening'))   # 21:59

    def test_winter_first_cron_is_early_second_is_due(self):
        self.assertEqual(self.w('morning', '2026-10-26T05:00:00Z'), ('early', '2026-10-26-morning'))  # 07:00
        self.assertEqual(self.w('morning', '2026-10-26T06:00:00Z'), ('due', '2026-10-26-morning'))    # 08:00
        self.assertEqual(self.w('morning', '2026-10-26T08:59:00Z'), ('due', '2026-10-26-morning'))    # 10:59
        self.assertEqual(self.w('morning', '2026-10-26T09:00:00Z'), ('late', '2026-10-26-morning'))
        self.assertEqual(self.w('evening', '2026-10-26T16:00:00Z'), ('early', '2026-10-26-evening'))  # 18:00
        self.assertEqual(self.w('evening', '2026-10-26T17:00:00Z'), ('due', '2026-10-26-evening'))

    def test_clock_change_days(self):
        # 25.10.2026: ישראל עוברת לשעון חורף ב-02:00 בלילה
        self.assertEqual(self.w('morning', '2026-10-25T05:00:00Z')[0], 'early')
        self.assertEqual(self.w('morning', '2026-10-25T06:00:00Z')[0], 'due')
        self.assertEqual(self.w('evening', '2026-10-25T17:00:00Z')[0], 'due')
        # 27.3.2026: ישראל עוברת לשעון קיץ. שתי ההפעלות בתוך אותו חלון, עם אותו מזהה
        self.assertEqual(self.w('morning', '2026-03-27T05:00:00Z'), ('due', '2026-03-27-morning'))
        self.assertEqual(self.w('morning', '2026-03-27T06:00:00Z'), ('due', '2026-03-27-morning'))
        self.assertEqual(self.w('morning', '2026-03-26T05:00:00Z')[0], 'early')                       # 07:00 לפני המעבר

    def test_manual_has_no_window(self):
        self.assertEqual(self.w('manual', '2026-10-20T03:00:00Z'), ('manual', None))


class FileRunsMixin:

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='news-cloud-')
        self.state = os.path.join(self.tmp, 'state')
        self.registry = os.path.join(self.tmp, 'registry.json')
        self.whats_new = os.path.join(self.tmp, 'whats-new.json')
        self.write_json(self.registry, {'published': []})
        self.write_json(self.whats_new, {'items': []})
        self.n = 0

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    @staticmethod
    def write_json(path, data):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)

    def go(self, now, slot='manual', extra=(), fixtures=BASIC):
        self.n += 1
        out = os.path.join(self.tmp, 'out%d' % self.n)
        with NoNetwork():
            code = runner.run(['--fixtures', fixtures, '--now', now, '--slot', slot, '--state', self.state,
                               '--out', out, '--registry', self.registry, '--whats-new', self.whats_new] + list(extra))
        res = {'code': code}
        if os.path.isdir(out):
            d = glob.glob(os.path.join(out, '*'))[0]
            for n in ('run', 'drafts', 'decisions'):
                with open(os.path.join(d, n + '.json'), encoding='utf-8') as f:
                    res[n] = json.load(f)
            with open(os.path.join(d, 'report.md'), encoding='utf-8') as f:
                res['report'] = f.read()
        return res

    def state_json(self):
        with open(os.path.join(self.state, 'state.json'), encoding='utf-8') as f:
            return json.load(f)


class DuplicateAndLateRunsTest(FileRunsMixin, unittest.TestCase):

    def test_second_cron_of_the_same_window_is_skipped(self):
        first = self.go('2026-10-20T05:40:00Z', 'morning', ['--respect-slot'])    # 08:40, עיכוב
        self.assertEqual(first['code'], 0)
        self.assertEqual(first['run']['window_id'], '2026-10-20-morning')
        second = self.go('2026-10-20T06:07:00Z', 'morning', ['--respect-slot'])   # 09:07
        self.assertEqual(second, {'code': 0})                                       # אין פלט ואין איסוף
        runs = [r for r in self.state_json()['runs'] if r.get('slot_key') == '2026-10-20-morning']
        self.assertEqual([r['status'] for r in runs], ['completed'])

    def test_morning_and_evening_are_separate_windows(self):
        self.go('2026-10-20T05:00:00Z', 'morning', ['--respect-slot'])
        ev = self.go('2026-10-20T16:00:00Z', 'evening', ['--respect-slot'])
        self.assertEqual(ev['run']['window_id'], '2026-10-20-evening')
        self.assertEqual(ev['run']['outcome'], 'nothing_to_publish')
        nxt = self.go('2026-10-21T05:00:00Z', 'morning', ['--respect-slot'])
        self.assertEqual(nxt['run']['window_id'], '2026-10-21-morning')

    def test_run_beyond_the_grace_period_is_skipped_without_touching_state(self):
        late = self.go('2026-10-20T08:30:00Z', 'morning', ['--respect-slot'])     # 11:30
        self.assertEqual(late, {'code': 0})
        self.assertFalse(os.path.exists(os.path.join(self.state, 'state.json')))
        early = self.go('2026-10-26T05:00:00Z', 'morning', ['--respect-slot'])    # 07:00 בחורף
        self.assertEqual(early, {'code': 0})

    def test_crash_in_first_cron_is_retried_by_second_cron(self):
        with mock.patch('news_pipeline.drafts.build', side_effect=RuntimeError('boom')):
            with self.assertRaises(RuntimeError):
                self.go('2026-10-20T05:00:00Z', 'morning', ['--respect-slot'])
        st = self.state_json()
        self.assertIsNone(st['_lock'])
        self.assertEqual(st['runs'][-1]['status'], 'failed')
        retry = self.go('2026-10-20T06:02:00Z', 'morning', ['--respect-slot'])
        self.assertEqual(retry['run']['outcome'], 'drafts_ready')
        third = self.go('2026-10-20T07:10:00Z', 'morning', ['--respect-slot'])
        self.assertEqual(third, {'code': 0})

    def test_killed_run_blocks_the_window_until_its_lease_expires(self):
        FileStore(self.state).begin('killed', '2026-10-20-morning', at('2026-10-20T05:00:00Z'))
        busy = self.go('2026-10-20T05:20:00Z', 'morning', ['--respect-slot'])
        self.assertEqual(busy, {'code': 0})
        later = self.go('2026-10-20T06:00:00Z', 'morning', ['--respect-slot'])    # הנעילה פגה אחרי 30 דקות
        self.assertEqual(later['run']['state']['recovered_lock'], 'killed')
        self.assertEqual(later['run']['outcome'], 'drafts_ready')


class ConcurrentRunsTest(unittest.TestCase):
    """כמה תהליכים נפרדים לאותו חלון, באותו רגע, כל אחד עם שכפול משלו: בדיוק אחד מעבד את החלון."""

    def test_close_runs_in_separate_processes_process_the_window_once(self):
        tmp = tempfile.mkdtemp(prefix='news-race-')
        try:
            cloud = Cloud(tmp, BASIC)
            env0 = cloud.fresh_clone()
            with NoNetwork():
                runner.run(['--fixtures', BASIC, '--now', '2026-10-20T04:00:00Z', '--state-git',
                            os.path.join(env0, 'state'), '--out', os.path.join(env0, 'out'), '--init-state',
                            '--registry', cloud.registry])
            procs = []
            for i in range(3):
                env = cloud.fresh_clone()
                procs.append(subprocess.Popen(
                    [sys.executable, os.path.join(PKG, 'run.py'), '--fixtures', BASIC, '--slot', 'morning',
                     '--respect-slot', '--now', '2026-10-20T05:0%d:00Z' % i, '--registry', cloud.registry,
                     '--state-git', os.path.join(env, 'state'), '--out', os.path.join(env, 'out'), '--json'],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True))
            outs = [p.communicate(timeout=120) for p in procs]
            self.assertEqual([p.returncode for p in procs], [0, 0, 0], [o[1] for o in outs])
            outcomes = [json.loads(o[0].strip().splitlines()[-1])['outcome'] for o in outs]
            # ריצת האתחול כבר הכניסה הכול לתור, ולכן הריצה היחידה שעיבדה את החלון מחזירה nothing_to_publish
            processed = [x for x in outcomes if not x.startswith('skipped_')]
            self.assertEqual(processed, ['nothing_to_publish'], outcomes)
            self.assertTrue(all(x in ('nothing_to_publish', 'skipped_busy', 'skipped_duplicate_slot') for x in outcomes), outcomes)
            st = cloud.state()
            done = [r for r in st['runs'] if r.get('slot_key') == '2026-10-20-morning']
            self.assertEqual([r['status'] for r in done], ['completed'])
            self.assertIsNone(st['_lock'])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_state_repository_created_with_a_readme_can_be_initialised(self):
        tmp = tempfile.mkdtemp(prefix='news-init-')
        try:
            cloud = Cloud(tmp, BASIC)
            seed = cloud.fresh_clone()
            repo = os.path.join(seed, 'state')
            with open(os.path.join(repo, 'README.md'), 'w') as f:
                f.write('state\n')
            git('add', 'README.md', cwd=repo)
            git('-c', 'user.name=t', '-c', 'user.email=t@example.org', 'commit', '-qm', 'init', cwd=repo)
            git('push', '-q', 'origin', 'HEAD:main', cwd=repo)
            self.assertEqual(cloud.run('2026-10-20T05:00:00Z')['code'], 5)               # בלי --init-state
            r = cloud.run('2026-10-20T05:00:00Z', init=True)
            self.assertEqual(r['run']['outcome'], 'drafts_ready')
            self.assertIn('README.md', cloud.files())
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class RelativePathsTest(unittest.TestCase):
    """ה-workflow מעביר נתיבים יחסיים מתיקיית ה-runner. כולם חייבים להיפתר מולה, לא מול תיקיית הקוד."""

    def test_runner_style_relative_paths(self):
        tmp = tempfile.mkdtemp(prefix='news-rel-')
        try:
            cloud = Cloud(tmp, BASIC)
            runner_dir = cloud.fresh_clone()
            os.makedirs(os.path.join(runner_dir, 'site-main'))
            for n in ('whats-new.json', 'whats-new-registry.json'):
                shutil.copyfile(os.path.join(REPO, n), os.path.join(runner_dir, 'site-main', n))
            shutil.copytree(BASIC, os.path.join(runner_dir, 'fx'))
            args = [sys.executable, os.path.join(PKG, 'run.py'), '--fixtures', 'fx', '--now', '2026-10-20T05:00:00Z',
                    '--state-git', 'state', '--out', 'out', '--registry', 'site-main/whats-new-registry.json',
                    '--whats-new', 'site-main/whats-new.json', '--json']
            p = subprocess.run(args + ['--init-state'], cwd=runner_dir, capture_output=True, text=True, timeout=120)
            self.assertEqual(p.returncode, 0, p.stderr)
            d = json.loads(p.stdout.strip().splitlines()[-1])
            self.assertEqual(d['outcome'], 'drafts_ready')
            self.assertTrue(d['out_dir'].startswith(os.path.realpath(runner_dir)) or d['out_dir'].startswith(runner_dir))
            self.assertTrue(os.path.isdir(os.path.join(runner_dir, 'out', d['run_id'])))
            self.assertEqual(d['published_check']['sources'], ['whats-new.json', 'whats-new-registry.json'])
            self.assertIn('state.json', cloud.files())
            p2 = subprocess.run(args, cwd=runner_dir, capture_output=True, text=True, timeout=120)
            self.assertEqual(json.loads(p2.stdout.strip().splitlines()[-1])['outcome'], 'nothing_to_publish', p2.stderr)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class PublishedTest(FileRunsMixin, unittest.TestCase):

    def test_url_normalisation(self):
        n = published.norm_url
        self.assertEqual(n('http://www.Tate.org.uk/whats-on/x/?utm_source=fb&b=2#top'), 'https://tate.org.uk/whats-on/x?b=2')
        self.assertEqual(n('https://tate.org.uk/whats-on/x'), n('https://www.tate.org.uk/whats-on/x/'))
        self.assertNotEqual(n('https://tate.org.uk/a'), n('https://tate.org.uk/b'))
        self.assertIsNone(n(''))

    def publish(self, *items):
        self.write_json(self.whats_new, {'items': list(items)})

    def test_candidate_already_on_the_site_is_not_offered(self):
        self.publish({'id': '2026-10-19-bright-lights', 'date': '2026-10-19', 'sources': [
            {'name': 'Tate', 'url': 'https://tate.org.uk/whats-on/tate-modern/bright-lights/?utm_source=x'}]})
        r = self.go('2026-10-20T05:00:00Z')
        hit = next(x for x in r['decisions']['results'] if x['candidate']['title'].startswith('Bright Lights'))
        self.assertEqual(hit['decision'], 'REJECT')
        self.assertEqual(hit['classification']['layer'], 'published')
        self.assertIn('2026-10-19-bright-lights', hit['main_reason'])
        self.assertEqual(hit['published']['matched_by'], 'source_url')
        self.assertEqual(self.state_json()['items'][hit['candidate']['fingerprint']]['status'], 'published')

    def test_pending_item_published_later_leaves_the_queue_and_frees_its_place(self):
        config_saved = (config.MAX_ACCEPT_PER_RUN, config.MAX_HOLD_PER_RUN)
        try:
            first = self.go('2026-10-20T05:00:00Z')
            picc = next(d for d in first['drafts']['drafts'] if d['facts']['title'].startswith('Piccadilly'))
            # DS AI Operations העביר את הטיוטה לפרסום, עם news_fingerprint. כתובת TfL משותפת ולכן לא מספיקה
            self.publish({'id': '2026-10-21-piccadilly-closure', 'date': '2026-10-21',
                          'news_fingerprint': picc['fingerprint'],
                          'sources': [{'name': 'TfL', 'url': 'https://tfl.gov.uk/tube-dlr-overground/status/'}]})
            second = self.go('2026-10-21T05:00:00Z')
            self.assertNotIn(picc['fingerprint'], {p['fingerprint'] for p in second['drafts']['pending']})
            self.assertIn('Piccadilly: Planned Closure', [x['title'] for x in second['drafts']['left_queue']])
            rec = self.state_json()['items'][picc['fingerprint']]
            self.assertEqual(rec['status'], 'published')
            self.assertEqual(rec['published_as']['matched_by'], 'news_fingerprint')
            self.assertEqual(second['run']['published_check']['newly_detected'], 1)
            again = next(x for x in second['decisions']['results'] if x['candidate']['fingerprint'] == picc['fingerprint'])
            self.assertEqual(again['decision'], 'REJECT')
            self.assertIn('2026-10-21-piccadilly-closure', again['main_reason'])
        finally:
            config.MAX_ACCEPT_PER_RUN, config.MAX_HOLD_PER_RUN = config_saved

    def test_shared_status_page_alone_never_marks_an_item_published(self):
        self.publish({'id': 'x', 'date': '2026-10-19',
                      'sources': [{'name': 'TfL', 'url': 'https://tfl.gov.uk/tube-dlr-overground/status/'}]})
        r = self.go('2026-10-20T05:00:00Z')
        picc = next(x for x in r['decisions']['results'] if x['candidate']['title'].startswith('Piccadilly'))
        self.assertNotEqual(picc['classification'].get('layer'), 'published')
        self.assertEqual(picc['decision'], 'ACCEPT_FOR_DRAFT')

    def test_registry_keeps_the_news_fingerprint(self):
        import whats_new_dedup as dedup
        reg = os.path.join(self.tmp, 'reg.json')
        with mock.patch.object(dedup, 'REGISTRY', reg):
            dedup.record({'id': 'a', 'title': 'כותרת', 'anchor': 'a', 'date': '2026-10-21', 'entity': 'e', 'summary': 's',
                          'sources': [{'name': 'n', 'url': 'https://example.org/a'}], 'news_fingerprint': 'tate_whatson:abc'})
            dedup.record({'id': 'b', 'title': 'אחר', 'anchor': 'b', 'date': '2026-10-21', 'entity': 'f', 'summary': 't',
                          'sources': [{'name': 'n', 'url': 'https://example.org/b'}]})
        with open(reg, encoding='utf-8') as f:
            pub = {p['id']: p for p in json.load(f)['published']}
        self.assertEqual(pub['a']['newsFingerprint'], 'tate_whatson:abc')
        self.assertNotIn('newsFingerprint', pub['b'])
        idx = published.Index(None, reg)
        self.assertEqual(idx.match('tate_whatson:abc', None)[0]['id'], 'a')
        self.assertEqual(idx.match(None, 'https://www.example.org/b/')[0]['id'], 'b')


class PinnedCodeTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='news-pin-')
        git('init', '-q', '-b', 'main', self.tmp)
        with open(os.path.join(self.tmp, 'a.txt'), 'w') as f:
            f.write('1\n')
        git('add', 'a.txt', cwd=self.tmp)
        git('-c', 'user.name=t', '-c', 'user.email=t@example.org', 'commit', '-qm', 'one', cwd=self.tmp)
        self.sha = git('rev-parse', 'HEAD', cwd=self.tmp).strip()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_exact_clean_commit_passes(self):
        self.assertIsNone(runner.verify_code(self.sha, self.tmp))

    def test_branch_name_tag_or_short_sha_is_refused(self):
        for bad in ('main', 'news-engine-0.3', self.sha[:12], self.sha.upper()):
            self.assertIn('40 lowercase hex', runner.verify_code(bad, self.tmp))

    def test_other_commit_or_local_change_is_refused(self):
        self.assertIn('expected', runner.verify_code('0' * 40, self.tmp))
        with open(os.path.join(self.tmp, 'a.txt'), 'w') as f:
            f.write('2\n')
        self.assertIn('local modifications', runner.verify_code(self.sha, self.tmp))

    def test_not_a_git_checkout_is_refused(self):
        plain = tempfile.mkdtemp()
        try:
            self.assertIn('not a git checkout', runner.verify_code(self.sha, plain))
        finally:
            shutil.rmtree(plain)

    def test_run_stops_before_any_work_on_mismatch(self):
        out = os.path.join(self.tmp, 'out')
        with NoNetwork():
            code = runner.run(['--expect-code-sha', '0' * 40, '--fixtures', BASIC, '--out', out,
                               '--state', os.path.join(self.tmp, 'st')])
        self.assertEqual(code, 6)
        self.assertFalse(os.path.exists(out))
        self.assertFalse(os.path.exists(os.path.join(self.tmp, 'st')))


class NotifyTest(unittest.TestCase):

    def summary(self, outcome, **counts):
        c = dict(drafts=2, pending_total=5, backlog_total=3, updated=0)
        c.update(counts)
        return {'run_id': '20261020-080000-morning', 'outcome': outcome, 'counts': c}

    def test_new_items_post_once_with_marker_and_safe_titles(self):
        drafts = [{'facts': {'title': 'Evil `code` @someone'}, 'priority': 57, 'decision': 'ACCEPT_FOR_DRAFT',
                   'fingerprint': 'tfl_planned:9c09221cb36f'}]
        post, body = notify.build(self.summary('drafts_ready'), 0, drafts, 'DS-VideoArt/golondon-news-ops', 'https://x/run')
        self.assertTrue(post)
        self.assertTrue(body.startswith('<!-- golondon-news run=20261020-080000-morning -->'))
        self.assertNotIn('@someone', body)
        self.assertNotIn('`code`', body)
        self.assertIn('runs/20261020-080000-morning/report.md', body)
        self.assertIn('DS AI Operations', body)

    def test_quiet_and_skipped_runs_do_not_post(self):
        self.assertEqual(notify.build(self.summary('nothing_to_publish'), 0), (False, None))
        for o in ('skipped_duplicate_slot', 'skipped_busy', 'skipped_late', 'skipped_not_due'):
            self.assertEqual(notify.build({'run_id': None, 'outcome': o}, 0), (False, None))

    def test_failures_always_post(self):
        post, body = notify.build(self.summary('all_sources_failed'), 2)
        self.assertTrue(post)
        self.assertIn('כל המקורות נכשלו', body)
        post, body = notify.build(None, 5, fallback_id='gh-123')
        self.assertTrue(post)
        self.assertIn('run=gh-123', body)

    def test_cli_reads_last_json_line(self):
        tmp = tempfile.mkdtemp()
        try:
            with open(os.path.join(tmp, 'stdout.txt'), 'w') as f:
                f.write('20261020: nothing_to_publish\n' + json.dumps(self.summary('nothing_to_publish')) + '\n')
            with mock.patch('sys.stdout') as out:
                notify.main(['--stdout', os.path.join(tmp, 'stdout.txt'), '--out', tmp, '--exit-code', '0',
                             '--body-file', os.path.join(tmp, 'c.md')])
            self.assertIn('skip', ''.join(c.args[0] for c in out.write.call_args_list))
            self.assertFalse(os.path.exists(os.path.join(tmp, 'c.md')))
        finally:
            shutil.rmtree(tmp)


def _run_blocks(text):
    """שורות שנמצאות בתוך בלוק run: | של YAML."""
    lines, out, inside, indent = text.splitlines(), [], False, 0
    for l in lines:
        if re.match(r'^\s*run:\s*\|\s*$', l):
            inside, indent = True, len(l) - len(l.lstrip())
            continue
        if inside:
            if l.strip() and len(l) - len(l.lstrip()) <= indent:
                inside = False
            else:
                out.append(l)
    return out


class WorkflowExamplesTest(unittest.TestCase):

    def read(self, name):
        with open(os.path.join(CLOUD, name), encoding='utf-8') as f:
            return f.read()

    def test_examples_are_outside_github_workflows_and_old_example_is_gone(self):
        self.assertEqual(sorted(os.path.basename(p) for p in glob.glob(os.path.join(CLOUD, '*.yml'))),
                         ['news-decide.workflow.example.yml', 'news-scan.workflow.example.yml'])
        self.assertFalse(os.path.exists(os.path.join(REPO, '.github', 'workflows')))

    def test_no_active_schedule(self):
        for name in ('news-scan.workflow.example.yml', 'news-decide.workflow.example.yml'):
            for l in self.read(name).splitlines():
                self.assertFalse(re.match(r'^\s*schedule\s*:', l), (name, l))
                self.assertFalse(re.match(r'^\s*-\s*cron\s*:', l), (name, l))

    def test_least_privilege_and_pinned_actions(self):
        for name, allowed in (('news-scan.workflow.example.yml', {'contents: write', 'issues: write'}),
                              ('news-decide.workflow.example.yml', {'contents: write'})):
            t = self.read(name)
            self.assertIn('\npermissions: {}\n', t)
            granted = set(re.findall(r'^\s{6}(\w+: (?:read|write))\s*$', t, re.M))
            self.assertEqual(granted, allowed, name)
            for uses in re.findall(r'uses:\s*(\S+)', t):
                self.assertRegex(uses, r'@[0-9a-f]{40}$', name)
            self.assertIn('group: golondon-news-state', t)
            self.assertIn("GOLONDON_CODE_SHA: '%s'" % ('0' * 40), t)
            self.assertIn('--expect-code-sha "$GOLONDON_CODE_SHA"', t)

    def test_code_checkouts_are_pinned_and_do_not_keep_credentials(self):
        t = self.read('news-scan.workflow.example.yml')
        blocks = re.split(r'\n\s+- name: ', t)
        code = next(b for b in blocks if 'repository: DS-VideoArt/golondon' in b and 'GOLONDON_CODE_SHA' in b)
        self.assertIn('persist-credentials: false', code)
        data = next(b for b in blocks if 'ref: main' in b)
        self.assertIn('persist-credentials: false', data)
        self.assertIn('whats-new.json', data)
        self.assertIn('--registry site-main/whats-new-registry.json --whats-new site-main/whats-new.json', t)

    def test_inputs_never_reach_shell_by_interpolation(self):
        for name in ('news-scan.workflow.example.yml', 'news-decide.workflow.example.yml'):
            body = _run_blocks(self.read(name))
            self.assertTrue(body, name)
            for l in body:
                self.assertNotIn('${{', l, (name, l))

    def test_decide_is_owner_only_and_validates_input(self):
        t = self.read('news-decide.workflow.example.yml')
        self.assertIn('if: github.actor == github.repository_owner', t)
        self.assertIn("grep -Eq '^[a-z_]+:[0-9a-f]{4,12}=(approve|reject)$'", t)
        self.assertIn('set -euf', t)


class NetlifySafetyTest(unittest.TestCase):
    """הענף לא משנה שום הגדרת בנייה. השינוי היחיד ב-netlify.toml הוא חסימת /news_pipeline/*."""

    def test_netlify_toml_changes_only_add_the_block_rule(self):
        p = subprocess.run(['git', '-C', REPO, 'show', 'origin/main:netlify.toml'], capture_output=True, text=True)
        if p.returncode != 0:
            self.skipTest('origin/main not available')
        with open(os.path.join(REPO, 'netlify.toml'), encoding='utf-8') as f:
            mine = f.read()
        base = p.stdout
        added = [l for l in mine.splitlines() if l not in base.splitlines()]
        self.assertEqual([l.strip() for l in added if l.strip() and not l.strip().startswith('#')],
                         ['from = "/news_pipeline/*"'])
        for key in ('ignore', 'command', '[context', 'publish ='):
            self.assertEqual(mine.count(key), base.count(key), key)

    def test_no_build_hooks_or_workflows_added(self):
        p = subprocess.run(['git', '-C', REPO, 'diff', '--name-only', 'origin/main...HEAD'], capture_output=True, text=True)
        if p.returncode != 0:
            self.skipTest('origin/main not available')
        changed = set(p.stdout.split())
        self.assertFalse({f for f in changed if f.startswith('.github/') or f in ('_redirects', 'package.json')})


if __name__ == '__main__':
    unittest.main()
