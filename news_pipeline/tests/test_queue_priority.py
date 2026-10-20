# -*- coding: utf-8 -*-
"""
שלב 0.1: סדר עדיפויות לפי השפעה אמיתית על מטיילים, ותור יציב בין ריצות.
"""
import datetime, json, os, shutil, tempfile, unittest

from news_pipeline import config, priority
from news_pipeline.model import make_candidate
from news_pipeline.tests.test_pipeline import BASIC, NoNetwork
from news_pipeline import run as runner

TODAY = datetime.date(2026, 10, 20)


def cand(source_id, title, kind, summary='', **kw):
    src = {'id': source_id, 'name': source_id}
    text = kw.pop('source_text', '%s. %s' % (title, summary))
    return make_candidate(src, TODAY, external_id=title, item_url='https://example.org/' + title.replace(' ', '-'),
                          kind=kind, title=title, summary=summary, source_text=text,
                          verified_at='2026-10-20T05:00:00Z', **kw)


def prio(c):
    return priority.priority(c, TODAY)[0]


PICCADILLY_FULL = dict(
    source_id='tfl_planned', title='Piccadilly: Planned Closure', kind='disruption_planned',
    summary='PICCADILLY LINE: Saturday 31 October and Sunday 1 November, no service on the entire line. '
            'Use ELIZABETH LINE services between Central London and Heathrow.',
    valid_from='2026-10-31', valid_to='2026-11-02', flags={'line_id': 'piccadilly', 'severity': 4})
VA_DROP_IN = dict(
    source_id='vam_whatson', title='Design Baby Drop-in', kind='event',
    summary='Drop in activity for families at South Kensington.',
    valid_from='2026-10-26', valid_to='2026-10-30', flags={'listing_type': 'drop-in', 'free': True})
TATE_MAJOR = dict(
    source_id='tate_whatson', title='Inside Bloomsbury', kind='exhibition',
    summary='A major exhibition of painting and design.',
    valid_from='2026-11-12', valid_to='2027-04-11', flags={'listing_type': 'exhibition'})
NEW_ATTRACTION = dict(
    source_id='vam_whatson', title='V&A East Museum', kind='exhibition',
    summary='The new museum opens to the public in Queen Elizabeth Olympic Park.',
    valid_from='2026-11-07', valid_to='2027-11-07', flags={'listing_type': 'exhibition'})
DISTRICT_MINOR = dict(
    source_id='tfl_planned', title='District: Reduced Service', kind='disruption_planned',
    summary='DISTRICT LINE: Sunday 25 October, a reduced service operates between Earls Court and Wimbledon.',
    valid_from='2026-10-25', valid_to='2026-10-25', flags={'line_id': 'district', 'severity': 7})
WINDRUSH_PART = dict(
    source_id='tfl_planned', title='Windrush: Part Closure', kind='disruption_planned',
    summary='WINDRUSH LINE: Sunday 25 October, no service between Dalston Junction and New Cross Gate.',
    valid_from='2026-10-25', valid_to='2026-10-25', flags={'line_id': 'windrush', 'severity': 5})


