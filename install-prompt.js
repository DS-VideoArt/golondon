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
    '#install-app-btn{position:fixed;bottom:86px;left:20px;z-index:9000;display:none;align-items:center;justify-content:center;',
    'width:58px;height:58px;border-radius:50%;padding:6px;box-sizing:border-box;',
    'background:#fff;border:2px solid rgba(255,255,255,0.6);',
    'cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,0.3);',
    'transition:transform 0.2s ease, box-shadow 0.2s ease;}',
    '#install-app-btn img{width:100%;height:100%;object-fit:contain;border-radius:50%;}',
    '#install-app-btn:hover{transform:scale(1.08);box-shadow:0 10px 28px rgba(0,0,0,0.4);}',
    '#install-app-btn .close-x{position:absolute;top:-4px;right:-4px;background:#201f2b;color:#fff;',
    'border:2px solid #fff;border-radius:50%;width:22px;height:22px;font-size:11px;font-weight:700;',
    'display:flex;align-items:center;justify-content:center;line-height:1;}',
    '#install-ios-tip{position:fixed;bottom:150px;left:16px;max-width:260px;z-index:9001;',
    'background:#201f2b;color:#fff;padding:16px 18px;border-radius:14px;font-family:Heebo,system-ui,sans-serif;',
    'font-size:13.5px;line-height:1.7;box-shadow:0 12px 30px rgba(0,0,0,0.3);display:none;direction:rtl;text-align:right;}',
    '#install-ios-tip strong{color:#f97316;}',
    '@media (max-width:640px){#install-app-btn{left:12px;bottom:auto;top:120px;width:50px;height:50px;font-size:20px;}',
    '#install-ios-tip{bottom:auto;top:178px;left:12px;max-width:calc(100vw - 24px);}}'
  ].join('');
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'install-app-btn';
  btn.setAttribute('aria-label', 'התקן את גו לונדון כאפליקציה');
  btn.style.position = 'fixed';
  btn.innerHTML = '<img src="images/icon-192.png" alt="" /><span class="close-x" aria-label="סגור" role="button">✕</span>';

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
