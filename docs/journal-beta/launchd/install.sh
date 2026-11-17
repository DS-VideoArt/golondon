#!/bin/sh
# התקנה (או התקנה מחדש אחרי שינוי) של הבדיקה היומית האוטומטית במק של בעל האתר.
# מעתיק את סקריפט הבדיקה ואת העטיפה ל-Application Support, ורושם את המשימה ב-launchd של המשתמש הנוכחי.
set -e
SRC=$(cd "$(dirname "$0")" && pwd)
DEST="$HOME/Library/Application Support/GoLondon/journal-beta"
PLIST="$HOME/Library/LaunchAgents/com.golondon.journal-beta-daily-check.plist"
LABEL=com.golondon.journal-beta-daily-check
mkdir -p "$DEST" "$HOME/Library/LaunchAgents"
cp "$SRC/../beta-requests-today.sh" "$DEST/beta-requests-today.sh"
cp "$SRC/beta-daily-check-launchd.sh" "$DEST/beta-daily-check-launchd.sh"
chmod 755 "$DEST"/*.sh
cp "$SRC/$LABEL.plist" "$PLIST"
plutil -lint "$PLIST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl print "gui/$(id -u)/$LABEL" | grep -E 'state|last exit|run interval|program' | head -5
echo "installed: $LABEL (09:00 daily + at login). log: ~/Library/Logs/golondon-journal-beta-daily.log"
