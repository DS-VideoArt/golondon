# -*- coding: utf-8 -*-
import datetime, html as _html, re

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

from .. import config


def text(fragment):
    """HTML לטקסט נקי, שורה אחת."""
    t = re.sub(r'<(script|style)\b.*?</\1>', ' ', fragment or '', flags=re.S | re.I)
    t = re.sub(r'<[^>]+>', ' ', t)
    return ' '.join(_html.unescape(t).split())


def attr(fragment, name):
    m = re.search(r'\b%s="([^"]*)"' % re.escape(name), fragment or '')
    return _html.unescape(m.group(1)).strip() if m else None


def first(pattern, fragment, flags=re.S):
    m = re.search(pattern, fragment or '', flags)
    return m.group(1) if m else None


def parse_utc(s):
    """ISO עם Z או היסט. מחזיר datetime מודע ל-UTC."""
    if not s:
        return None
    s = s.strip().replace('Z', '+00:00')
    d = datetime.datetime.fromisoformat(s)
    if d.tzinfo is None:
        d = d.replace(tzinfo=datetime.timezone.utc)
    return d.astimezone(datetime.timezone.utc)


def london_date(dt):
    return dt.astimezone(ZoneInfo(config.LONDON_TZ)).date()


def iso_utc(dt):
    return dt.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ') if dt else None
