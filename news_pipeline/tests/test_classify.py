# -*- coding: utf-8 -*-
"""הסיווג החדש ב-whats_new_dedup: חדש, עדכון, ביטול, כפילות ופג תוקף. בלי לקרוא או לכתוב את המרשם האמיתי."""
import datetime, hashlib, json, os, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))

import whats_new_dedup as dedup  # noqa: E402

TODAY = datetime.date(2026, 10, 20)


def _md5(path):
    with open(path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()


def _feed():
    with open(os.path.join(REPO, 'whats-new.json'), encoding='utf-8') as f:
        return json.load(f)


def cand(**kw):
    c = {'fingerprint': 'tate_whatson:abc', 'source_id': 'tate_whatson', 'title': 'Bright Lights: A Winter Show',
         'entity': 'Bright Lights, Tate Modern', 'summary': 'Light installations for the darker months',
         'sources': [{'name': 'Tate', 'url': 'https://www.tate.org.uk/whats-on/tate-modern/bright-lights'}],
         'status': 'scheduled', 'valid_from': '2026-11-12', 'valid_to': '2027-04-11'}
    c.update(kw)
    return c


PUBLISHED = [{
    'id': '2026-10-01-bright-lights', 'title': 'אורות בטייט מודרן', 'datePublished': '2026-10-01',
    'sourceUrls': ['https://www.tate.org.uk/whats-on/tate-modern/bright-lights'],
    'entity': 'Bright Lights, Tate Modern', 'entityNorm': dedup.entity_key('Bright Lights, Tate Modern'),
    'summaryNorm': dedup.norm('תערוכת אור לחודשים החשוכים'),
}]


class ClassifyTest(unittest.TestCase):

    def test_new(self):
        v = dedup.classify(cand(), TODAY, registry=[], drafted=[])
        self.assertEqual(v['verdict'], dedup.NEW)

    def test_duplicate_of_previous_draft(self):
        prior = dedup.draft_record(cand(), 'run-1')
        v = dedup.classify(cand(), TODAY, registry=[], drafted=[prior])
        self.assertEqual(v['verdict'], dedup.DUPLICATE)
        self.assertIn('run-1', v['reason'])

    def test_duplicate_of_published_item_uses_the_four_layers(self):
        v = dedup.classify(cand(), TODAY, registry=PUBLISHED, drafted=[])
        self.assertEqual(v['verdict'], dedup.DUPLICATE)
        self.assertEqual(v['layer'], 'url')
        other_url = cand(sources=[{'name': 'x', 'url': 'https://example.com/other'}])
        v = dedup.classify(other_url, TODAY, registry=PUBLISHED, drafted=[])
        self.assertEqual((v['verdict'], v['layer']), (dedup.DUPLICATE, 'entity'))

    def test_same_subject_from_other_source_is_duplicate_not_update(self):
        prior = dedup.draft_record(cand(), 'run-1')
        other = cand(fingerprint='vam_whatson:zzz', source_id='vam_whatson', valid_to='2027-05-01',
                     sources=[{'name': 'x', 'url': 'https://example.com/b'}])
        v = dedup.classify(other, TODAY, registry=[], drafted=[prior])
        self.assertEqual(v['verdict'], dedup.DUPLICATE)

    def test_same_source_different_items_are_not_duplicates(self):
        a = cand(fingerprint='tfl_planned:1', source_id='tfl_planned', title='Piccadilly: Part Closure',
                 entity='Piccadilly Part Closure 2026-10-28', valid_from='2026-10-28', valid_to='2026-10-30',
                 sources=[{'name': 'TfL', 'url': 'https://tfl.gov.uk/tube-dlr-overground/status/'}])
        b = dict(a, fingerprint='tfl_planned:2', entity='Piccadilly Part Closure 2026-11-04',
                 valid_from='2026-11-04', valid_to='2026-11-05')
        v = dedup.classify(b, TODAY, registry=[], drafted=[dedup.draft_record(a)])
        self.assertEqual(v['verdict'], dedup.NEW)

    def test_same_source_listing_twice_is_duplicate(self):
        a = cand()
        b = cand(fingerprint='tate_whatson:other-href')
        v = dedup.classify(b, TODAY, registry=[], drafted=[dedup.draft_record(a)])
        self.assertEqual((v['verdict'], v['layer']), (dedup.DUPLICATE, 'same_source'))

    def test_update_when_dates_change(self):
        prior = dedup.draft_record(cand(), 'run-1')
        v = dedup.classify(cand(valid_to='2027-05-31'), TODAY, registry=[], drafted=[prior])
        self.assertEqual(v['verdict'], dedup.UPDATE)
        self.assertTrue(any('valid_to' in ch for ch in v['changes']))

    def test_update_when_source_marks_published_item_updated(self):
        v = dedup.classify(cand(source_updated=True), TODAY, registry=PUBLISHED, drafted=[])
        self.assertEqual(v['verdict'], dedup.UPDATE)

    def test_cancellation_of_drafted_item(self):
        prior = dedup.draft_record(cand(), 'run-1')
        v = dedup.classify(cand(status='cancelled'), TODAY, registry=[], drafted=[prior])
        self.assertEqual(v['verdict'], dedup.CANCELLATION)
        self.assertIsNotNone(v['matched'])

    def test_cancellation_of_published_item_needs_correction(self):
        v = dedup.classify(cand(status='postponed'), TODAY, registry=PUBLISHED, drafted=[])
        self.assertEqual(v['verdict'], dedup.CANCELLATION)
        self.assertIn('תיקון', v['reason'])

    def test_cancellation_of_unknown_item(self):
        v = dedup.classify(cand(status='cancelled'), TODAY, registry=[], drafted=[])
        self.assertEqual(v['verdict'], dedup.CANCELLATION)
        self.assertIsNone(v['matched'])

    def test_repeated_cancellation_is_duplicate(self):
        prior = dedup.draft_record(cand(status='cancelled'), 'run-1')
        v = dedup.classify(cand(status='cancelled'), TODAY, registry=[], drafted=[prior])
        self.assertEqual(v['verdict'], dedup.DUPLICATE)

    def test_expired(self):
        v = dedup.classify(cand(valid_from='2026-10-01', valid_to='2026-10-10'), TODAY, registry=[], drafted=[])
        self.assertEqual(v['verdict'], dedup.EXPIRED)
        self.assertIn('2026-10-10', v['reason'])

    def test_last_day_is_not_expired(self):
        v = dedup.classify(cand(valid_to='2026-10-20'), TODAY, registry=[], drafted=[])
        self.assertEqual(v['verdict'], dedup.NEW)


class CheckUnchangedTest(unittest.TestCase):
    """check() הישן ממשיך לעבוד על המרשם האמיתי, ולא כותב אליו."""

    def test_check_still_rejects_every_published_item(self):
        reg = os.path.join(REPO, 'whats-new-registry.json')
        before = _md5(reg)
        feed = _feed()
        for it in feed['items']:
            self.assertIsNotNone(dedup.check(it, TODAY), it['id'])
        self.assertIsNone(dedup.check({'title': 'Unrelated', 'entity': 'zzz', 'summary': '', 'sources': []}, TODAY))
        self.assertEqual(before, _md5(reg))

    def test_classify_reads_real_registry_without_writing(self):
        reg = os.path.join(REPO, 'whats-new-registry.json')
        before = _md5(reg)
        feed = _feed()
        it = dict(feed['items'][0], fingerprint='x:1', source_id='x', status='scheduled', valid_to=None)
        self.assertEqual(dedup.classify(it, TODAY)['verdict'], dedup.DUPLICATE)
        self.assertEqual(before, _md5(reg))


if __name__ == '__main__':
    unittest.main()
