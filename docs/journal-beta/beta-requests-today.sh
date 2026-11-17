#!/bin/sh
# יומן המסע לילדים, בטא: הבדיקה היומית של הבקשות הפתוחות. מדפיס לכל בקשה: מזהה, מתי נוצרה, וכמה ימים
# נשארו עד המחיקה האוטומטית (7 ימים). בלי מייל ובלי שם: רק מה שצריך כדי להחליט במה לטפל היום.
# הרצה מתיקיית האתר (המקושרת לפרויקט בנטליפיי), כשהכלי netlify מחובר למשתמש ds videoart:
#     sh docs/journal-beta/beta-requests-today.sh            # המאגר האמיתי (journal-beta)
#     sh docs/journal-beta/beta-requests-today.sh preview    # מאגר הבדיקות (journal-beta-preview)
# כל שגיאה של netlify עוצרת את הסקריפט עם הודעה: "אין בקשות" נאמר רק אחרי שהרשימה באמת נקראה.
STORE=journal-beta
[ "$1" = "preview" ] && STORE=journal-beta-preview
list() {  # $1 = prefix. מדפיס מפתח בכל שורה, או נכשל בקול
  OUT=$(netlify blobs:list "$STORE" --prefix "$1" --json 2>&1) || { echo "שגיאה בקריאת $STORE: $OUT" >&2; exit 1; }
  printf '%s' "$OUT" | python3 -c '
import sys, json
try: d = json.load(sys.stdin)
except Exception: sys.exit("netlify did not return JSON (not linked, or not logged in?): " + sys.stdin.read()[:200])
for b in d.get("blobs", []): print(b["key"])' || exit 1
}
KEYS=$(list requests/) || exit 1
SLOTS=$(list slots/ | grep -c .)
if [ -z "$KEYS" ]; then
  echo "$(date +%d.%m.%Y): אין בקשות פתוחות ב-$STORE. המכסה: $SLOTS מתוך 25 משבצות תפוסות."
  exit 0
fi
echo "$(date +%d.%m.%Y): בקשות פתוחות ב-$STORE, המכסה $SLOTS מתוך 25 (לטפל היום בכל מה שנשארו לו 2 ימים או פחות):"
for K in $KEYS; do
  REC=$(netlify blobs:get "$STORE" "$K" 2>&1) || { echo "שגיאה בקריאת $K: $REC" >&2; exit 1; }
  printf '%s' "$REC" | python3 -c '
import sys, json, datetime
k = sys.argv[1]
try: r = json.loads(sys.stdin.read())
except Exception: sys.exit("record is not JSON: " + k)
now = datetime.datetime.now(datetime.timezone.utc)
try: left = (datetime.datetime.fromisoformat(r["expires_at"].replace("Z", "+00:00")) - now).total_seconds() / 86400
except Exception: left = None
flag = "  <-- דחוף" if left is not None and left <= 2 else ""
print("  %s  נוצרה %s  מצב %s  נשארו %s ימים%s" % (k.split("/")[-1], (r.get("created_at") or "?")[:10], r.get("status") or "?", ("%.1f" % left) if left is not None else "?", flag))' "$K" || exit 1
done
