# נספח ג. נתונים טכניים גולמיים

כל הבדיקות הורצו על עותק מקומי של הענף, דרך שרת שמחקה את נטליפיי (כולל ‎_redirects‎, כתובות בלי ‎.html‎ ועמוד 404), בדפדפן Chromium. בקשות לשרתים חיצוניים נחסמו בסביבה (חוץ מגוגל פונטס), ולכן Font Awesome, מזג האוויר ושער החליפין לא נטענו. האייקונים חסרים בצילומי המסך מהסיבה הזו בלבד.

## 1. Lighthouse, 12 סוגי עמודים, נייד ומחשב

הציונים לפי הסדר: ביצועים, נגישות, שיטות עבודה, קידום. LCP, TBT ו-CLS, ומשקל העמוד בקילובייט.

**הסתייגות:** השרת המקומי לא דוחס (נטליפיי דוחס HTML, JS ו-JSON בברוטלי), ו-Font Awesome לא נטען. לכן משקל ה-JSON וה-HTML כאן גבוה מהאמיתי, ומשקל הגופנים נמוך מהאמיתי. היחס בין העמודים ומיקום הבעיות אמינים. המספרים המוחלטים צריכים אימות מול האתר החי (PageSpeed Insights).

| עמוד | מצב | ביצועים | נגישות | שיטות | קידום | LCP | TBT | CLS | KB |
|---|---|---|---|---|---|---|---|---|---|
| checklist | desktop | 99 | 97 | 96 | 100 | 0.8 s | 0 ms | 0.002 | 580 |
| checklist | mobile | 75 | 97 | 96 | 100 | 4.7 s | 0 ms | 0 | 580 |
| contact | desktop | 99 | 92 | 96 | 100 | 0.9 s | 0 ms | 0.001 | 553 |
| contact | mobile | 78 | 92 | 96 | 100 | 4.4 s | 0 ms | 0 | 553 |
| guide-areas-camden | desktop | 85 | 88 | 96 | 100 | 2.7 s | 0 ms | 0.007 | 2627 |
| guide-areas-camden | mobile | 66 | 88 | 96 | 100 | 14.8 s | 80 ms | 0 | 2606 |
| guide-kids | desktop | 85 | 92 | 96 | 100 | 2.7 s | 10 ms | 0.004 | 3998 |
| guide-kids-free | desktop | 87 | 91 | 96 | 100 | 1.7 s | 0 ms | 0.045 | 1554 |
| guide-kids-free | mobile | 68 | 91 | 96 | 100 | 9.5 s | 0 ms | 0 | 1533 |
| guide-kids | mobile | 65 | 92 | 96 | 100 | 16.7 s | 80 ms | 0 | 3997 |
| guide-transport-airport | desktop | 86 | 93 | 96 | 100 | 1.4 s | 0 ms | 0.192 | 1235 |
| guide-transport-airport | mobile | 68 | 93 | 96 | 100 | 7.9 s | 0 ms | 0 | 1213 |
| home | desktop | 96 | 95 | 96 | 100 | 1.1 s | 0 ms | 0.011 | 1374 |
| home | mobile | 58 | 95 | 96 | 100 | 7.2 s | 430 ms | 0 | 1112 |
| kosher-map | desktop | 97 | 96 | 96 | 100 | 1.2 s | 70 ms | 0.02 | 824 |
| kosher-map | mobile | 63 | 96 | 96 | 100 | 6.8 s | 170 ms | 0.047 | 824 |
| london-3-days | desktop | 87 | 94 | 96 | 100 | 1.8 s | 0 ms | 0.039 | 1574 |
| london-3-days | mobile | 60 | 94 | 96 | 100 | 9.7 s | 300 ms | 0 | 1577 |
| planner | desktop | 91 | 94 | 96 | 100 | 1.9 s | 0 ms | 0.047 | 2059 |
| planner | mobile | 61 | 94 | 96 | 100 | 12.3 s | 190 ms | 0 | 2059 |
| search | desktop | 100 | 96 | 96 | 100 | 0.8 s | 0 ms | 0.015 | 571 |
| search | mobile | 76 | 96 | 96 | 100 | 4.7 s | 0 ms | 0 | 571 |
| whats-new | desktop | 91 | 95 | 96 | 100 | 1.4 s | 0 ms | 0.001 | 1364 |
| whats-new | mobile | 66 | 95 | 96 | 100 | 8.2 s | 0 ms | 0.006 | 1364 |

