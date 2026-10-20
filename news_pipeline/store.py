# -*- coding: utf-8 -*-
"""
שמירת זיכרון התור בין ריצות עצמאיות.

הבעיה: ב-GitHub Actions כל ריצה מתחילה בסביבה נקייה. קובץ מקומי נעלם בסוף הריצה, והריצה הבאה
רואה כל ידיעה כחדשה. בנוסף, שתי ריצות שחופפות קוראות את אותו מצב, והאחרונה שכותבת מוחקת את
השנייה.

שני מימושים, עם אותו חוזה בדיוק:
  FileStore  קובץ מקומי. להרצות במחשב ולבדיקות
  GitStore   מאגר git פרטי ונפרד, שמכיל רק את state.json ואת דוחות הריצות. מומלץ לענן

החוזה:
  begin()   קורא את המצב, מאמת אותו, ותופס נעילה עם תוקף מוגבל (lease). נכשל אם ריצה אחרת
            מחזיקה נעילה בתוקף, או אם החלון הזה (תאריך + בוקר/ערב) כבר הושלם. נעילה שפג תוקפה
            נחשבת לריצה שקרסה: היא נרשמת כ-abandoned והריצה החדשה ממשיכה
  commit()  כותב את המצב החדש ומשחרר את הנעילה, רק אם איש לא כתב מאז begin (compare and swap)
  abort()   משחרר את הנעילה ומסמן את הריצה כנכשלה, בלי לכתוב שום שינוי של הריצה
  peek()    קריאה בלבד, בלי נעילה

תקינות: לכל גרסה יש מספר, חתימת sha256 על התוכן ומי כתב אותה. מצב פגום לא מוחלף במצב ריק:
FileStore חוזר לגרסה הקודמת השמורה, GitStore חוזר לקומיט התקין האחרון. אם אין גרסה תקינה,
הריצה נעצרת, כי ריצה על זיכרון ריק הייתה מציגה הכול שוב כחדש.

אין כאן שום סוד: הזיכרון מכיל רק כותרות, קישורים וסטטוסים ממקורות ציבוריים והחלטות בעלים.
ההרשאה למאגר הפרטי מגיעה מסביבת ההרצה (למשל actions/checkout עם טוקן מסודות GitHub) ולא
נכתבת לשום קובץ.
"""
import copy, datetime, fcntl, hashlib, json, os, re, shutil, subprocess

SCHEMA = 2
STATE_FILE = 'state.json'
LEASE_MINUTES = 30
KEEP_RUNS = 120
RUNS_DIR = 'runs'
# מה שנשמר מכל ריצה במאגר הזיכרון. decisions.json (כ-700KB לריצה) לא נשמר כאן, כדי שהמאגר לא
# יגדל בכמה מאות מגה בשנה. בענן הוא מתאים ל-artifact של Actions עם תוקף מוגבל
RUN_FILES = ('report.md', 'drafts.json', 'run.json')


class StoreError(Exception):
    kind = 'state_error'


class Busy(StoreError):
    kind = 'busy'


class AlreadyDone(StoreError):
    kind = 'duplicate_slot'


class Conflict(StoreError):
    kind = 'conflict'


class Unavailable(StoreError):
    """המצב חסר, פגום ללא גרסה תקינה, או שהמאגר לא נגיש. לא מריצים על זיכרון ריק."""
    kind = 'state_unavailable'


def _iso(dt):
    return dt.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _parse(s):
    return datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))


def checksum(state):
    body = {k: v for k, v in state.items() if k != '_meta'}
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()


def empty_state():
    return {'items': {}, 'govuk_watch': {}, 'runs': [], '_lock': None,
            '_meta': {'schema': SCHEMA, 'version': 0, 'updated_at': None, 'updated_by': None}}


def validate(state):
    """מחזיר את המצב אחרי השלמת שדות חסרים של גרסה ישנה, או זורק ValueError."""
    if not isinstance(state, dict):
        raise ValueError('state is not an object')
    meta = state.get('_meta')
    if meta is not None:
        if meta.get('schema') != SCHEMA:
            raise ValueError('unknown schema %r' % meta.get('schema'))
        if meta.get('sha256') and meta['sha256'] != checksum(state):
            raise ValueError('checksum mismatch, the file was changed or truncated')
    else:  # מצב של שלב 0 או 0.1, בלי חתימה
        state['_meta'] = {'schema': SCHEMA, 'version': 0, 'updated_at': None, 'updated_by': 'migrated'}
    if not isinstance(state.get('items', {}), dict):
        raise ValueError('items is not an object')
    if 'drafted' not in state:      # מבנה של שלב 0 עובר המרה ב-ledger.load
        state.setdefault('items', {})
    state.setdefault('govuk_watch', {})
    state.setdefault('runs', [])
    state.setdefault('_lock', None)
    return state


def _serialize(state):
    return json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True, default=str) + '\n'


