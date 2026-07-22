(function () {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js').catch(function () {});
    });
  }

  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return;

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  var dismissed = localStorage.getItem('golondon_install_dismissed');
  var deferredPrompt = null;

  var style = document.createElement('style');
  style.textContent = [
    '#install-app-btn{position:fixed;bottom:24px;left:88px;z-index:9000;display:none;align-items:center;gap:8px;',
    'background:linear-gradient(135deg,#DC2626,#7C3AED);color:#fff;border:none;border-radius:50px;',
    'padding:12px 18px;font-family:Heebo,system-ui,sans-serif;font-size:14px;font-weight:700;cursor:pointer;',
    'box-shadow:0 8px 24px rgba(0,0,0,0.25);transition:transform 0.2s ease;}',
    '#install-app-btn:hover{transform:translateY(-2px);}',
    '#install-app-btn .close-x{background:rgba(255,255,255,0.25);border-radius:50%;width:18px;height:18px;',
    'display:flex;align-items:center;justify-content:center;font-size:11px;margin-right:2px;}',
    '#install-ios-tip{position:fixed;bottom:78px;left:24px;right:24px;max-width:340px;margin:0 auto;z-index:9001;',
    'background:#201f2b;color:#fff;padding:16px 18px;border-radius:14px;font-family:Heebo,system-ui,sans-serif;',
    'font-size:13.5px;line-height:1.7;box-shadow:0 12px 30px rgba(0,0,0,0.3);display:none;direction:rtl;text-align:right;}',
    '#install-ios-tip strong{color:#f97316;}',
    '@media (max-width:640px){#install-app-btn{left:16px;bottom:16px;}}'
  ].join('');
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'install-app-btn';
  btn.setAttribute('aria-label', 'התקן את גו לונדון כאפליקציה');
  btn.innerHTML = '<span>📲</span><span>התקן כאפליקציה</span><span class="close-x">✕</span>';

  var iosTip = document.createElement('div');
  iosTip.id = 'install-ios-tip';
  iosTip.innerHTML = 'להתקנה: הקישו על כפתור <strong>שיתוף</strong> בדפדפן, ואז על <strong>"הוסף למסך הבית"</strong>.';

  function showButton() {
    if (dismissed) return;
    btn.style.display = 'flex';
    document.body.appendChild(btn);
  }

  function closeAll() {
    btn.style.display = 'none';
    iosTip.style.display = 'none';
    localStorage.setItem('golondon_install_dismissed', '1');
  }

  btn.addEventListener('click', function (e) {
    var target = e.target.closest('.close-x');
    if (target) { closeAll(); return; }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
        btn.style.display = 'none';
      });
    } else if (isIOS) {
      document.body.appendChild(iosTip);
      iosTip.style.display = iosTip.style.display === 'block' ? 'none' : 'block';
    }
  });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showButton();
  });

  window.addEventListener('appinstalled', function () {
    closeAll();
  });

  if (isIOS) {
    showButton();
  }
})();