ממצאים מרכזיים מתוך Lighthouse:
- planner-data.json (280KB לא דחוס) נטען פעמיים או שלוש באותו עמוד, ו-attractions-info.json (153KB) עד שלוש פעמים. הסיבה: trip-tray.js, auto-link-places.js, area-explore.js, place-info.js ו-planner-nearby.js מורידים כל אחד בנפרד, עם ‎cache: 'no-cache'‎. בכניסה ראשונה הבקשות יוצאות במקביל ולכן כולן מורידות את הקובץ המלא. planner-data.json נטען גם בדף הבית.
- theme-light.css (86KB) עם כ-75 עד 108KB של כללים שלא בשימוש בכל עמוד. בנוסף כ-988KB של CSS מוטבע מפוזרים בין 151 העמודים (בממוצע כ-6.5KB לעמוד), ורובו עיצוב כהה ישן ש-theme-light.css דורס עם ‎!important‎.
- Font Awesome המלא (all.min.css ושלושה קובצי גופן) נטען בכל עמוד בשביל כמה עשרות אייקונים.
- תמונות המקומות במתכנן ובמדריכי האזורים הן 1600 על 893 פיקסלים (webp של כ-400KB, jpg של עד 850KB), גם כשהן מוצגות בכרטיס ברוחב 340 פיקסלים.
- guide-transport-airport במחשב: CLS של 0.192, בגלל ‎.gl-place-link‎ שנוסף לטקסט אחרי הטעינה (auto-link-places.js).

## 2. axe-core, כל 150 העמודים, ברוחב 375

לפני התיקונים בענף. עמודה שלישית: מספר עמודים, רביעית: מספר רכיבים.

| כלל | חומרה | עמודים | רכיבים | תיאור |
|---|---|---|---|---|
| color-contrast | serious | 148 | 1077 | Elements must meet minimum color contrast ratio thresholds |
| link-in-text-block | serious | 135 | 619 | Links must be distinguishable without relying on color |
| heading-order | moderate | 40 | 43 | Heading levels should only increase by one |
| aria-allowed-attr | critical | 12 | 71 | Elements must only use supported ARIA attributes |
| target-size | serious | 9 | 105 | All touch targets must be 24px large, or leave sufficient space |
| scrollable-region-focusable | serious | 6 | 6 | Scrollable region must have keyboard access |
| nested-interactive | serious | 6 | 99 | Interactive controls must not be nested |
| region | moderate | 5 | 23 | All page content should be contained by landmarks |
| landmark-one-main | moderate | 3 | 3 | Document should have one main landmark |
| label-content-name-mismatch | serious | 3 | 6 | Elements must have their visible text as part of their accessible name |
| page-has-heading-one | moderate | 2 | 2 | Page should contain a level-one heading |
| listitem | serious | 1 | 1 | <li> elements must be contained in a <ul> or <ol> |
| select-name | critical | 1 | 1 | Select element must have an accessible name |


אחרי התיקונים בענף נעלמו בעמודים שנבדקו מחדש: aria-allowed-attr, scrollable-region-focusable, label-content-name-mismatch, page-has-heading-one (במפת הכשרות), listitem, select-name, וה-heading-order בעמוד מה חדש. נשארו ניגודיות, קישורים בלי קו תחתון, target-size, nested-interactive ו-heading-order בכרטיסי המקומות (h4 אחרי h2), שדורשים החלטת עיצוב או שינוי מבנה.

צמדי הצבעים שנכשלים הכי הרבה:

| צבע טקסט | רקע | יחס | איפה |
|---|---|---|---|
| ‎#858a9c‎ (‎--ink-faint‎) | לבן | 3.43 | סלוגן הלוגו, הערות, טמפרטורות בכרטיסי החודשים, כותרות "עוד באשכול", רמזים בטופס המתכנן |
| ‎#15803d‎ | ‎#e5f1ea‎ | 4.32 | תגיות ירוקות (ca-badge) |
| ‎#dc2626‎ | ‎#fce9e9‎ | 4.13 | תגיות אדומות במה חדש ובדף הבית |
| ‎#1e3a8a‎ (קישור) | טקסט ‎#201f2b‎ | 1.49 מול הטקסט שסביבו | כל קישור בתוך פסקה, בלי קו תחתון |
| ‎#f87171‎ | לבן | 2.76 | קישורי התקנון והפרטיות בטופס ההצטרפות |

## 3. html-validate, כל העמודים

האתר נקי כמעט לגמרי. הממצאים: תגיות שבורות ב-guide-attractions-free (תוקן), ‎<style>‎ בתוך ‎<section>‎ ב-index.html, ‎<input>‎ בלי type ב-index.html, ‎<img src="">‎ ב-admin.html.

## 4. בדיקה סטטית של כל עמוד

