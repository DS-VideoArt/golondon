#!/bin/sh
# יומן המסע לילדים, בטא: עטיפה לבדיקה היומית כשהיא רצה מ-launchd (בלי טרמינל, בלי אדם).
# מריצה את beta-requests-today.sh שיושב לידה, רושמת כל הרצה ליומן, ומציגה למשתמש:
#   כישלון (נטליפיי לא זמין, לא מחובר, הסקריפט חסר)  חלון אזהרה אדום שנשאר על המסך
#   בקשות פתוחות, ובמיוחד "דחוף"                      חלון אזהרה עם הפלט המלא, נשאר על המסך
#   אין בקשות                                           התראה שקטה בפינת המסך ורישום ביומן בלבד
# לא מפיקה יומן ולא שולחת מיילים. קריאה בלבד מול Netlify Blobs.
# הסביבה של launchd רזה: PATH ומזהה האתר מוגדרים כאן במפורש, ולכן לא צריך תיקייה מקושרת.
export PATH="/Users/mymac/.nvm/versions/node/v24.18.0/bin:/usr/local/bin:/usr/bin:/bin"
export NETLIFY_SITE_ID="3afe7a44-a0a4-4549-b4a9-57c3140d7a5f"
export LC_ALL=en_US.UTF-8 PYTHONIOENCODING=utf-8
DIR=$(cd "$(dirname "$0")" && pwd)
LOG="$HOME/Library/Logs/golondon-journal-beta-daily.log"
DIALOG_SECONDS=${JB_DIALOG_SECONDS:-7200}     # כמה זמן חלון האזהרה נשאר אם איש לא לוחץ (2 שעות)
mkdir -p "$(dirname "$LOG")"
[ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 200000 ] && tail -n 300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

STAMP=$(date '+%Y-%m-%d %H:%M:%S')
if [ -f "$DIR/beta-requests-today.sh" ]; then
  OUT=$(sh "$DIR/beta-requests-today.sh" "$@" 2>&1); RC=$?   # הארגומנט "preview" עובר הלאה, לבדיקות בלבד
else
  OUT="beta-requests-today.sh לא נמצא ליד העטיפה ($DIR)"; RC=2
fi
{ echo "=== $STAMP  user=$(id -un)  exit=$RC"; echo "$OUT"; } >> "$LOG"

esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
dialog() {  # $1 title, $2 text, $3 icon (stop|caution|note)
  osascript -e "display dialog \"$(esc "$2")\" with title \"$(esc "$1")\" buttons {\"הבנתי\"} default button 1 with icon $3 giving up after $DIALOG_SECONDS" >/dev/null 2>&1
}
if [ "$RC" -ne 0 ]; then
  dialog "יומן הילדים: הבדיקה היומית נכשלה" "הבדיקה של הבקשות הפתוחות לא הצליחה לקרוא מנטליפיי, ולכן לא ידוע אם יש בקשות שמחכות. לבדוק חיבור, התחברות של netlify, ואת היומן:
$LOG

$(printf '%s' "$OUT" | head -c 600)" stop
elif printf '%s' "$OUT" | grep -q 'דחוף'; then
  dialog "יומן הילדים: בקשה דחופה, לטפל היום" "$OUT

בקשה שנשארו לה יומיים או פחות נמחקת בקרוב, והמשפחה לא תקבל יומן. הנוהל: docs/journal-beta/MANUAL_RUNBOOK.md" stop
elif printf '%s' "$OUT" | grep -q 'בקשות פתוחות ב-'; then
  dialog "יומן הילדים: יש בקשות פתוחות" "$OUT

הנוהל: docs/journal-beta/MANUAL_RUNBOOK.md" caution
else
  osascript -e "display notification \"$(esc "$OUT")\" with title \"יומן הילדים: אין בקשות פתוחות\"" >/dev/null 2>&1
fi
exit 0
