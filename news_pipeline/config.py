# -*- coding: utf-8 -*-
"""קבועים וכללים של האיסוף. כל סף ומילון שמשפיע על החלטה נמצא כאן ולא מפוזר בקוד."""

USER_AGENT = 'GoLondonNewsBeta/0.1 (+https://golondon.co.il; read-only)'
HTTP_TIMEOUT = 20
MAX_BYTES = 4_000_000
MIN_SECONDS_BETWEEN_REQUESTS_PER_HOST = 1.0

LONDON_TZ = 'Europe/London'
RUN_TZ = 'Asia/Jerusalem'

# שתי הרצות ביום לפי שעון ישראל. הצעה לשלב הבא, לא תזמון פעיל.
SLOT_HOURS = {'morning': 8, 'evening': 19}

# טיוטה עוברת אישור אדם לפני פרסום. פריט שיסתיים בתוך החלון הזה לא שווה טיוטה.
PUBLISH_LAG_HOURS = 24

LOOKAHEAD_DAYS = 14          # עבודות מתוכננות בתחבורה, ועדכוני עמודי GOV.UK
EVENT_HORIZON_DAYS = 60      # אותו חלון כמו upcoming_event ב-build_whats_new.py
NEW_OPENING_DAYS = 14        # נפתח לאחרונה

ACCEPT_THRESHOLD = 70
HOLD_THRESHOLD = 50
# מקור רשמי עם תאריכים מקבל כמעט 65 נקודות כמעט אוטומטית, ולכן הרלוונטיות למטייל היא
# תנאי נפרד: בלעדיה פריט לא עובר, גם כשהניקוד הכולל גבוה
ACCEPT_MIN_RELEVANCE = 15
HOLD_MIN_RELEVANCE = 10
# קיבולת התור הפתוח לבדיקת אדם. פריטים שממתינים להחלטה תופסים מקום עד שמחליטים עליהם,
# ולכן ריצה חוזרת על אותם נתונים לא מוסיפה פריטים. מה שכשיר ומחוץ למכסה נשמר כ-backlog
MAX_ACCEPT_PER_RUN = 6
MAX_HOLD_PER_RUN = 8
# גיוון: מקור אחד לא ממלא את כל התור. 2 המלצות ו-3 פריטים ממתינים לכל מקור, כולל מה שכבר בתור
MAX_ACCEPT_PER_SOURCE = 2
MAX_HOLD_PER_SOURCE = 3
# פריט בעדיפות גבוהה במיוחד (למשל סגירה מלאה של קו לשדה התעופה) נכנס גם כשהתור מלא, עד 2 בריצה
URGENT_PRIORITY = 55
MAX_URGENT_OVER_CAP = 2

# שיוך סוג פריט לקטגוריה הקיימת באתר (CAT_ICON ב-build_whats_new.py) ולסוג האייטם
KINDS = {
    'exhibition':        {'category': 'תרבות',       'group': 'positive'},
    'event':             {'category': 'אירועים',     'group': 'positive'},
    'experience':        {'category': 'אטרקציות',    'group': 'positive'},
    'new_attraction':    {'category': 'אטרקציות',    'group': 'positive'},
    'seasonal':          {'category': 'אירועים',     'group': 'positive'},
    'airport_news':      {'category': 'תחבורה',      'group': 'practical'},
    'disruption_planned': {'category': 'תחבורה',     'group': 'practical'},
    'disruption_live':   {'category': 'תחבורה',      'group': 'practical'},
    'weather_warning':   {'category': 'מידע למטייל', 'group': 'practical'},
    'entry_rules':       {'category': 'מידע למטייל', 'group': 'practical'},
    'public_holiday':    {'category': 'מידע למטייל', 'group': 'practical'},
}
EVENT_KINDS = ('exhibition', 'event', 'experience', 'new_attraction', 'seasonal')

# ---------------------------------------------------------------------------
# מילונים לדירוג. התאמה היא לפי מילה שלמה, בלי רגישות לאותיות גדולות.

