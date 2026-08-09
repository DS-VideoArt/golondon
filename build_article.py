# -*- coding: utf-8 -*-
"""
מחולל עמודי מאמר.

עד היום כל עמוד חדש נוצר בהעתקה מעמוד קיים, וכך הועתקו גם טעויות:
תמונת שער של עמוד אחר, כתובת קנונית שלא עודכנה, ומחלקת hero-photo חסרה.
כאן הכל נגזר מפרמטרים, ולכן אי אפשר לשכוח.

שימוש: מייבאים את make_article ומעבירים לו מילון.
"""
import os, html

os.chdir(os.path.dirname(os.path.abspath(__file__)))

SITE = 'https://golondon.co.il'


def esc(s):
    return html.escape(str(s or ''), quote=True)


BASE_CSS = """    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Heebo', sans-serif; direction: rtl; line-height: 1.8; }
    a { text-decoration: none; }
    a:hover { text-decoration: underline; }
    .navbar { padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
    .logo { direction: ltr; display: flex; align-items: center; gap: 8px; text-decoration: none; }
    .logo-img { height: 44px; width: auto; object-fit: contain; }
    .logo-text-fallback { display: none; align-items: baseline; gap: 2px; }
    .logo-go { font-size: 22px; font-weight: 900; }
    .logo-london { font-size: 22px; font-weight: 900; }
    .logo-slogan { font-size: 11px; font-weight: 600; direction: rtl; white-space: nowrap; border-right: 1px solid; padding-right: 10px; }
    .back-btn { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; padding: 8px 16px; border-radius: 8px; border: 1px solid; transition: all 0.2s; }
    .page-hero { position: relative; padding: 92px 24px 78px; text-align: center; overflow: hidden; }
    .page-hero::before { content: ""; position: absolute; inset: 0; background: url('images/__HERO__') center 55% / cover no-repeat; z-index: 0; }
    .page-hero::after { content: ""; position: absolute; inset: 0; z-index: 1; }
    .page-hero > * { position: relative; z-index: 2; }
    .page-hero .tag { display: inline-block; padding: 6px 16px; border-radius: 50px; font-size: 13px; font-weight: 700; margin-bottom: 18px; }
    .page-hero h1 { font-size: 34px; font-weight: 900; margin-bottom: 12px; max-width: 760px; margin-inline: auto; line-height: 1.25; }
    .page-hero p { font-size: 16px; max-width: 600px; margin-inline: auto; }
    .page-hero .meta { margin-top: 16px; display: flex; gap: 18px; justify-content: center; font-size: 13px; }
    .breadcrumb { max-width: 800px; margin: 0 auto; padding: 18px 24px 0; font-size: 13.5px; }
    .content { max-width: 800px; margin: 0 auto; padding: 30px 24px 40px; }
    .content h2 { font-size: 21px; font-weight: 800; margin: 42px 0 14px; padding-right: 14px; border-right: 3px solid #DC2626; }
    .content h2:first-child { margin-top: 0; }
    .content h3 { font-size: 16.5px; font-weight: 800; margin: 26px 0 10px; }
    .content p { margin-bottom: 14px; font-size: 15.5px; }
    .content ul, .content ol { margin: 10px 0 16px 0; padding-right: 22px; font-size: 15.5px; }
    .content li { margin-bottom: 9px; }
    .lead { font-size: 17px; border-right: 3px solid rgba(220,38,38,0.6); padding-right: 16px; margin-bottom: 28px; }
    .stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin: 22px 0 30px; }
    .stat { border: 1px solid; border-radius: 14px; padding: 15px 12px; text-align: center; }
    .stat-num { font-size: 20px; font-weight: 900; line-height: 1.3; }
    .stat-lbl { font-size: 12.5px; margin-top: 3px; }
    .content table { width: 100%; border-collapse: collapse; margin: 16px 0 24px; font-size: 14.5px; }
    .content th, .content td { padding: 11px 12px; text-align: right; border-bottom: 1px solid; }
    .content th { font-weight: 800; }
    .table-wrap { overflow-x: auto; }
    .highlight-box { border: 1px solid; border-radius: 14px; padding: 20px 22px; margin: 26px 0; font-size: 14.5px; }
    .warning-box { border: 1px solid; border-radius: 14px; padding: 20px 22px; margin: 26px 0; font-size: 14.5px; }
    .siblings { margin-top: 44px; padding-top: 26px; border-top: 1px solid; }
    .siblings h3 { font-size: 14px; margin-bottom: 12px; font-weight: 700; }
    .sibling-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 9px; }
    .sibling { border: 1px solid; border-radius: 11px; padding: 13px 15px; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 9px; }
    .sources { margin-top: 34px; font-size: 13.5px; }
    .sources h3 { font-size: 14px; font-weight: 800; margin-bottom: 8px; }
    .sources ul { padding-right: 20px; }
    .back-cta { text-align: center; margin-top: 34px; }
    .back-cta a { display: inline-flex; align-items: center; gap: 8px; border: 1px solid; padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 14px; }
    @media (max-width: 560px) {
      .page-hero h1 { font-size: 25px; }
      .content { padding: 24px 18px 34px; }
      .logo-slogan { display: none; }
      .back-btn { font-size: 12.5px; padding: 7px 12px; white-space: nowrap; }
      .navbar { padding: 0 14px; }
    }
"""


