(() => {
  try {
    const y = document.getElementById('footerYear');
    if (y) y.textContent = new Date().getFullYear();
  } catch(e){}

  const REMEMBERED_USERNAME_COOKIE = 'snapshift_remembered_username';
  function buildRememberedLoginHref(base = '/login.php'){
    try {
      const url = new URL(base, window.location.href);
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (current && !/\/login\.php$/i.test(window.location.pathname)) {
        url.searchParams.set('return', current);
      }
      return url.pathname + url.search + url.hash;
    } catch(e){
      try{
        const current = window.location.pathname + window.location.search + window.location.hash;
        if (current && !/\/login\.php$/i.test(window.location.pathname)) {
          return `${base}${base.includes('?') ? '&' : '?'}return=${encodeURIComponent(current)}`;
        }
      }catch(err){}
      return base;
    }
  }
  function doLogout(ev){
    if (ev) ev.preventDefault();
    window.location.href = 'logout.php';
  }

  async function refreshPointsFromServer(){
    const pill = document.getElementById('pointsPill');
    try{
      const r = await fetch('/api/points_get.php', { credentials:'include', cache:'no-store' });
      const j = await r.json().catch(() => null);
      const points = (j && j.loggedIn) ? (Number(j.points)||0) : 0;
      if (pill) pill.textContent = `Points: ${points}`;
      return j;
    }catch(e){
      if (pill && !pill.textContent.trim()) pill.textContent = 'Points: 0';
      return null;
    }
  }



  function ensureSupporterPill(){
    const auth = document.getElementById('authPill');
    if (!auth || !auth.parentNode) return null;
    let pill = document.getElementById('supporterPill');
    if (pill) return pill;
    pill = document.createElement('span');
    pill.id = 'supporterPill';
    pill.hidden = true;
    pill.textContent = 'â˜… Supporter';
    auth.insertAdjacentElement('afterend', pill);
    return pill;
  }

  function renderSupporterUi(supporter, loggedIn){
    const pill = ensureSupporterPill();
    const active = !!(loggedIn && supporter && supporter.active);
    if (!pill) return;
    pill.hidden = !active;
    if (active){
      pill.textContent = `â˜… ${String(supporter.badgeLabel || 'Supporter')}`;
    }
  }

  async function initAuthPill(){
    const el = document.getElementById('authPill');
    if (!el) return;
    try{
      const r = await fetch('/api/me.php', { credentials:'include', cache:'no-store' });
      const j = await r.json().catch(() => null);
      if (j && j.loggedIn){
        const u = j.username || 'Account';
        try { document.cookie = `${REMEMBERED_USERNAME_COOKIE}=${encodeURIComponent(u)}; path=/; max-age=${60*60*24*365}; SameSite=Lax`; } catch(e){}
        el.textContent = `Signed in: ${u}`;
        el.href = '#';
        el.onclick = (ev) => doLogout(ev);
        el.title = 'Sign out';
        renderSupporterUi(j.supporter || null, true);
      } else {
        el.textContent = 'Sign in';
        el.href = buildRememberedLoginHref('login.php');
        el.onclick = null;
        el.title = 'Sign in';
        renderSupporterUi(null, false);
      }
      const pj = await refreshPointsFromServer();
      renderSupporterUi((j && j.loggedIn) ? ((pj && pj.supporter) ? pj.supporter : (j.supporter || null)) : null, !!(j && j.loggedIn));
    }catch(e){
      el.textContent = 'Sign in';
      el.href = buildRememberedLoginHref('login.php');
      el.onclick = null;
      el.title = 'Sign in';
      renderSupporterUi(null, false);
      await refreshPointsFromServer();
    }
  }

  function applyAdminThemeTokens(t){
    try{
      const root = document.documentElement;
      const theme = (t && typeof t === 'object') ? t : {};
      const pick = (key, fallback) => {
        const v = theme[key];
        return (typeof v === 'string' && v.trim()) ? v.trim() : fallback;
      };
      root.style.setProperty('--ss-site-bg', pick('siteBackgroundColor', '#0B1220'));
      root.style.setProperty('--ss-panel-bg', pick('panelBackgroundColor', 'rgba(15,23,42,.72)'));
      root.style.setProperty('--ss-section-bg', pick('sectionBackgroundColor', 'rgba(17,27,45,.78)'));
      root.style.setProperty('--ss-card-bg', pick('cardBackgroundColor', 'rgba(26,39,64,.78)'));
      root.style.setProperty('--ss-border', pick('borderColor', 'rgba(42,57,82,.85)'));
      root.style.setProperty('--ss-text', pick('textColor', '#E8EEF7'));
      root.style.setProperty('--ss-muted', pick('mutedTextColor', '#AFC2E0'));
      root.style.setProperty('--ss-accent', pick('accentColor', '#36CFC9'));
      root.style.setProperty('--ss-accent-2', pick('accentSecondaryColor', '#7CC4FF'));
      root.style.setProperty('--ss-button-bg', pick('buttonBackgroundColor', '#16335D'));
      root.style.setProperty('--ss-button-text', pick('buttonTextColor', '#E8EEF7'));
      root.style.setProperty('--ss-pill-bg', pick('pillBackgroundColor', '#142848'));
      root.style.setProperty('--ss-pill-text', pick('pillTextColor', '#E8EEF7'));
      root.style.setProperty('--ss-font', pick('fontFamily', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'));
      root.style.setProperty('--ss-heading-font', pick('headingFontFamily', pick('fontFamily', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif')));
      root.style.setProperty('--controlBg', pick('buttonBackgroundColor', 'rgba(11,18,32,0.88)'));
      root.style.setProperty('--controlBorder', pick('borderColor', 'rgba(42,57,82,0.95)'));
      root.style.setProperty('--controlText', pick('buttonTextColor', '#e8eef7'));
      root.style.setProperty('--controlBgAlt', pick('sectionBackgroundColor', 'rgba(18,28,48,0.92)'));
    }catch(e){}
  }

  async function applyThemeFromJson(){
    try{
      const bust = Date.now();
      const r = await fetch('/theme.json?t=' + bust, { cache:'no-store' });
      if (!r.ok) return;
      const t = await r.json();
      applyAdminThemeTokens(t);
      const root = document.documentElement;
      const body = document.body;
      const themeEnabled = t.themeEnabled !== false;
      if (body) body.classList.toggle('theme-on', themeEnabled);
      const alpha = Number(t.themeAlpha);
      root.style.setProperty('--themeAlpha', Number.isFinite(alpha) ? String(Math.max(0, Math.min(1, alpha))) : '0.85');
      const bg = typeof t.backgroundImage === 'string' ? t.backgroundImage.trim() : '';
      root.style.setProperty('--bgUrl', bg ? `url("${bg}?t=${bust}")` : 'none');
      let frog = document.getElementById('frogImg');
      if (!frog && body) {
        frog = document.createElement('img');
        frog.id = 'frogImg';
        frog.className = 'frog';
        frog.alt = '';
        frog.setAttribute('aria-hidden', 'true');
        body.appendChild(frog);
      }
      const frogSrc = typeof t.frogImage === 'string' ? t.frogImage.trim() : '';
      if (frog) {
        if (themeEnabled && frogSrc) {
          frog.src = frogSrc + '?t=' + bust;
          frog.style.removeProperty('display');
        } else {
          frog.removeAttribute('src');
          frog.style.display = 'none';
        }
      }
    }catch(e){}
  }



  function applyContactStatusFromQuery(){
    const box = document.getElementById('contactStatusBox');
    if (!box) return;
    const params = new URLSearchParams(window.location.search);
    const sent = params.get('sent');
    const error = params.get('error');
    const topic = params.get('topic');
    if (sent === '1'){
      box.className = 'statusBox show isSuccess';
      box.textContent = topic
        ? `Thanks. Your message about ${topic} was sent successfully.`
        : 'Thanks. Your message was sent successfully.';
      return;
    }
    if (error){
      const map = {
        missing: 'Please fill in all required fields before sending your message.',
        email: 'Please enter a valid email address.',
        blocked: 'Your message could not be sent right now. Please try again or email us directly.',
        long: 'Your message is too long. Please shorten it and try again.',
        invalid: 'Please check your form details and try again.'
      };
      box.className = 'statusBox show isError';
      box.textContent = map[error] || 'Something went wrong while sending your message. Please try again.';
    }
  }

  initAuthPill().catch(()=>{});
  applyThemeFromJson().catch(()=>{});
  applyContactStatusFromQuery();
  window.addEventListener('focus', () => { initAuthPill().catch(()=>{}); applyThemeFromJson().catch(()=>{}); });
  window.addEventListener('pageshow', () => { initAuthPill().catch(()=>{}); applyThemeFromJson().catch(()=>{}); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { initAuthPill().catch(()=>{}); applyThemeFromJson().catch(()=>{}); } });
})();