# מקומות ומוסדות שמטייל ישראלי בלונדון כמעט בטוח מגיע אליהם
MAJOR_VENUES = [
    'Tate Modern', 'Tate Britain', 'V&A', 'Victoria and Albert', 'V&A East', 'Young V&A',
    'Natural History Museum', 'Science Museum', 'British Museum', 'National Gallery',
    'Hyde Park', "Regent's Park", 'Greenwich Park', 'St James', 'Kensington Gardens',
    'Richmond Park', 'Bushy Park', 'Green Park', 'Kew', 'Tower of London', 'Buckingham Palace',
    'Heathrow', 'Gatwick', 'Stansted', 'Luton', 'Winter Wonderland', 'Southbank',
]
TOURIST_PLACES = [
    'Westminster', 'Covent Garden', 'Soho', 'South Kensington', 'Kensington', 'Greenwich',
    'London Bridge', 'Waterloo', "King's Cross", 'Paddington', 'Oxford Circus', 'Piccadilly Circus',
    'Leicester Square', 'Camden', 'Notting Hill', 'Shoreditch', "St Paul's", 'Bank station', 'Victoria station',
    'Baker Street', 'Bond Street', 'Tottenham Court Road', 'Liverpool Street', 'Euston',
    "Earl's Court", 'Stratford', 'Canary Wharf', 'Richmond', 'Hampstead', 'Wembley',
    'Marylebone', 'Mayfair', 'Bloomsbury', 'Hackney Wick', 'Queen Elizabeth Olympic Park',
]
# קווים שעוברים באזורי התיירות או מגיעים לשדות התעופה
TOURIST_LINES = ['Piccadilly', 'Elizabeth', 'Central', 'Jubilee', 'District', 'Circle',
                 'Northern', 'Victoria', 'Bakerloo', 'Heathrow Express', 'Gatwick Express']
# הקו שהשיבוש עליו, לפי מזהה TfL. קו שמוזכר רק כחלופה בטקסט אינו נספר
TOURIST_LINE_IDS = ('piccadilly', 'elizabeth', 'central', 'jubilee', 'district', 'circle', 'northern',
                    'victoria', 'bakerloo', 'hammersmith-city', 'waterloo-city')
# קווי TfL שמגיעים לשדה תעופה
AIRPORT_LINE_IDS = ('piccadilly', 'elizabeth')
FAMILY_WORDS = ['family', 'families', 'kids', 'children', 'child', 'half term', 'half-term']
# "free" לבד לא נחשב: בכרטיסי טייט מופיע FREE FOR MEMBERS, שאינו כניסה חופשית
FREE_WORDS = ['free entry', 'free admission', 'free event', 'free to attend', 'free to visit', 'admission free']
SEASONAL_WORDS = ['Christmas', 'Halloween', 'Bonfire', 'fireworks', 'lights', 'ice skating',
                  'festive', 'winter', 'New Year']
# קהל היעד הספציפי שלנו
AUDIENCE_WORDS = ['Israel', 'Tel Aviv', 'TLV', 'El Al', 'kosher', 'Jewish', 'Hanukkah', 'Chanukah']

# מילים שמסמנות תוכן שאינו למטיילים. כל התאמה מורידה ניקוד.
NOT_FOR_TOURISTS = ['course', 'courses', 'lottery', 'membership', 'volunteer', 'volunteering',
                    'donate', 'jobs', 'careers', 'apprentice', 'apprenticeships', 'investment',
                    'expansion', 'Parliament', 'steel', 'consultation', 'planning application',
                    'shareholders', 'results', 'six-week', 'term-time', 'for schools', 'teachers',
                    'camp', 'camps', 'padel', 'coaching', 'lessons', 'conference', 'symposium', 'study day',
                    'members', "members'", 'schools', 'KS1', 'KS2', 'KS3', 'KS4', 'livestream', 'online',
                    'recording', 'lecture', 'lectures', 'residents', 'steelmaking', 'supply chain']

# סוג הפריט ברשימות של מוסדות (data-wo-type ב-V&A, תגית הכרטיס בטייט). מטייל לכמה ימים בא
# לתערוכה, לפסטיבל או לפעילות פתוחה, לא לקורס, להרצאה או לכנס מקצועי
LISTING_TYPE_WEIGHT = {
    'exhibition': 10, 'display': 5, 'festival': 8, 'season': 5, 'special-event': 5, 'late': 5,
    'family': 8, 'drop-in': 0, 'free display': 5,
    'talk': -10, 'course': -15, 'workshop': -10, 'conferences-and-study-days': -15, 'tour': -5,
    'film-screening': -5, 'open-studio': -5, 'performance': 0, 'event': 0,
}
# מוסדות שהם יעד תיירותי בפני עצמם. כל פריט שלהם מקבל את הבסיס הזה פעם אחת
INSTITUTION_SOURCES = ('vam_whatson', 'tate_whatson', 'royalparks_whatson')
CLOSING_SOON_DAYS = 21       # "הזדמנות אחרונה": נסגר בתוך שלושה שבועות

# נושאים רגישים. לא נפסלים אוטומטית, אבל לעולם לא עוברים בלי שיקול דעת אנושי.
SENSITIVE_WORDS = ['terror', 'terrorist', 'attack', 'stabbing', 'shooting', 'killed', 'died',
                   'death', 'fatal', 'bomb', 'explosion', 'riot', 'protest', 'demonstration',
                   'Gaza', 'Palestine', 'Palestinian', 'antisemitic', 'antisemitism',
                   'hate crime', 'hostage', 'security alert', 'evacuated', 'person ill', 'casualty']

CANCEL_PATTERNS = [
    (r'\bpostponed\b', 'postponed'),
    (r'\b(cancelled|canceled|will no longer (take place|go ahead))\b', 'cancelled'),
]