def scrub(text):
    """לא מדפיסים כתובת עם פרטי הזדהות, גם לא בהודעת שגיאה."""
    return re.sub(r'(https?://)[^/@\s]+@', r'\1***@', text or '')


class Store:
    lease_minutes = LEASE_MINUTES

    # ---- מה שכל מימוש מספק
    def _read(self):
        """(state או None אם אין עדיין, token, notes)"""
        raise NotImplementedError

    def _write(self, state, token, message, out_dir=None, run_id=None):
        """כותב רק אם token עדיין עדכני. מחזיר token חדש או זורק Conflict."""
        raise NotImplementedError

    # ---- החוזה
    def peek(self):
        state, _, notes = self._read()
        return state if state is not None else empty_state(), notes

    def begin(self, run_id, slot_key, now, force=False, attempts=3):
        last = None
        for _ in range(attempts):
            state, token, notes = self._read()
            if state is None:
                state = empty_state()
            lock = state.get('_lock')
            recovered = None
            if lock and lock.get('run_id') != run_id:
                if _parse(lock['expires']) > now:
                    raise Busy('run %s holds the state lock until %s' % (lock['run_id'], lock['expires']))
                recovered = lock
                for r in state['runs']:
                    if r.get('run_id') == lock['run_id'] and r.get('status') == 'running':
                        r.update(status='abandoned', finished=_iso(now),
                                 note='lock expired without commit; treated as a crashed run')
            if slot_key and not force:
                done = [r for r in state['runs'] if r.get('slot_key') == slot_key and r.get('status') == 'completed']
                if done:
                    raise AlreadyDone('slot %s already completed by run %s' % (slot_key, done[-1]['run_id']))
            state['_lock'] = {'run_id': run_id, 'acquired': _iso(now),
                              'expires': _iso(now + datetime.timedelta(minutes=self.lease_minutes))}
            state['runs'].append({'run_id': run_id, 'slot_key': slot_key, 'status': 'running', 'started': _iso(now)})
            try:
                token = self._write(state, token, 'lock: %s' % run_id)
            except Conflict as e:
                last = e
                continue
            self.token = token
            self.run_id = run_id
            return state, {'recovered_lock': recovered, 'notes': notes}
        raise Busy('could not take the lock after %d attempts: %s' % (attempts, last))

    def commit(self, state, now, outcome, counts=None, out_dir=None):
        self._finish(state, now, 'completed', outcome=outcome, counts=counts)
        self.token = self._write(state, self.token, 'run %s: %s' % (self.run_id, outcome), out_dir=out_dir,
                                 run_id=self.run_id)

    def abort(self, now, error):
        """משחרר את הנעילה על גבי המצב השמור, ולא על גבי מה שהריצה שינתה בזיכרון."""
        state, token, _ = self._read()
        if state is None or (state.get('_lock') or {}).get('run_id') != self.run_id:
            return False
        self._finish(state, now, 'failed', error=str(error)[:300])
        try:
            self._write(state, token, 'run %s failed' % self.run_id)
        except StoreError:
            return False  # הנעילה תפוג מעצמה אחרי LEASE_MINUTES
        return True

    def _finish(self, state, now, status, **extra):
        state['_lock'] = None
        for r in reversed(state['runs']):
            if r.get('run_id') == self.run_id:
                r.update(status=status, finished=_iso(now), **{k: v for k, v in extra.items() if v is not None})
                break
        state['runs'] = state['runs'][-KEEP_RUNS:]
        meta = state.setdefault('_meta', {})
        meta.update(schema=SCHEMA, version=int(meta.get('version') or 0) + 1, updated_at=_iso(now),
                    updated_by=self.run_id)

    @staticmethod
    def seal(state):
        meta = state.setdefault('_meta', {'schema': SCHEMA, 'version': 0})
        meta['sha256'] = checksum(state)
        return _serialize(state)


class FileStore(Store):
    """קובץ מקומי. הכתיבה אטומית, הגרסה הקודמת נשמרת ב-state.prev.json, ו-flock מגן על הקריאה וההשוואה."""

    def __init__(self, directory):
        self.dir = directory
        self.path = os.path.join(directory, STATE_FILE)
        self.prev = os.path.join(directory, 'state.prev.json')

    def _load(self, path):
        with open(path, encoding='utf-8') as f:
            return validate(json.load(f))

    def _read(self):
        if not os.path.exists(self.path):
            return None, None, []
        try:
            state = self._load(self.path)
            return state, state['_meta'].get('sha256') or checksum(state), []
        except (ValueError, OSError) as e:
            if os.path.exists(self.prev):
                try:
                    state = self._load(self.prev)
                except (ValueError, OSError):
                    pass
                else:
                    return state, 'recovered', ['state.json was invalid (%s); recovered the previous version' % e]
            raise Unavailable('state.json is invalid and no valid previous version exists: %s' % e)

    def _current_token(self):
        if not os.path.exists(self.path):
            return None
        try:
            state = self._load(self.path)
            return state['_meta'].get('sha256') or checksum(state)
        except (ValueError, OSError):
            return 'recovered'

    def _write(self, state, token, message, out_dir=None, run_id=None):
        os.makedirs(self.dir, exist_ok=True)
        with open(os.path.join(self.dir, '.state.lock'), 'w') as lk:
            fcntl.flock(lk, fcntl.LOCK_EX)
            try:
                if self._current_token() != token:
                    raise Conflict('state.json changed since it was read')
                text = self.seal(state)
                if os.path.exists(self.path) and token != 'recovered':
                    shutil.copyfile(self.path, self.prev)
                tmp = self.path + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    f.write(text)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp, self.path)
                return state['_meta']['sha256']
            finally:
                fcntl.flock(lk, fcntl.LOCK_UN)