- H1 אחד בדיוק בכל עמוד ציבורי. אין כותרות ריקות.
- title ו-meta description ייחודיים בכל העמודים (0 כפילויות). canonical תקין בלי ‎.html‎ ב-146 עמודים, זהה ל-og:url.
- lang="he" ו-dir="rtl" בכל עמוד חוץ מ-.attractions-list.html (קובץ פנימי שנוצר על ידי build_attractions.py).
- Open Graph ו-Twitter Card מלאים בכל העמודים הציבוריים. 14 עמודים חולקים את אותה תמונת שיתוף (images/hero.jpg).
- title ארוך מ-65 תווים: guide-areas-westminster (66), guide-winter-markets (67), london-by-month (66), london-december (68), london-november (66), london-october (66).
- meta description: guide-areas.html 195 תווים (התבנית קובעת עד 155), accessibility.html 59 תווים.
- 2,472 קישורים פנימיים ב-148 עמודים מצביעים על כתובת עם ‎.html‎, וכל אחד מהם עובר הפניית 301.
- Schema: 86 עמודים עם Article בלבד, בלי BreadcrumbList, למרות שיש בהם פירורי לחם גלויים. ב-129 עמודים ל-publisher אין logo. ב-30 עמודים ל-Article אין image.
- אין שום שגיאת JavaScript ואין שגיאת קונסול באף עמוד (חוץ מאזהרות שנובעות מחסימת הרשת בסביבת הבדיקה).
- אין גלילה אופקית באף עמוד, באף אחד משישת הרוחבים (320, 375, 414, 768, 1024, 1440).

## 5. מפת קישורים פנימיים

כל עמוד ציבורי נגיש תוך שתי לחיצות מדף הבית (43 בעומק 1, 102 בעומק 2). עמודים שרק עמוד אחד מקשר אליהם: about, accessibility, join, guide-areas-hampstead, guide-events-marathon, guide-events-pride, guide-events-royal, guide-events-wimbledon, guide-football-womens, guide-kids-eating, guide-kids-toddlers, guide-kosher-synagogues, guide-stay-family. whats-new-2026-08-17 נמצא במפת האתר אבל אף עמוד לא מקשר אליו.

## 6. קישורים חיצוניים

71 דומיינים. בסביבת הבדיקה אי אפשר היה לבדוק אם הם עונים, ולכן הבדיקה הזו פתוחה. כדאי להריץ את linkinator על האתר החי. חשודים שכדאי לבדוק ראשונים: tfl-newsroom.prgloo.com (דומיין חדשות ישן של TfL), klbdkosher.org (האתר הנוכחי של KLBD הוא kosher.org.uk), ו-17 קישורים ל-visitlondon.com (באודיט המקומות מ-4 באוקטובר נמצא שם עמוד שבור).

## 7. בדיקות פונקציונליות בדפדפן

| מה | תוצאה |
|---|---|
| חיפוש | עובד. "אויסטר" 9 תוצאות, "כשר" 105, "eta" 6, ביטוי בלי תוצאות מציג מצב ריק. **"שורדיטש" מחזיר 9 תוצאות ו"שורדיץ" 48**, כי אין איחוד של צורות כתיב, ומי שמקליד את האיות הישן לא מגיע למדריך האזור. |
| מתכנן, מצב אוטומטי | בחירת ימים ותחומי עניין ובנייה מחזירה מסלול. אין שגיאות. |
| מתכנן, ידני וסביבי | 157 מקומות ברשימה, בורר האזורים נטען. |
| רשימת בדיקה | 17 פריטים, הסימונים נשמרים אחרי רענון. |
| מפת כשרות | המפה והאשכולות נטענים. אין שגיאות. |
| צור קשר | אין טופס בעמוד, רק מייל ורשתות. תיאור המטא מזכיר טלגרם, ואין ערוץ כזה בעמוד. |
| הצטרפות | הטופס שולח ל-Google Apps Script ול-Netlify Forms. לטופס אין honeypot (בנטליפיי הטופס golondon-members רשום בלי honeypot), בניגוד לשני הטפסים האחרים. התוויות לא היו מקושרות לשדות (תוקן). |
| וידג'ט נגישות | נפתח, 12 אפשרויות, הפעלת כולן ביחד לא שוברת את העמוד ולא יוצרת גלילה אופקית. יש קישור "דילוג לתוכן" וקישור להצהרת הנגישות. |
| מקלדת בדף הבית | 7 מתוך 40 עצירות טאב ראשונות (קישורי התפריט העליון) בלי טבעת פוקוס נראית. |
| 404 | מחזיר סטטוס 404 עם עמוד ידידותי, קישור לדף הבית ולחיפוש. |
| מצב לא מקוון | עמודים שנצפו נפתחים בלי חיבור. דף הבית בכתובת / לא היה שמור (תוקן). |
