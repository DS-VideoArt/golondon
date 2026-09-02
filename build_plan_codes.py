# -*- coding: utf-8 -*-
"""
מקצה לכל מקום ב planner-data.json קוד קבוע בן שני תווים.

למה זה קיים
-----------
קישור השיתוף של מסלול נשלח בוואטסאפ, ולכן הוא צריך להיות קצר. שרשור
מזהים מלאים יצר קישור של יותר מחמש מאות תווים. שני תווים לכל מקום
מקצרים את אותו מסלול לכשישים תווים.

הכלל היחיד שחייב להישמר
-----------------------
קוד שהוקצה פעם אחת לעולם לא משתנה ולא ממוחזר. קישור שנשלח למשפחה
לפני חודש חייב להמשיך לעבוד. הסקריפט הזה רק מוסיף קודים למקומות
חדשים, ועוצר בשגיאה אם הוא מזהה קוד כפול או קוד שהשתנה.

הרצה: python3 build_plan_codes.py
"""
import json, re, sys

ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
PATH = 'planner-data.json'


def code_at(i):
    """אינדקס למחרוזת בת שני תווים. 62 בריבוע הם 3,844 קודים אפשריים."""
    if i >= len(ALPHA) * len(ALPHA):
        sys.exit('נגמרו הקודים האפשריים. צריך להרחיב לשלושה תווים.')
    return ALPHA[i // len(ALPHA)] + ALPHA[i % len(ALPHA)]


def main():
    raw = open(PATH, encoding='utf-8').read()
    data = json.loads(raw)
    items = data['attractions']

    used = {}
    for a in items:
        c = a.get('code')
        if not c:
            continue
        if c in used:
            sys.exit('קוד כפול: %s מופיע גם ב-%s וגם ב-%s' % (c, used[c], a['id']))
        used[c] = a['id']

    nxt = 0
    added = []
    for a in items:
        if a.get('code'):
            continue
        while code_at(nxt) in used:
            nxt += 1
        c = code_at(nxt)
        used[c] = a['id']
        added.append((a['id'], c))
        nxt += 1

    if not added:
        print('כל %d המקומות כבר מקודדים. אין שינוי.' % len(items))
        return

    # הוספה טקסטואלית אחרי שורת המזהה, כדי לא לשכתב את הקובץ כולו
    out = raw
    for pid, c in added:
        old = '      "id": "%s",\n' % pid
        if out.count(old) != 1:
            sys.exit('שורת המזהה של %s לא נמצאה בדיוק פעם אחת' % pid)
        out = out.replace(old, old + '      "code": "%s",\n' % c)

    check = json.loads(out)
    if len(check['attractions']) != len(items):
        sys.exit('מספר המקומות השתנה, לא כותב')
    for before, after in zip(items, check['attractions']):
        for k in before:
            if k != 'code' and before[k] != after.get(k):
                sys.exit('השדה %s של %s השתנה, לא כותב' % (k, before['id']))

    codes = [a['code'] for a in check['attractions']]
    if len(set(codes)) != len(codes):
        sys.exit('נוצרו קודים כפולים, לא כותב')

    open(PATH, 'w', encoding='utf-8').write(out)
    print('הוקצו %d קודים חדשים. סך המקומות המקודדים: %d' % (len(added), len(codes)))
    print('דוגמאות:', ', '.join('%s=%s' % (i, c) for i, c in added[:4]))


if __name__ == '__main__':
    main()