class GitStore(Store):
    """
    מאגר git פרטי שמשמש רק לזיכרון. workdir הוא שכפול קיים שלו (ב-Actions: actions/checkout עם
    טוקן מהסודות). כל קריאה מסונכרנת לענף המרוחק, וכל כתיבה היא commit ו-push רגיל. push שנדחה
    כי מישהו כתב בינתיים הוא Conflict. אין force push לעולם.
    """
    AUTHOR = ('-c', 'user.name=GoLondon News Beta', '-c', 'user.email=news-beta@users.noreply.github.com')

    def __init__(self, workdir, branch='main', init=False):
        self.dir = workdir
        self.branch = branch
        self.init = init

    def _git(self, *args, check=True):
        env = dict(os.environ, GIT_TERMINAL_PROMPT='0')
        p = subprocess.run(('git', '-C', self.dir) + self.AUTHOR + args, capture_output=True, text=True, env=env)
        if check and p.returncode != 0:
            raise Unavailable('git %s failed: %s' % (args[0], scrub(p.stderr.strip())[:300]))
        return p

    def _remote_head(self):
        self._git('fetch', '--quiet', 'origin')
        p = self._git('rev-parse', '--verify', '--quiet', 'origin/%s' % self.branch, check=False)
        return p.stdout.strip() if p.returncode == 0 else None

    def _read(self):
        if not os.path.isdir(os.path.join(self.dir, '.git')):
            raise Unavailable('state repository clone not found at the configured path')
        head = self._remote_head()
        if head is None:
            if not self.init:
                raise Unavailable('state branch %s does not exist yet; first run needs --init-state' % self.branch)
            return None, None, ['initialising an empty state repository']
        self._git('checkout', '--quiet', '-B', self.branch, head)
        self._git('reset', '--quiet', '--hard', head)
        notes = []
        for back in range(0, 6):
            p = self._git('show', '%s~%d:%s' % (head, back, STATE_FILE), check=False)
            if p.returncode != 0:
                if back == 0 and self.init:
                    return None, head, ['state.json missing; initialising']
                if back == 0:
                    raise Unavailable('state.json is missing from the state repository; refusing to start empty')
                break
            try:
                state = validate(json.loads(p.stdout))
            except ValueError as e:
                notes.append('commit %s~%d has an invalid state.json (%s)' % (head[:7], back, e))
                continue
            if back:
                notes.append('recovered state.json from commit %s~%d' % (head[:7], back))
            return state, head, notes
        raise Unavailable('no valid state.json in the last commits: %s' % '; '.join(notes))

    def _write(self, state, token, message, out_dir=None, run_id=None):
        head = self._git('rev-parse', 'HEAD', check=False).stdout.strip() if token else None
        if token and head != token:
            raise Conflict('local clone moved unexpectedly')
        with open(os.path.join(self.dir, STATE_FILE), 'w', encoding='utf-8') as f:
            f.write(self.seal(state))
        self._git('add', STATE_FILE)
        if out_dir and run_id and os.path.isdir(out_dir):
            dest = os.path.join(self.dir, RUNS_DIR, run_id)
            shutil.rmtree(dest, ignore_errors=True)
            os.makedirs(dest)
            for name in RUN_FILES:
                if os.path.exists(os.path.join(out_dir, name)):
                    shutil.copyfile(os.path.join(out_dir, name), os.path.join(dest, name))
            self._git('add', os.path.join(RUNS_DIR, run_id))
        self._git('commit', '--quiet', '-m', message)
        p = self._git('push', '--quiet', 'origin', 'HEAD:refs/heads/%s' % self.branch, check=False)
        if p.returncode != 0:
            if token:
                self._git('reset', '--quiet', '--hard', token)
            raise Conflict('push rejected, another run wrote the state first: %s' % scrub(p.stderr.strip())[:200])
        return self._git('rev-parse', 'HEAD').stdout.strip()


def snapshot(state):
    return copy.deepcopy(state)
