/* ===== ווידג'ט נגישות — גו לונדון =====
   רכיב משותף לכל דפי האתר. שומר העדפות ב-localStorage כדי שיישמרו בין עמודים.
*/
(function () {
  'use strict';

  const STORAGE_KEY = 'golondon_a11y_prefs';
  const html = document.documentElement;

  const TOGGLE_CLASSES = [
    'a11y-contrast', 'a11y-grayscale', 'a11y-invert', 'a11y-underline-links',
    'a11y-readable-font', 'a11y-big-cursor', 'a11y-pause-animations', 'a11y-lh', 'a11y-ls'
  ];
  const FONT_SIZE_CLASSES = ['a11y-fs-1', 'a11y-fs-2', 'a11y-fs-3'];

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function savePrefs(prefs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  let prefs = loadPrefs();

  function applyPrefs() {
    TOGGLE_CLASSES.forEach(cls => html.classList.toggle(cls, !!prefs[cls]));
    FONT_SIZE_CLASSES.forEach(cls => html.classList.remove(cls));
    if (prefs.fontSize > 0) {
      html.classList.add(FONT_SIZE_CLASSES[prefs.fontSize - 1]);
    }
  }

  applyPrefs();

  // ===== בניית הממשק =====
  function buildWidget() {
    const btn = document.createElement('button');
    btn.id = 'a11y-toggle-btn';
    btn.setAttribute('aria-label', 'פתח תפריט נגישות');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<i class="fas fa-universal-access" aria-hidden="true"></i>';

    const panel = document.createElement('div');
    panel.id = 'a11y-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'תפריט נגישות');
    panel.innerHTML = `
      <div class="a11y-header">
        <h2><i class="fas fa-universal-access" aria-hidden="true"></i> נגישות</h2>
        <button class="a11y-close" aria-label="סגור תפריט נגישות"><i class="fas fa-times"></i></button>
      </div>
      <div class="a11y-body">

        <div class="a11y-group">
          <h3>גודל טקסט</h3>
          <div class="a11y-stepper">
            <span>התאמת גודל</span>
            <div class="a11y-stepper-controls">
              <button data-action="fs-down" aria-label="הקטן טקסט">A-</button>
              <button data-action="fs-up" aria-label="הגדל טקסט">A+</button>
            </div>
          </div>
        </div>

        <div class="a11y-group">
          <h3>קריאות טקסט</h3>
          <div class="a11y-row">
            <button class="a11y-btn" data-toggle="a11y-lh"><i class="fas fa-text-height"></i>ריווח שורות</button>
            <button class="a11y-btn" data-toggle="a11y-ls"><i class="fas fa-arrows-alt-h"></i>ריווח אותיות</button>
            <button class="a11y-btn" data-toggle="a11y-readable-font"><i class="fas fa-font"></i>גופן קריא</button>
            <button class="a11y-btn" data-toggle="a11y-underline-links"><i class="fas fa-link"></i>הדגשת קישורים</button>
          </div>
        </div>

        <div class="a11y-group">
          <h3>ניגודיות וצבע</h3>
          <div class="a11y-row">
            <button class="a11y-btn" data-toggle="a11y-contrast"><i class="fas fa-adjust"></i>ניגודיות גבוהה</button>
            <button class="a11y-btn" data-toggle="a11y-grayscale"><i class="fas fa-tint-slash"></i>גווני אפור</button>
            <button class="a11y-btn" data-toggle="a11y-invert"><i class="fas fa-circle-half-stroke"></i>היפוך צבעים</button>
            <button class="a11y-btn" data-toggle="a11y-big-cursor"><i class="fas fa-mouse-pointer"></i>סמן מוגדל</button>
          </div>
        </div>

        <div class="a11y-group">
          <h3>ניווט ומיקוד</h3>
          <div class="a11y-row">
            <button class="a11y-btn" data-toggle="a11y-pause-animations"><i class="fas fa-pause-circle"></i>עצירת אנימציות</button>
            <button class="a11y-btn" id="a11y-guide-btn"><i class="fas fa-ruler-horizontal"></i>קו הכוונה</button>
          </div>
        </div>

        <div class="a11y-group">
          <h3>הקראת העמוד</h3>
          <div class="a11y-speech-controls">
            <button class="a11y-btn" id="a11y-speak-btn"><i class="fas fa-volume-up"></i>הקרא עמוד</button>
            <button class="a11y-btn" id="a11y-stop-speak-btn"><i class="fas fa-stop"></i>עצור</button>
          </div>
        </div>

        <button class="a11y-reset" id="a11y-reset-btn"><i class="fas fa-rotate-left"></i> איפוס כל ההגדרות</button>
        <a class="a11y-statement-link" href="accessibility.html">הצהרת הנגישות של האתר</a>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const readingGuide = document.createElement('div');
    readingGuide.id = 'a11y-reading-guide';
    document.body.appendChild(readingGuide);

    return { btn, panel, readingGuide };
  }

  function refreshButtonStates(panel) {
    panel.querySelectorAll('[data-toggle]').forEach(el => {
      const cls = el.getAttribute('data-toggle');
      el.classList.toggle('active', html.classList.contains(cls));
      el.setAttribute('aria-pressed', html.classList.contains(cls) ? 'true' : 'false');
    });
  }

  function init() {
    const { btn, panel, readingGuide } = buildWidget();
    refreshButtonStates(panel);

    let open = false;
    function setOpen(state) {
      open = state;
      panel.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        const firstFocusable = panel.querySelector('button');
        if (firstFocusable) firstFocusable.focus();
      }
    }

    btn.addEventListener('click', () => setOpen(!open));
    panel.querySelector('.a11y-close').addEventListener('click', () => setOpen(false));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) setOpen(false);
    });
    document.addEventListener('click', (e) => {
      if (open && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        setOpen(false);
      }
    });

    // ===== טוגלים כלליים =====
    panel.querySelectorAll('[data-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const cls = el.getAttribute('data-toggle');
        const nowActive = !html.classList.contains(cls);
        html.classList.toggle(cls, nowActive);
        prefs[cls] = nowActive;
        savePrefs(prefs);
        refreshButtonStates(panel);
      });
    });

    // ===== גודל טקסט =====
    function setFontSize(level) {
      level = Math.max(0, Math.min(3, level));
      prefs.fontSize = level;
      savePrefs(prefs);
      applyPrefs();
    }
    panel.querySelector('[data-action="fs-up"]').addEventListener('click', () => {
      setFontSize((prefs.fontSize || 0) + 1);
    });
    panel.querySelector('[data-action="fs-down"]').addEventListener('click', () => {
      setFontSize((prefs.fontSize || 0) - 1);
    });

    // ===== קו הכוונה לקריאה =====
    let guideActive = false;
    const guideBtn = document.getElementById('a11y-guide-btn');
    function moveGuide(e) {
      readingGuide.style.top = (e.clientY - 22) + 'px';
    }
    guideBtn.addEventListener('click', () => {
      guideActive = !guideActive;
      guideBtn.classList.toggle('active', guideActive);
      readingGuide.classList.toggle('active', guideActive);
      if (guideActive) {
        document.addEventListener('mousemove', moveGuide);
      } else {
        document.removeEventListener('mousemove', moveGuide);
      }
    });

    // ===== הקראת העמוד (Text-to-Speech) =====
    const speakBtn = document.getElementById('a11y-speak-btn');
    const stopSpeakBtn = document.getElementById('a11y-stop-speak-btn');
    const hasSpeech = 'speechSynthesis' in window;

    if (!hasSpeech) {
      speakBtn.disabled = true;
      speakBtn.style.opacity = '0.4';
      speakBtn.title = 'הדפדפן שלך לא תומך בהקראה';
    }

    function getReadableText() {
      const main = document.querySelector('main') || document.body;
      const clone = main.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, #a11y-panel, #a11y-toggle-btn, #a11y-reading-guide').forEach(el => el.remove());
      return clone.innerText.replace(/\s+/g, ' ').trim();
    }

    function pickHebrewVoice() {
      const voices = window.speechSynthesis.getVoices();
      return voices.find(v => v.lang && v.lang.toLowerCase().startsWith('he')) || null;
    }

    speakBtn.addEventListener('click', () => {
      if (!hasSpeech) return;
      window.speechSynthesis.cancel();
      const text = getReadableText();
      if (!text) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'he-IL';
      const voice = pickHebrewVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = 0.95;
      utterance.onstart = () => btn.classList.add('speaking');
      utterance.onend = () => btn.classList.remove('speaking');
      utterance.onerror = () => btn.classList.remove('speaking');
      window.speechSynthesis.speak(utterance);
    });

    stopSpeakBtn.addEventListener('click', () => {
      if (!hasSpeech) return;
      window.speechSynthesis.cancel();
      btn.classList.remove('speaking');
    });

    // עצירת הקראה אם עוזבים את העמוד
    window.addEventListener('beforeunload', () => {
      if (hasSpeech) window.speechSynthesis.cancel();
    });

    // ===== איפוס =====
    document.getElementById('a11y-reset-btn').addEventListener('click', () => {
      prefs = {};
      savePrefs(prefs);
      applyPrefs();
      refreshButtonStates(panel);
      if (guideActive) guideBtn.click();
      if (hasSpeech) window.speechSynthesis.cancel();
      btn.classList.remove('speaking');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
