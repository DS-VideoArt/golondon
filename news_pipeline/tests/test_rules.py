# -*- coding: utf-8 -*-
"""פענוח תאריכים, בדיקת עובדות, ושכבת הרשת: robots וחסימות בלי עקיפה."""
import datetime, io, unittest, urllib.error

from news_pipeline import dates, factcheck
from news_pipeline.fetch import LiveFetcher, SourceError

REF = datetime.date(2026, 10, 20)


class DatesTest(unittest.TestCase):

    def p(self, s):
        r = dates.parse_range(s, REF)
        return r['kind'], r['valid_from'], r['valid_to'], r['year_inferred']

    def test_full_range(self):
        self.assertEqual(self.p('12 Nov 2026 – 11 Apr 2027'), ('range', '2026-11-12', '2027-04-11', False))

    def test_range_with_end_year_only(self):
        self.assertEqual(self.p('10 Jun – 17 Oct 2027'), ('range', '2027-06-10', '2027-10-17', False))

    def test_until(self):
        self.assertEqual(self.p('Until 3 Jan 2027'), ('until', None, '2027-01-03', False))

    def test_day_range_without_year_is_marked_inferred(self):
        self.assertEqual(self.p('27 - 29 October, 11am - 3:30pm'), ('range', '2026-10-27', '2026-10-29', True))

    def test_range_crossing_year_without_year(self):
        self.assertEqual(self.p('31 August - 19 December')[:3], ('range', '2026-08-31', '2026-12-19'))

    def test_january_after_october_rolls_to_next_year(self):
        self.assertEqual(self.p('9 January')[1], '2027-01-09')

    def test_no_date_means_no_date(self):
        self.assertEqual(self.p('Ongoing')[:3], ('ongoing', None, None))
        self.assertEqual(self.p('Daily')[:3], (None, None, None))


class FactCheckTest(unittest.TestCase):
    SRC = 'Half Term Halloween Trail. 27 - 29 October, 11am - 3:30pm. Free family trail in Hyde Park. Tickets £12.'

    def test_supported_hebrew_text_passes(self):
        r = factcheck.verify_text('שביל ליל כל הקדושים בהייד פארק, 27 עד 29 באוקטובר, 11:00 עד 15:30, £12', self.SRC)
        self.assertTrue(r['passed'], r)

    def test_invented_date_fails(self):
        r = factcheck.verify_text('השביל פתוח עד 31 באוקטובר', self.SRC)
        self.assertFalse(r['passed'])
        self.assertEqual(r['unsupported'][0]['type'], 'date')

    def test_invented_price_and_time_fail(self):
        r = factcheck.verify_text('הכניסה £15 והשביל נפתח ב-10:00', self.SRC)
        self.assertEqual(sorted(u['type'] for u in r['unsupported']), ['money', 'time'])

    def test_invented_number_fails(self):
        r = factcheck.verify_text('יותר מ-200 דלעות לאורך השביל', self.SRC)
        self.assertFalse(r['passed'])

    def test_candidate_field_without_evidence_fails(self):
        c = {'title': 'X', 'summary': '', 'source_text': 'X. 27 October', 'valid_from': '2026-10-27',
             'valid_to': '2026-10-27', 'evidence': {'valid_from': '27 October'}, 'status': 'scheduled'}
        r = factcheck.verify_candidate(c)
        self.assertFalse(r['passed'])
        self.assertIn('valid_to', r['problems'][0])

    def test_candidate_evidence_not_in_source_fails(self):
        c = {'title': 'X', 'summary': '', 'source_text': 'X. 27 October', 'valid_from': '2026-10-28',
             'evidence': {'valid_from': '28 October'}, 'status': 'scheduled'}
        self.assertFalse(factcheck.verify_candidate(c)['passed'])

    def test_candidate_value_must_match_evidence(self):
        c = {'title': 'X', 'summary': '', 'source_text': 'X. 27 October', 'valid_from': '2026-10-29',
             'evidence': {'valid_from': '27 October'}, 'status': 'scheduled'}
        self.assertFalse(factcheck.verify_candidate(c)['passed'])


class _Resp(io.BytesIO):
    status = 200


class FetchTest(unittest.TestCase):

    def make(self, robots, pages):
        calls = []

        def opener(req, timeout):
            url = req.full_url
            calls.append(url)
            if url.endswith('/robots.txt'):
                if isinstance(robots, int):
                    raise urllib.error.HTTPError(url, robots, 'x', {}, None)
                return _Resp(robots.encode())
            code = pages.get(url, 200)
            if code != 200:
                raise urllib.error.HTTPError(url, code, 'x', {}, None)
            return _Resp(b'ok')
        return LiveFetcher(opener=opener, sleep=lambda s: None), calls

    def test_robots_disallow_blocks_without_requesting_the_page(self):
        f, calls = self.make('User-agent: *\nDisallow: /public/data/\n', {})
        with self.assertRaises(SourceError) as e:
            f.get('https://example.org/public/data/feed.xml', 'k')
        self.assertEqual(e.exception.kind, 'blocked_robots')
        self.assertEqual(calls, ['https://example.org/robots.txt'])

    def test_403_is_reported_and_not_retried(self):
        f, calls = self.make('User-agent: *\nAllow: /\n', {'https://example.org/page': 403})
        with self.assertRaises(SourceError) as e:
            f.get('https://example.org/page', 'k')
        self.assertEqual(e.exception.kind, 'blocked_http')
        self.assertEqual(calls.count('https://example.org/page'), 1)

    def test_missing_robots_allows(self):
        f, _ = self.make(404, {})
        self.assertEqual(f.get('https://example.org/page', 'k'), b'ok')

    def test_forbidden_robots_disallows_everything(self):
        f, calls = self.make(403, {})
        with self.assertRaises(SourceError):
            f.get('https://example.org/page', 'k')
        self.assertNotIn('https://example.org/page', calls)

    def test_user_agent_is_honest(self):
        seen = {}

        def opener(req, timeout):
            seen[req.full_url] = req.get_header('User-agent')
            if req.full_url.endswith('robots.txt'):
                raise urllib.error.HTTPError(req.full_url, 404, 'x', {}, None)
            return _Resp(b'ok')
        LiveFetcher(opener=opener, sleep=lambda s: None).get('https://example.org/a', 'k')
        self.assertTrue(all(v.startswith('GoLondonNewsBeta/') for v in seen.values()))


if __name__ == '__main__':
    unittest.main()
