# -*- coding: utf-8 -*-
"""
שכבת הרשת. קריאה בלבד, מקור אחד בכל פעם, עם כבוד מלא ל-robots.txt.

אין עקיפה של חסימה: robots שאוסר, תשובת 401, 403, 429 או 451, הכול נרשם כחסימה ולא מנסים
שוב, לא מחליפים User-Agent ולא עוברים דרך שירות אחר. מצב fixtures קורא קבצים מקומיים בלבד
ולעולם לא פותח חיבור רשת.
"""
import glob, os, time, urllib.error, urllib.request, urllib.robotparser
from urllib.parse import urlparse

from . import config

BLOCK_CODES = (401, 403, 429, 451)


class SourceError(Exception):
    """kind: blocked_robots, blocked_http, http_error, network, too_large, fixture_missing, parse_error"""

    def __init__(self, kind, detail=''):
        Exception.__init__(self, '%s: %s' % (kind, detail))
        self.kind = kind
        self.detail = detail


def _default_opener(req, timeout):
    return urllib.request.urlopen(req, timeout=timeout)


class LiveFetcher:
    mode = 'live'

    def __init__(self, opener=None, sleep=time.sleep, clock=time.monotonic):
        self.opener = opener or _default_opener
        self.sleep = sleep
        self.clock = clock
        self.log = []
        self._robots = {}
        self._last = {}

    def _request(self, url):
        host = urlparse(url).netloc
        wait = config.MIN_SECONDS_BETWEEN_REQUESTS_PER_HOST - (self.clock() - self._last.get(host, -1e9))
        if wait > 0:
            self.sleep(wait)
        self._last[host] = self.clock()
        req = urllib.request.Request(url, headers={'User-Agent': config.USER_AGENT,
                                                   'Accept': '*/*'})
        return self.opener(req, config.HTTP_TIMEOUT)

    def _robots_for(self, url):
        u = urlparse(url)
        root = '%s://%s' % (u.scheme, u.netloc)
        if root in self._robots:
            return self._robots[root]
        rp = urllib.robotparser.RobotFileParser()
        try:
            r = self._request(root + '/robots.txt')
            rp.parse(r.read(500_000).decode('utf-8', 'replace').splitlines())
            note = 'robots.txt %s' % getattr(r, 'status', 200)
        except urllib.error.HTTPError as e:
            # RFC 9309: 4xx פירושו שאין הגבלות, למעט 401 ו-403 שאנחנו מפרשים כאיסור
            if e.code in (401, 403):
                rp.disallow_all = True
            elif 400 <= e.code < 500:
                rp.allow_all = True
            else:
                rp.disallow_all = True
            note = 'robots.txt HTTP %s' % e.code
        except Exception as e:  # רשת לא זמינה: לא מניחים שמותר
            rp.disallow_all = True
            note = 'robots.txt unreachable (%s)' % type(e).__name__
        self._robots[root] = (rp, note)
        return self._robots[root]

    def get(self, url, key=None):
        rp, note = self._robots_for(url)
        entry = {'url': url, 'key': key, 'robots': note}
        if not rp.can_fetch(config.USER_AGENT, url):
            entry['result'] = 'blocked_robots'
            self.log.append(entry)
            raise SourceError('blocked_robots', 'robots.txt disallows %s' % urlparse(url).path)
        t0 = self.clock()
        try:
            r = self._request(url)
            body = r.read(config.MAX_BYTES + 1)
        except urllib.error.HTTPError as e:
            entry['result'] = 'HTTP %s' % e.code
            self.log.append(entry)
            if e.code in BLOCK_CODES:
                raise SourceError('blocked_http', 'HTTP %s, not retried and not bypassed' % e.code)
            raise SourceError('http_error', 'HTTP %s' % e.code)
        except Exception as e:
            entry['result'] = 'network %s' % type(e).__name__
            self.log.append(entry)
            raise SourceError('network', type(e).__name__)
        if len(body) > config.MAX_BYTES:
            entry['result'] = 'too_large'
            self.log.append(entry)
            raise SourceError('too_large', '> %d bytes' % config.MAX_BYTES)
        entry.update(result='HTTP %s' % getattr(r, 'status', 200), bytes=len(body),
                     ms=int((self.clock() - t0) * 1000))
        self.log.append(entry)
        return body


class FixtureFetcher:
    """קורא <dir>/<key>.<כל סיומת>. לעולם לא ניגש לרשת."""
    mode = 'fixtures'

    def __init__(self, directory):
        self.dir = directory
        self.log = []

    def get(self, url, key=None):
        hits = sorted(glob.glob(os.path.join(self.dir, '%s.*' % key))) if key else []
        if not hits:
            self.log.append({'url': url, 'key': key, 'result': 'fixture_missing'})
            raise SourceError('fixture_missing', 'no fixture for %s' % key)
        with open(hits[0], 'rb') as f:
            body = f.read()
        self.log.append({'url': url, 'key': key, 'result': 'fixture', 'file': os.path.basename(hits[0]),
                         'bytes': len(body)})
        return body