class PriorityTest(unittest.TestCase):

    def test_full_airport_line_closure_outranks_small_cultural_activity(self):
        closure, drop_in = prio(cand(**PICCADILLY_FULL)), prio(cand(**VA_DROP_IN))
        self.assertGreater(closure, drop_in + 15)
        self.assertGreaterEqual(closure, config.URGENT_PRIORITY)
        _, br, notes = priority.priority(cand(**PICCADILLY_FULL), TODAY)
        self.assertIn('פוגע בהגעה לשדה התעופה', notes)
        self.assertEqual(br['interest'], 0)

    def test_minor_disruption_does_not_push_down_a_significant_exhibition(self):
        exhibition = prio(cand(**TATE_MAJOR))
        self.assertGreater(exhibition, prio(cand(**DISTRICT_MINOR)))
        self.assertGreater(exhibition, prio(cand(**WINDRUSH_PART)))

    def test_new_attraction_outranks_marginal_disruption(self):
        new = cand(**NEW_ATTRACTION)
        _, br, notes = priority.priority(new, TODAY)
        self.assertIn('אטרקציה או חלל חדש', notes)
        self.assertGreater(prio(new), prio(cand(**WINDRUSH_PART)) + 20)
        self.assertGreater(prio(new), prio(cand(**DISTRICT_MINOR)))

    def test_no_built_in_preference_for_negative_news(self):
        # אותה תקרה לשני הצדדים, וידיעה שלילית חלשה נשארת נמוכה
        self.assertEqual(priority.priority(cand(**PICCADILLY_FULL), TODAY)[1]['practical'], 40)
        strong_positive = cand(**dict(NEW_ATTRACTION, summary=NEW_ATTRACTION['summary'] + ' Free family festival for Christmas.'))
        self.assertEqual(priority.priority(strong_positive, TODAY)[1]['interest'], 40)
        self.assertLess(prio(cand(**WINDRUSH_PART)), prio(cand(**VA_DROP_IN)))

    def test_part_closure_affecting_airport_beats_one_that_does_not(self):
        hits = cand(**dict(PICCADILLY_FULL, title='Piccadilly: Part Closure', flags={'line_id': 'piccadilly', 'severity': 5},
                           summary='PICCADILLY LINE: no service between Acton Town and Heathrow Terminals.'))
        spares = cand(**dict(PICCADILLY_FULL, title='Piccadilly: Part Closure B', flags={'line_id': 'piccadilly', 'severity': 5},
                             summary='PICCADILLY LINE: no service between Cockfosters and Uxbridge. '
                                     'Trains continue between Acton Town and Heathrow.'))
        self.assertGreater(prio(hits), prio(spares) + 8)


# ---------------------------------------------------------------------------

EXTRA_VAM = ''.join('''<li class="b-event-teaser js-wo-event " id="x%d" data-wo-type="%s" data-wo-audience="" data-wo-venue="south-kensington" data-wo-free="false">
<article itemscope itemprop="event" itemtype="http://schema.org/Event">
<meta itemprop="name" content="%s">
<meta itemprop="startDate" content="2026-11-%02d">
<meta itemprop="endDate" content="2027-02-%02d">
<meta itemprop="description" content="Exhibition number %d at South Kensington.">
<a class="b-event-teaser__link" href="/exhibitions/extra-%d">
<div class="b-event-teaser__description"><div class="b-event-teaser__type">Exhibition</div>
<h2 class="b-event-teaser__title">%s</h2></div></a>
</article>
</li>
''' % (i, 'exhibition', name, 2 + i, 2 + i, i, i, name) for i, name in enumerate(
    ['Silver and Gold', 'Ceramics of Delft', 'Japanese Prints', 'Theatre Posters', 'Glass Through Time', 'Wedding Dresses']))


class QueueTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='news-queue-')
        self.state = os.path.join(self.tmp, 'state')
        self.registry = os.path.join(self.tmp, 'registry.json')
        with open(self.registry, 'w') as f:
            json.dump({'published': []}, f)
        self.fx = os.path.join(self.tmp, 'busy')
        shutil.copytree(BASIC, self.fx)
        self.edit('vam_whatson.html', '</ul>', EXTRA_VAM + '</ul>')
        self.n = 0
        self.saved = (config.MAX_ACCEPT_PER_RUN, config.MAX_HOLD_PER_RUN)

    def tearDown(self):
        config.MAX_ACCEPT_PER_RUN, config.MAX_HOLD_PER_RUN = self.saved
        shutil.rmtree(self.tmp, ignore_errors=True)

    def edit(self, name, old, new):
        p = os.path.join(self.fx, name)
        with open(p, encoding='utf-8') as f:
            s = f.read()
        self.assertIn(old, s)
        with open(p, 'w', encoding='utf-8') as f:
            f.write(s.replace(old, new))

    def go(self, now='2026-10-20T05:00:00Z', extra=()):
        self.n += 1
        out = os.path.join(self.tmp, 'out%d' % self.n)
        with NoNetwork():
            code = runner.run(['--fixtures', self.fx, '--now', now, '--out', out, '--state', self.state,
                               '--registry', self.registry] + list(extra))
        self.assertEqual(code, 0)
        d = os.path.join(out, os.listdir(out)[0])
        def load(n):
            with open(os.path.join(d, n), encoding='utf-8') as f:
                return json.load(f)
        with open(os.path.join(d, 'report.md'), encoding='utf-8') as f:
            report = f.read()
        return load('run.json'), load('decisions.json')['results'], load('drafts.json'), report

    def decide(self, *specs):
        with NoNetwork():
            return runner.run(['--state', self.state] + [x for s in specs for x in ('--decide', s)])

    def by_title(self, results, title):
        return next(r for r in results if r['candidate']['title'].startswith(title))

    def state_items(self):
        with open(os.path.join(self.state, 'state.json'), encoding='utf-8') as f:
            return json.load(f)['items']

    # 3. שתי ריצות רצופות על נתונים זהים
    def test_two_consecutive_identical_runs_are_consistent(self):
        run1, res1, dr1, _ = self.go()
        run2, res2, dr2, report2 = self.go(now='2026-10-20T16:00:00Z')
        self.assertGreater(len(dr1['drafts']), 0)
        self.assertGreater(len(dr1['backlog']), 0, 'the busy fixture must overflow the queue')
        self.assertEqual(dr2['drafts'], [])
        self.assertEqual(run2['outcome'], 'nothing_to_publish')
        self.assertEqual(run2['counts']['new_admitted'], 0)
        self.assertEqual({p['fingerprint'] for p in dr2['pending']}, {d['fingerprint'] for d in dr1['drafts']})
        self.assertEqual({p['fingerprint'] for p in dr2['backlog']}, {p['fingerprint'] for p in dr1['backlog']})
        self.assertIn('ממתינים להחלטה מריצות קודמות (%d)' % len(dr1['drafts']), report2)
        # וריצה שלישית מחזירה בדיוק אותה תמונה
        run3, _, dr3, _ = self.go(now='2026-10-21T05:00:00Z')
        self.assertEqual(dr3['drafts'], [])
        self.assertEqual(len(dr3['pending']), len(dr1['drafts']))

    # 4. פריט ממתין שמופיע שוב
    def test_pending_item_reappears_without_new_recommendation(self):
        run1, res1, dr1, _ = self.go()
        fp = self.by_title(res1, 'Piccadilly')['candidate']['fingerprint']
        self.assertIn(fp, {d['fingerprint'] for d in dr1['drafts']})
        run2, res2, dr2, _ = self.go(now='2026-10-20T16:00:00Z')
        r = self.by_title(res2, 'Piccadilly')
        self.assertEqual(r['decision'], 'PENDING')
        self.assertEqual(r['queue']['lifecycle'], 'pending')
        self.assertEqual(r['queue']['first_seen_run'], run1['run_id'])
        self.assertNotIn(fp, {d['fingerprint'] for d in dr2['drafts']})
        self.assertEqual(self.state_items()[fp]['status'], 'pending')

    # 5. עדכון מהותי לידיעה שכבר נבדקה
    def test_material_update_to_reviewed_item_is_shown_again(self):
        run1, res1, _, _ = self.go()
        fp = self.by_title(res1, 'Costumes of the Stage')['candidate']['fingerprint']
        self.assertEqual(self.decide(fp + '=reject'), 0)
        _, res2, dr2, _ = self.go(now='2026-10-20T16:00:00Z')
        r = self.by_title(res2, 'Costumes of the Stage')
        self.assertEqual(r['decision'], 'REJECT')
        self.assertIn('נדחה על ידי הבעלים', r['main_reason'])
        self.edit('vam_whatson.html', 'content="2027-03-01"', 'content="2027-04-30"')
        _, res3, dr3, report3 = self.go(now='2026-10-21T05:00:00Z')
        r = self.by_title(res3, 'Costumes of the Stage')
        self.assertEqual(r['classification']['verdict'], 'UPDATE')
        self.assertEqual(r['decision'], 'HOLD_FOR_REVIEW')
        self.assertEqual(r['queue']['admitted'], 'update')
        d = next(d for d in dr3['drafts'] if d['fingerprint'] == fp)
        self.assertTrue(any('valid_to' in ch for ch in d['changes']))
        self.assertIn('עדכונים לפריטים שכבר נבדקו (1)', report3)
        self.assertEqual(self.state_items()[fp]['status'], 'pending')

    def test_approved_item_is_not_shown_again_while_unchanged(self):
        _, res1, _, _ = self.go()
        fp = self.by_title(res1, 'Piccadilly')['candidate']['fingerprint']
        self.assertEqual(self.decide(fp[:16] + '=approve'), 0)
        _, res2, dr2, _ = self.go(now='2026-10-20T16:00:00Z')
        self.assertEqual(self.by_title(res2, 'Piccadilly')['decision'], 'REJECT')
        self.assertNotIn(fp, {p['fingerprint'] for p in dr2['pending']})

    # 6. מועמדים שנשארו מחוץ למכסה
    def test_over_cap_items_wait_in_backlog_and_never_pose_as_new(self):
        run1, res1, dr1, _ = self.go()
        backlog1 = [r for r in res1 if r['decision'] == 'BACKLOG']
        self.assertTrue(backlog1)
        for r in backlog1:
            self.assertIn('התור מלא', r['main_reason'])
        _, res2, dr2, _ = self.go(now='2026-10-20T16:00:00Z')
        for r in res2:
            if r['candidate']['fingerprint'] in {b['candidate']['fingerprint'] for b in backlog1}:
                self.assertEqual((r['decision'], r['queue']['lifecycle']), ('BACKLOG', 'backlog'))
        # מפנים מקום: הבעלים מחליט על שני פריטים של V&A שממתינים
        vam_pending = [d['fingerprint'] for d in dr1['drafts'] if d['source']['source_id'] == 'vam_whatson']
        self.assertEqual(self.decide(*['%s=reject' % fp for fp in vam_pending[:2]]), 0)
        run3, res3, dr3, report3 = self.go(now='2026-10-21T05:00:00Z')
        self.assertTrue(dr3['drafts'])
        for d in dr3['drafts']:
            self.assertEqual(d['queue']['lifecycle'], 'backlog')
            self.assertEqual(d['queue']['first_seen_run'], run1['run_id'])
        self.assertEqual(run3['counts']['new_admitted'], 0)
        self.assertGreaterEqual(run3['counts']['from_backlog'], 1)
        self.assertIn('חיכה בתור מחוץ למכסה', report3)

    def test_urgent_item_enters_a_full_queue(self):
        config.MAX_ACCEPT_PER_RUN, config.MAX_HOLD_PER_RUN = 1, 1
        with open(os.path.join(self.fx, 'tfl_planned.json'), encoding='utf-8') as f:
            planned = f.read()
        with open(os.path.join(self.fx, 'tfl_planned.json'), 'w', encoding='utf-8') as f:
            f.write('[]')
        _, res1, dr1, _ = self.go()
        self.assertEqual(len(dr1['drafts']), 2)
        with open(os.path.join(self.fx, 'tfl_planned.json'), 'w', encoding='utf-8') as f:
            f.write(planned)
        _, res2, dr2, _ = self.go(now='2026-10-20T16:00:00Z')
        r = self.by_title(res2, 'Piccadilly')
        self.assertEqual(r['queue']['admitted'], 'urgent')
        self.assertEqual([d['facts']['title'] for d in dr2['drafts']], ['Piccadilly: Planned Closure'])

    def test_pending_item_leaves_queue_when_it_expires(self):
        _, res1, _, _ = self.go()
        fp = self.by_title(res1, 'Piccadilly')['candidate']['fingerprint']
        run2, res2, dr2, report2 = self.go(now='2026-11-03T06:00:00Z')
        self.assertNotIn(fp, {p['fingerprint'] for p in dr2['pending']})
        self.assertIn('Piccadilly: Planned Closure', [x['title'] for x in dr2['left_queue']])
        self.assertEqual(self.state_items()[fp]['status'], 'expired')
        self.assertIn('יצאו מהתור', report2)

    def test_decide_with_unknown_id_fails(self):
        self.go()
        self.assertEqual(self.decide('nope:000=approve'), 1)
        self.assertEqual(self.decide('tfl=approve'), 1)          # תחילית שאינה ייחודית
        self.assertEqual(self.decide('x=maybe'), 1)

    def test_phase0_state_is_migrated_as_pending(self):
        os.makedirs(self.state)
        with open(os.path.join(self.state, 'state.json'), 'w', encoding='utf-8') as f:
            json.dump({'drafted': [{'fingerprint': 'tate_whatson:old', 'source_id': 'tate_whatson', 'title': 'Old item',
                                    'datePublished': '2026-10-19', 'sourceUrls': [], 'entity': 'Old item',
                                    'entityNorm': 'old item', 'summaryNorm': '', 'material': {}, 'materialHash': 'x',
                                    'run_id': 'r0'}], 'govuk_watch': {}}, f)
        _, _, dr, _ = self.go()
        self.assertIn('tate_whatson:old', {p['fingerprint'] for p in dr['pending']})


if __name__ == '__main__':
    unittest.main()
