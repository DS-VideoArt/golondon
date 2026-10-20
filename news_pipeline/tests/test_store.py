# -*- coding: utf-8 -*-
"""
שלב 0.2: זיכרון התור בין ריצות עצמאיות לגמרי.

כל ריצה כאן מתחילה בתיקייה זמנית חדשה, עם שכפול טרי של "מאגר הזיכרון" (מאגר git חשוף מקומי
שמדמה מאגר פרטי מרוחק), ובסוף הריצה התיקייה נמחקת. זה בדיוק מה שקורה ב-GitHub Actions.
אין כאן רשת ואין שירות ענן: המאגר המרוחק הוא תיקייה מקומית.
"""
import datetime, json, os, re, shutil, subprocess, tempfile, unittest
from unittest import mock

from news_pipeline import run as runner, config
from news_pipeline.store import (Busy, Conflict, FileStore, GitStore, Unavailable, checksum, scrub)
from news_pipeline.tests.test_pipeline import BASIC, NoNetwork
from news_pipeline.tests.test_queue_priority import EXTRA_VAM

MORNING = '2026-10-20T05:00:00Z'     # 08:00 בישראל
EVENING = '2026-10-20T16:00:00Z'     # 19:00 בישראל


def git(*args, cwd=None):
    p = subprocess.run(('git',) + args, cwd=cwd, capture_output=True, text=True,
                       env=dict(os.environ, GIT_TERMINAL_PROMPT='0'))
    if p.returncode != 0:
        raise AssertionError('git %s: %s' % (args, p.stderr))
    return p.stdout


class Cloud:
    """מאגר זיכרון מרוחק, וסביבת ריצה חדשה ונקייה לכל הרצה."""

    def __init__(self, root, fixtures):
        self.root = root
        self.fx = fixtures
        self.remote = os.path.join(root, 'state-remote.git')
        git('init', '--quiet', '--bare', '--initial-branch=main', self.remote)
        self.registry = os.path.join(root, 'registry.json')
        with open(self.registry, 'w') as f:
            json.dump({'published': []}, f)
        self.n = 0

    def fresh_clone(self):
        self.n += 1
        env = tempfile.mkdtemp(prefix='runner%d-' % self.n, dir=self.root)
        git('clone', '--quiet', self.remote, os.path.join(env, 'state'))
        return env

    def run(self, now, slot='manual', extra=(), init=False):
        env = self.fresh_clone()
        try:
            args = ['--fixtures', self.fx, '--now', now, '--slot', slot, '--registry', self.registry,
                    '--state-git', os.path.join(env, 'state'), '--out', os.path.join(env, 'out')] + list(extra)
            if init:
                args.append('--init-state')
            with NoNetwork():
                code = runner.run(args)
            out = {'code': code}
            od = os.path.join(env, 'out')
            if os.path.isdir(od) and os.listdir(od):
                d = os.path.join(od, os.listdir(od)[0])
                for n in ('run.json', 'drafts.json', 'decisions.json'):
                    with open(os.path.join(d, n), encoding='utf-8') as f:
                        out[n.split('.')[0]] = json.load(f)
            return out
        finally:
            shutil.rmtree(env, ignore_errors=True)   # הסביבה נעלמת, כמו מכונה של Actions

    def decide(self, *specs, now=EVENING):
        env = self.fresh_clone()
        try:
            with NoNetwork():
                return runner.run(['--state-git', os.path.join(env, 'state'), '--now', now] +
                                  [x for s in specs for x in ('--decide', s)])
        finally:
            shutil.rmtree(env, ignore_errors=True)

    def state(self):
        return json.loads(git('--git-dir', self.remote, 'show', 'main:state.json'))

    def log(self):
        return git('--git-dir', self.remote, 'log', '--format=%s', 'main').splitlines()

    def files(self):
        return git('--git-dir', self.remote, 'ls-tree', '-r', '--name-only', 'main').splitlines()


class SeparateRunsTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='news-store-')
        self.fx = os.path.join(self.tmp, 'fixtures')
        shutil.copytree(BASIC, self.fx)
        self.edit('vam_whatson.html', '</ul>', EXTRA_VAM + '</ul>')
        self.cloud = Cloud(self.tmp, self.fx)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def edit(self, name, old, new):
        p = os.path.join(self.fx, name)
        with open(p, encoding='utf-8') as f:
            s = f.read()
        self.assertIn(old, s)
        with open(p, 'w', encoding='utf-8') as f:
            f.write(s.replace(old, new))

    def fp(self, result, title):
        return next(r['candidate']['fingerprint'] for r in result['decisions']['results']
                    if r['candidate']['title'].startswith(title))

    # ------------------------------------------------------------------

    def test_without_shared_state_a_fresh_environment_forgets_everything(self):
        """מדגים את הבעיה שהשלב הזה פותר: קובץ מקומי בסביבה חדשה."""
        outs = []
        for now in (MORNING, EVENING):
            env = tempfile.mkdtemp(dir=self.tmp)
            with NoNetwork():
                runner.run(['--fixtures', self.fx, '--now', now, '--registry', self.cloud.registry,
                            '--state', os.path.join(env, 'state'), '--out', os.path.join(env, 'out')])
            d = os.path.join(env, 'out', os.listdir(os.path.join(env, 'out'))[0])
            with open(os.path.join(d, 'drafts.json'), encoding='utf-8') as f:
                outs.append(json.load(f))
            shutil.rmtree(env)
        self.assertEqual(len(outs[1]['drafts']), len(outs[0]['drafts']))   # הכול מוצע שוב כחדש

    def test_morning_and_evening_in_separate_environments_share_the_queue(self):
        m = self.cloud.run(MORNING, slot='morning', init=True)
        self.assertEqual(m['code'], 0)
        self.assertTrue(m['drafts']['drafts'])
        self.assertTrue(m['drafts']['backlog'])
        e = self.cloud.run(EVENING, slot='evening')
        self.assertEqual(e['code'], 0)
        self.assertEqual(e['drafts']['drafts'], [])
        self.assertEqual(e['run']['outcome'], 'nothing_to_publish')
        self.assertEqual({p['fingerprint'] for p in e['drafts']['pending']}, {d['fingerprint'] for d in m['drafts']['drafts']})
        self.assertEqual({p['fingerprint'] for p in e['drafts']['backlog']}, {p['fingerprint'] for p in m['drafts']['backlog']})
        st = self.cloud.state()
        self.assertIsNone(st['_lock'])
        self.assertEqual([r['status'] for r in st['runs']], ['completed', 'completed'])
        self.assertEqual(st['_meta']['sha256'], checksum(st))
        log = self.cloud.log()
        self.assertEqual(len(log), 4)                               # נעילה ותוצאה, לכל ריצה
        self.assertTrue(log[0].startswith('run ') and 'nothing_to_publish' in log[0])
        files = self.cloud.files()
        self.assertIn('runs/%s/report.md' % m['run']['run_id'], files)
        self.assertIn('runs/%s/report.md' % e['run']['run_id'], files)
        self.assertFalse([f for f in files if f.endswith('decisions.json')])   # לא מנפחים את המאגר

    def test_every_status_survives_between_environments(self):
        m = self.cloud.run(MORNING, init=True)
        picc, costumes, bright = (self.fp(m, 'Piccadilly'), self.fp(m, 'Costumes of the Stage'),
                                  self.fp(m, 'Bright Lights'))
        self.assertEqual(self.cloud.decide(picc + '=approve', costumes + '=reject'), 0)
        self.edit('vam_whatson.html', 'content="2027-03-01"', 'content="2027-04-30"')
        self.edit('tate_whatson.html', 'Light installations for the darker months</div>',
                  'Light installations for the darker months. This exhibition has been postponed</div>')
        e = self.cloud.run(EVENING)
        res = {r['candidate']['fingerprint']: r for r in e['decisions']['results']}
        self.assertEqual(res[picc]['decision'], 'REJECT')                       # אושר, לא חוזר
        self.assertEqual(res[costumes]['classification']['verdict'], 'UPDATE')  # נדחה, השתנה, חוזר
        self.assertEqual(res[bright]['classification']['verdict'], 'CANCELLATION')
        items = self.cloud.state()['items']
        statuses = {r['status'] for r in items.values()}
        self.assertTrue({'pending', 'backlog', 'rejected_rules', 'approved'} <= statuses, statuses)
        self.assertEqual(items[picc]['status'], 'approved')
        self.assertEqual(items[picc]['decided']['decision'], 'approve')
        self.assertEqual(items[bright]['material']['status'], 'postponed')
        self.assertEqual(items[costumes]['material']['valid_to'], '2027-04-30')
        # החלטת דחייה נשמרת גם אחרי ריצה נוספת בסביבה אחרת
        self.cloud.decide(costumes + '=reject', now='2026-10-21T04:00:00Z')
        n = self.cloud.run('2026-10-21T05:00:00Z')
        r = next(r for r in n['decisions']['results'] if r['candidate']['fingerprint'] == costumes)
        self.assertEqual(r['decision'], 'REJECT')
        self.assertEqual(self.cloud.state()['items'][costumes]['status'], 'rejected_owner')

    def test_same_slot_twice_is_skipped(self):
        """שני cron שנורים לאותו חלון, למשל עיכוב של GitHub שמביא את שניהם לשעה 08 בישראל."""
        self.cloud.run(MORNING, slot='morning', init=True)
        before = self.cloud.log()
        again = self.cloud.run('2026-10-20T05:24:00Z', slot='morning')
        self.assertEqual(again['code'], 0)
        self.assertNotIn('run', again)                      # לא נוצר פלט, לא נאסף דבר
        self.assertEqual(self.cloud.log(), before)          # ולא נכתב דבר
        forced = self.cloud.run('2026-10-20T05:30:00Z', slot='morning', extra=['--force-rerun'])
        self.assertEqual(forced['run']['outcome'], 'nothing_to_publish')

    def test_overlapping_run_waits_and_a_crashed_run_is_recovered(self):
        self.cloud.run(MORNING, slot='morning', init=True)
        # ריצה שתפסה את הזיכרון ואז המכונה שלה נעלמה, בלי commit ובלי abort
        env = self.cloud.fresh_clone()
        crashed = GitStore(os.path.join(env, 'state'))
        crashed.begin('crashed-run', '2026-10-20-evening', datetime.datetime(2026, 10, 20, 16, 0, tzinfo=datetime.timezone.utc))
        shutil.rmtree(env)
        items_before = self.cloud.state()['items']
        busy = self.cloud.run('2026-10-20T16:10:00Z', slot='evening')
        self.assertEqual(busy['code'], 0)
        self.assertNotIn('run', busy)
        self.assertEqual(self.cloud.state()['items'], items_before)
        later = self.cloud.run('2026-10-20T16:45:00Z', slot='evening')      # אחרי שהנעילה פגה
        self.assertEqual(later['code'], 0)
        self.assertEqual(later['run']['state']['recovered_lock'], 'crashed-run')
        st = self.cloud.state()
        self.assertIsNone(st['_lock'])
        self.assertEqual({r['run_id']: r['status'] for r in st['runs']}['crashed-run'], 'abandoned')
        self.assertEqual(later['drafts']['drafts'], [])

    def test_failed_run_writes_nothing_and_releases_the_lock(self):
        self.cloud.run(MORNING, slot='morning', init=True)
        before = self.cloud.state()
        with mock.patch('news_pipeline.drafts.build', side_effect=RuntimeError('simulated failure')):
            with self.assertRaises(RuntimeError):
                self.cloud.run(EVENING, slot='evening')
        after = self.cloud.state()
        self.assertEqual(after['items'], before['items'])
        self.assertEqual(after['govuk_watch'], before['govuk_watch'])
        self.assertIsNone(after['_lock'])
        self.assertEqual(after['runs'][-1]['status'], 'failed')
        self.assertIn('simulated failure', after['runs'][-1]['error'])
        retry = self.cloud.run('2026-10-20T16:20:00Z', slot='evening')     # החלון לא הושלם, מותר לנסות שוב
        self.assertEqual(retry['run']['outcome'], 'nothing_to_publish')

    def test_two_writers_never_overwrite_each_other(self):
        self.cloud.run(MORNING, init=True)
        now = datetime.datetime(2026, 10, 20, 16, 0, tzinfo=datetime.timezone.utc)
        a_env, b_env = self.cloud.fresh_clone(), self.cloud.fresh_clone()
        a, b = GitStore(os.path.join(a_env, 'state')), GitStore(os.path.join(b_env, 'state'))
        a.begin('run-a', None, now)
        with self.assertRaises(Busy):
            b.begin('run-b', None, now)
        # גם בלי נעילה: שני כותבים שקראו את אותה גרסה, רק הראשון מצליח
        sa, ta, _ = a._read()
        sb, tb, _ = b._read()
        sa['govuk_watch']['marker'] = 'a'
        sb['govuk_watch']['marker'] = 'b'
        a._write(sa, ta, 'writer a')
        with self.assertRaises(Conflict):
            b._write(sb, tb, 'writer b')
        self.assertEqual(self.cloud.state()['govuk_watch']['marker'], 'a')

    def test_corrupt_state_is_recovered_from_the_previous_commit(self):
        self.cloud.run(MORNING, init=True)
        good = self.cloud.state()['items']
        env = self.cloud.fresh_clone()
        repo = os.path.join(env, 'state')
        with open(os.path.join(repo, 'state.json'), 'w') as f:
            f.write('{"items": {"truncated')
        git('-c', 'user.name=t', '-c', 'user.email=t@example.org', 'commit', '-qam', 'corrupt', cwd=repo)
        git('push', '-q', 'origin', 'HEAD:main', cwd=repo)
        shutil.rmtree(env)
        r = self.cloud.run(EVENING)
        self.assertEqual(r['code'], 0)
        self.assertTrue(any('recovered' in n for n in r['run']['state']['notes']))
        self.assertEqual(r['drafts']['drafts'], [])
        self.assertEqual(set(self.cloud.state()['items']), set(good))

    def test_missing_or_unreachable_state_refuses_to_start_empty(self):
        r = self.cloud.run(MORNING)                       # בלי --init-state
        self.assertEqual(r['code'], 5)
        self.assertNotIn('run', r)
        self.assertEqual(git('--git-dir', self.cloud.remote, 'branch', '--list').strip(), '')
        with NoNetwork():
            code = runner.run(['--fixtures', self.fx, '--now', MORNING,
                               '--state-git', os.path.join(self.tmp, 'no-such-clone'),
                               '--out', os.path.join(self.tmp, 'o')])
        self.assertEqual(code, 5)

    def test_state_repository_holds_no_secrets(self):
        self.cloud.run(MORNING, init=True)
        self.cloud.run(EVENING)
        pattern = re.compile(r'ghp_|github_pat_|gho_|sk-ant-|authorization|password|api[_-]?key|://[^/\s"]+:[^/\s"]+@', re.I)
        for path in self.cloud.files():
            text = git('--git-dir', self.cloud.remote, 'show', 'main:%s' % path)
            self.assertIsNone(pattern.search(text), path)
        self.assertEqual(scrub('fatal: https://x-access-token:abc123@github.com/o/r.git'),
                         'fatal: https://***@github.com/o/r.git')


