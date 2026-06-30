// ===== פס מידע חי =====

// שעון לונדון — מתעדכן כל שנייה
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('he-IL', {
    timeZone: 'Europe/London',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  document.getElementById('london-time').textContent = timeStr;
}
updateClock();
setInterval(updateClock, 1000);

// מזג אוויר — Open-Meteo (חינם, ללא מפתח)
const weatherCodes = {
  0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
  45:'🌫️', 48:'🌫️',
  51:'🌦️', 53:'🌦️', 55:'🌧️',
  61:'🌧️', 63:'🌧️', 65:'🌧️',
  71:'❄️', 73:'❄️', 75:'❄️',
  80:'🌦️', 81:'🌦️', 82:'⛈️',
  95:'⛈️', 96:'⛈️', 99:'⛈️'
};
async function fetchWeather() {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current_weather=true'
    );
    const data = await res.json();
    const temp = Math.round(data.current_weather.temperature);
    const code = data.current_weather.weathercode;
    const icon = weatherCodes[code] || '🌤️';
    document.getElementById('weather-icon').textContent = icon;
    document.getElementById('weather-temp').textContent = temp + '°C';
  } catch {
    document.getElementById('weather-temp').textContent = '--°C';
  }
}
fetchWeather();
setInterval(fetchWeather, 30 * 60 * 1000);

// שער לירה שטרלינג — ExchangeRate-API (חינם, ללא מפתח)
async function fetchGBP() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/GBP');
    const data = await res.json();
    const rate = data.rates.ILS.toFixed(2);
    document.getElementById('gbp-rate').textContent = rate;
  } catch {
    document.getElementById('gbp-rate').textContent = '--';
  }
}
fetchGBP();
setInterval(fetchGBP, 60 * 60 * 1000);

// ===== ניווט — גלילה
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
});

// תפריט נייד
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
burger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
mobileMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => mobileMenu.classList.remove('open'));
});

// מונה מספרים סטטיסטיקה
function animateCounter(el) {
  const target = +el.dataset.target;
  const duration = 2000;
  const step = target / (duration / 16);
  let current = 0;
  const timer = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.textContent = target >= 1000
      ? Math.floor(current).toLocaleString('he-IL')
      : Math.floor(current);
  }, 16);
}

// אנימציה בגלילה
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    if (el.classList.contains('counter')) {
      animateCounter(el);
    } else {
      el.classList.add('visible');
    }
    observer.unobserve(el);
  });
}, { threshold: 0.15 });

// כרטיסים
document.querySelectorAll('.cat-card, .article-card, .route-card, .why-item').forEach((el, i) => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(28px)';
  el.style.transition = `opacity 0.5s ease ${i * 0.06}s, transform 0.5s ease ${i * 0.06}s`;
  el.classList.add('anim-item');
  observer.observe(el);
});

// מונים
document.querySelectorAll('.counter').forEach(el => observer.observe(el));

// CSS class לאנימציה
document.head.insertAdjacentHTML('beforeend', `
  <style>
    .anim-item.visible { opacity: 1 !important; transform: translateY(0) !important; }
  </style>
`);

// ===== פוסטים מהקהילה =====
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderPosts(posts) {
  const grid  = document.getElementById('postsGrid');
  const empty = document.getElementById('emptyPosts');
  if (!grid) return;

  if (!posts.length) {
    grid.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }

  grid.style.display = 'grid';
  if (empty) empty.style.display = 'none';

  grid.innerHTML = posts.slice(0, 9).map(p => `
    <div class="post-item">
      <div class="post-item-img">
        ${p.image
          ? `<img src="${escHtml(p.image)}" alt="${escHtml(p.title)}" onerror="this.parentElement.innerHTML='📰'" />`
          : '📰'}
      </div>
      <div class="post-item-body">
        <span class="post-item-cat">${escHtml(p.category)}</span>
        <div class="post-item-title">${escHtml(p.title)}</div>
        <div class="post-item-text">${escHtml(p.desc)}</div>
        <div class="post-item-footer">
          <span>${escHtml(p.author || '')}${p.date ? ' · ' + escHtml(p.date) : ''}</span>
          ${p.url ? `<a href="${escHtml(p.url)}" target="_blank" rel="noopener">לפוסט המקורי →</a>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

async function loadCommunityPosts() {
  let posts = [];
  try {
    const res = await fetch('posts.json?v=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        posts = data;
      }
    }
  } catch {}

  if (!posts.length) {
    try { posts = JSON.parse(localStorage.getItem('golondon_posts') || '[]'); } catch {}
  }

  renderPosts(posts);
}

loadCommunityPosts();

// טופס ניוזלטר
function handleNewsletter(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const input = e.target.querySelector('input');
  btn.textContent = '✓ נרשמת!';
  btn.style.background = '#16a34a';
  input.value = '';
  setTimeout(() => { btn.textContent = 'הרשמה — חינם'; btn.style.background = ''; }, 3000);
}