def make_article(a):
    """
    a: slug, title, desc, hero, tag, h1, sub, readtime, breadcrumb (list of (text,href|None)),
       body (html), siblings (list of (text, href, icon)), sources (list of (text,url)),
       extra_css (optional), affiliate (optional slot id), affiliate_title (optional)
    """
    hero_css = BASE_CSS.replace('__HERO__', a['hero'])
    crumbs = ' ← '.join(
        ('<a href="%s">%s</a>' % (esc(h), esc(t))) if h else esc(t)
        for t, h in a['breadcrumb'])
    sibs = '\n'.join(
        '      <a href="%s" class="sibling"><i class="fas %s"></i> %s</a>' % (esc(h), esc(i), esc(t))
        for t, h, i in a['siblings'])
    srcs = '\n'.join(
        '      <li><a href="%s" target="_blank" rel="noopener">%s</a></li>' % (esc(u), esc(t))
        for t, u in a['sources'])
    aff = ('\n  <div data-affiliate="%s" data-title="%s"></div>\n'
           % (esc(a['affiliate']), esc(a.get('affiliate_title', 'כדאי לסדר מראש')))) if a.get('affiliate') else ''

    doc = f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-QWWEWYZWCK"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){{dataLayer.push(arguments);}}
    gtag('js', new Date());
    gtag('config', 'G-QWWEWYZWCK');
  </script>

  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{esc(a['title'])} | גו לונדון</title>
  <meta name="description" content="{esc(a['desc'])}" />
  <link rel="canonical" href="{SITE}/{a['slug']}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="{esc(a['title'])}" />
  <meta property="og:description" content="{esc(a['desc'])}" />
  <meta property="og:url" content="{SITE}/{a['slug']}" />
  <meta property="og:image" content="{SITE}/images/{a['hero']}" />
  <meta property="og:locale" content="he_IL" />
  <meta property="og:site_name" content="גו לונדון" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{esc(a['title'])}" />
  <meta name="twitter:description" content="{esc(a['desc'])}" />
  <meta name="twitter:image" content="{SITE}/images/{a['hero']}" />
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "{esc(a['title'])}",
    "inLanguage": "he",
    "image": "{SITE}/images/{a['hero']}",
    "author": {{ "@type": "Organization", "name": "גו לונדון" }},
    "publisher": {{ "@type": "Organization", "name": "גו לונדון", "url": "{SITE}" }},
    "mainEntityOfPage": "{SITE}/{a['slug']}"
  }}
  </script>
  <style>
{hero_css}{a.get('extra_css', '')}  </style>
  <link rel="manifest" href="manifest.json" />
  <meta name="theme-color" content="#DC2626" />
  <link rel="apple-touch-icon" href="images/apple-touch-icon.png" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="192x192" href="images/favicon-192.png" />
  <link rel="icon" type="image/png" sizes="96x96" href="images/favicon-96.png" />
  <link rel="icon" type="image/png" sizes="48x48" href="images/favicon-48.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="images/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="images/favicon-16.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Go London" />
  <link rel="stylesheet" href="accessibility-widget.css" />
  <link rel="stylesheet" href="theme-light.css?v=3" />
</head>
<body>

<nav class="navbar">
  <a href="index.html" class="logo">
    <img src="images/logo.png" alt="גו לונדון" class="logo-img" width="86" height="48" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
    <div class="logo-text-fallback"><span class="logo-go">GO</span><span class="logo-london">LONDON</span></div>
    <span class="logo-slogan">המדריך הישראלי ללונדון</span>
  </a>
  <a href="index.html" class="back-btn"><i class="fas fa-arrow-right"></i> חזרה לדף הבית</a>
</nav>

<main>
<div class="page-hero hero-photo">
  <span class="tag">{a['tag']}</span>
  <h1>{esc(a['h1'])}</h1>
  <p>{esc(a['sub'])}</p>
  <div class="meta"><span><i class="far fa-clock"></i> {esc(a['readtime'])} דקות קריאה</span></div>
</div>

<div class="breadcrumb">{crumbs}</div>

<div class="content">
  <p class="freshness"><i class="fas fa-circle-check"></i> עודכן לאחרונה באוגוסט 2026</p>

{a['body']}
{aff}
  <div class="siblings">
    <h3>המשך קריאה בנושא</h3>
    <div class="sibling-grid">
{sibs}
    </div>
  </div>

  <div class="sources">
    <h3>מקורות</h3>
    <ul>
{srcs}
    </ul>
  </div>

  <div class="back-cta">
    <a href="{esc(a['breadcrumb'][-2][1])}"><i class="fas fa-arrow-right"></i> {esc(a['back_label'])}</a>
  </div>
</div>
</main>

<script src="accessibility-widget.js" defer></script>
<script src="install-prompt.js" defer></script>
<script src="affiliate.js?v=2" defer></script>
<script src="community-ask.js?v=2" defer></script>
</body>
</html>
"""
    open(a['slug'], 'w', encoding='utf-8').write(doc)
    return a['slug']