class FileStoreTest(unittest.TestCase):

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='news-filestore-')
        self.now = datetime.datetime(2026, 10, 20, 5, 0, tzinfo=datetime.timezone.utc)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_second_process_sees_the_lock(self):
        a, b = FileStore(self.dir), FileStore(self.dir)
        a.begin('run-a', '2026-10-20-morning', self.now)
        with self.assertRaises(Busy):
            b.begin('run-b', '2026-10-20-morning', self.now)

    def test_corrupt_file_recovers_previous_version_or_refuses(self):
        s = FileStore(self.dir)
        st, _ = s.begin('r1', None, self.now)
        st['items']['x'] = {'status': 'pending'}
        s.commit(st, self.now, 'ok')
        with open(os.path.join(self.dir, 'state.json'), 'w') as f:
            f.write('not json')
        st, info = FileStore(self.dir).peek()
        self.assertTrue(info and 'recovered' in info[0])
        os.remove(os.path.join(self.dir, 'state.prev.json'))
        with self.assertRaises(Unavailable):
            FileStore(self.dir).peek()

    def test_checksum_detects_edited_state(self):
        s = FileStore(self.dir)
        st, _ = s.begin('r1', None, self.now)
        s.commit(st, self.now, 'ok')
        path = os.path.join(self.dir, 'state.json')
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        data['items']['injected'] = {'status': 'approved'}
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f)
        _, notes = FileStore(self.dir).peek()
        self.assertIn('checksum', notes[0])

    def test_state_directory_is_not_tracked_by_the_public_repo(self):
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        with open(os.path.join(root, '.gitignore'), encoding='utf-8') as f:
            self.assertIn('news_pipeline/state/', f.read())


if __name__ == '__main__':
    unittest.main()
