/*
  רשימת המאמרים והפוסטים של אשכול
  ================================
  בתחתית כל מדריך ראשי מוצגת כאן רשימה מלאה ומעוצבת של כל מה שנכתב
  באותו נושא: המאמרים המורחבים של האשכול, ואחריהם הפוסטים מאותה
  קטגוריה. כך אפשר לעבור ישירות לנושא שמעניין בלי לחזור לדף הבית.

  איך משתמשים בזה בעמוד:
    <div data-cluster-index="transport"></div>
    <script src="category-index.js" defer></script>

  המזהה חייב להתאים למפתח ב-guides.json. הקובץ הזה נבנה אוטומטית
  מהעמודים עצמם, ולכן הרשימה מתעדכנת לבד כשנוסף מאמר.
  הפוסטים נשלפים מ-posts.json לפי שם הקטגוריה שרשום באשכול.
*/

(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* קיצור לגבול מילים, כדי שלא ייחתך באמצע מילה */
  function trim(txt, max) {
    txt = String(txt || '').replace(/\s+/g, ' ').trim();
    if (txt.length <= max) return txt;
    var cut = txt.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,.;:]$/, '') + '…';
  }

  function injectStyles() {
    if (document.getElementById('cluster-index-styles')) return;
    var css = [
      '.cix{margin:52px 0 8px;}',
      '.cix-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:6px;}',
      '.cix h2.cix-title{font-size:22px;font-weight:900;color:#201f2b!important;margin:0!important;padding:0!important;border:none!important;}',
      '.cix-count{font-size:13px;font-weight:700;color:#858a9c!important;}',
      '.cix-sub{font-size:14.5px;color:#55596b!important;margin:0 0 20px;line-height:1.7;}',
      '.cix-band{font-size:12px;font-weight:900;letter-spacing:.4px;color:#15803D!important;background:rgba(21,128,61,.10);display:inline-block;padding:4px 12px;border-radius:50px;margin:26px 0 13px;}',
      '.cix-band.is-post{color:#B45309!important;background:rgba(180,83,9,.10);}',
      '.cix-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:14px;}',
      '.cix-card{display:flex;flex-direction:column;background:#fff;border:1px solid rgba(32,31,43,.10);border-radius:16px;overflow:hidden;text-decoration:none!important;box-shadow:0 1px 2px rgba(16,24,40,.04),0 8px 20px rgba(16,24,40,.06);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;}',
      '.cix-card:hover{transform:translateY(-3px);box-shadow:0 4px 8px rgba(16,24,40,.06),0 16px 34px rgba(16,24,40,.12);border-color:rgba(220,38,38,.35);}',
      '.cix-img{height:132px;background-size:cover;background-position:center;background-color:#e9e7e2;position:relative;}',
      '.cix-img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,14,26,0) 55%,rgba(10,14,26,.30) 100%);}',
      '.cix-body{padding:14px 16px 15px;display:flex;flex-direction:column;flex:1;}',
      '.cix-card h3{font-size:15.5px;font-weight:800;line-height:1.45;color:#201f2b!important;margin:0 0 7px!important;}',
      '.cix-card p{font-size:13.5px;line-height:1.65;color:#55596b!important;margin:0 0 12px!important;flex:1;}',
      '.cix-go{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:#DC2626!important;}',
      '.cix-go i{transition:transform .16s ease;}',
      '.cix-card:hover .cix-go i{transform:translateX(-3px);}',
      '.cix-empty{font-size:14px;color:#858a9c!important;}',
      '@media(max-width:560px){.cix-grid{grid-template-columns:1fr;}.cix-img{height:150px;}}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'cluster-index-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function card(item) {
    var img = item.img
      ? '<div class="cix-img" style="background-image:url(\'' + esc(item.img) + '\')"></div>'
      : '';
    return '<a class="cix-card" href="' + esc(item.url) + '">' + img +
      '<div class="cix-body">' +
        '<h3>' + esc(item.title) + '</h3>' +
        (item.desc ? '<p>' + esc(trim(item.desc, 118)) + '</p>' : '<p></p>') +
        '<span class="cix-go">' + esc(item.go) + ' <i class="fas fa-arrow-left"></i></span>' +
      '</div></a>';
  }

  function render(host, cluster, posts) {
    var here = location.pathname.split('/').pop() || 'index.html';

    var articles = (cluster.articles || []).filter(function (a) { return a.url !== here; });

    var mine = posts.filter(function (p) { return (p.category || '') === cluster.postCat; })
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); })
      .map(function (p) {
        return {
          title: p.title,
          desc: p.content,
          img: p.image,
          url: 'category.html?cat=' + encodeURIComponent(p.category) + '#post-' + p.id,
          go: 'לפוסט'
        };
      });

    var total = articles.length + mine.length;
    if (!total) { host.remove(); return; }

    var html = '<section class="cix">' +
      '<div class="cix-head">' +
        '<h2 class="cix-title">כל מה שכתבנו על ' + esc(cluster.label) + '</h2>' +
        '<span class="cix-count">' + total + ' פריטים</span>' +
      '</div>' +
      '<p class="cix-sub">המאמרים המורחבים והפוסטים בנושא הזה, במקום אחד. אפשר לקפוץ ישר למה שרלוונטי לכם.</p>';

    if (articles.length) {
      html += '<span class="cix-band">📘 מאמרים מורחבים</span><div class="cix-grid">' +
        articles.map(function (a) {
          return card({ title: a.title, desc: a.desc, img: a.img, url: a.url, go: 'למאמר' });
        }).join('') + '</div>';
    }
    if (mine.length) {
      html += '<span class="cix-band is-post">📝 פוסטים בנושא</span><div class="cix-grid">' +
        mine.map(card).join('') + '</div>';
    }
    html += '</section>';
    host.innerHTML = html;
  }

  function init() {
    var host = document.querySelector('[data-cluster-index]');
    if (!host) return;
    var key = host.getAttribute('data-cluster-index');

    injectStyles();

    Promise.all([
      fetch('guides.json?v=1').then(function (r) { return r.json(); }),
      fetch('posts.json?v=1').then(function (r) { return r.json(); }).catch(function () { return []; })
    ]).then(function (res) {
      var cluster = res[0] && res[0].clusters && res[0].clusters[key];
      if (!cluster) { host.remove(); return; }
      render(host, cluster, Array.isArray(res[1]) ? res[1] : []);
    }).catch(function () {
      /* אם הנתונים לא נטענו, עדיף לא להציג שלד ריק */
      host.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
