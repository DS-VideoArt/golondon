# -*- coding: utf-8 -*-
"""
זיהוי ידיעות שכבר פורסמו ב"מה חדש בלונדון".

המקור לבדיקה הוא מה שבאמת עלה לאתר: whats-new.json והמרשם whats-new-registry.json. בענן הקוד
נטען מ-SHA קבוע, אבל שני הקבצים האלה נקראים מ-main העדכני (כנתונים בלבד, לא כקוד), כי אחרת
פריט שפורסם אחרי נעיצת הקוד לא היה מזוהה.

שני מפתחות, לפי סדר האמינות:
  1. news_fingerprint  שדה אופציונלי באייטם של whats-new.json. ממלא אותו מי שמעביר טיוטה לפרסום
                       (משימת ה-BUILDER ב-DS AI Operations). התאמה מדויקת, בלי ניחוש
  2. כתובת המקור       כתובת הפריט אצל המקור, אחרי נרמול: https, בלי www, בלי עוגן, בלי פרמטרי
                       מעקב ובלי לוכסן בסוף. מכסה גם אייטמים שפורסמו לפני שהיה fingerprint

כתובת כללית שמשותפת לפריטים רבים (למשל עמוד הסטטוס של TfL, ראו SHARED_URLS) לא נחשבת מזהה,
ולכן פריטים כאלה מזוהים כמפורסמים רק לפי news_fingerprint.
"""
import json, os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

TRACKING = ('utm_', 'fbclid', 'gclid', 'mc_', 'ref', 'referrer')
# כתובות שמשותפות לפריטים רבים ואינן מזהות פריט אחד
SHARED_URLS = {
    'https://tfl.gov.uk/tube-dlr-overground/status',
    'https://www.gov.uk/bank-holidays',
    'https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings',
}


def norm_url(url):
    if not url:
        return None
    u = urlsplit(url.strip())
    host = (u.hostname or '').lower()
    if host.startswith('www.'):
        host = host[4:]
    if not host:
        return None
    q = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
         if not any(k.lower().startswith(t) for t in TRACKING)]
    path = u.path.rstrip('/') or ''
    return urlunsplit(('https', host, path, urlencode(sorted(q)), ''))


SHARED = {norm_url(u) for u in SHARED_URLS}


def _read(path):
    if not path or not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)


class Index:
    """אינדקס של מה שפורסם. לא כותב לשום קובץ."""

    def __init__(self, whats_new_path=None, registry_path=None):
        self.by_fp, self.by_url = {}, {}
        self.sources = []
        feed = _read(whats_new_path)
        if feed is not None:
            self.sources.append('whats-new.json')
            for it in feed.get('items', []):
                self._add(it.get('id'), it.get('date'), it.get('news_fingerprint'),
                          [s.get('url') for s in it.get('sources', [])])
        reg = _read(registry_path)
        if reg is not None:
            self.sources.append('whats-new-registry.json')
            for p in reg.get('published', []):
                self._add(p.get('id'), p.get('datePublished'), p.get('newsFingerprint'), p.get('sourceUrls', []))

    def _add(self, item_id, date, fp, urls):
        rec = {'id': item_id, 'date': date}
        if fp:
            self.by_fp[fp] = rec
        for u in urls or []:
            n = norm_url(u)
            if n and n not in SHARED:
                self.by_url.setdefault(n, rec)

    def match(self, fingerprint, item_url):
        """(רשומת פרסום, איך זוהה) או None."""
        if fingerprint and fingerprint in self.by_fp:
            return self.by_fp[fingerprint], 'news_fingerprint'
        n = norm_url(item_url)
        if n and n not in SHARED and n in self.by_url:
            return self.by_url[n], 'source_url'
        return None

    def __len__(self):
        return len(set(map(id, self.by_fp.values())) | set(map(id, self.by_url.values())))
