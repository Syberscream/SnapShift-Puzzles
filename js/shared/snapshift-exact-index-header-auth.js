(() => {
  const REMEMBERED_USERNAME_COOKIE = 'snapshift_remembered_username';

  function setRememberedUsername(username){
    const value = String(username || '').trim();
    if (!value) return;
    try {
      document.cookie = `${REMEMBERED_USERNAME_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60*60*24*365}; SameSite=Lax`;
    } catch(e){}
  }

  function getRememberedUsername(){
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + REMEMBERED_USERNAME_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch(e){ return ''; }
  }

  function buildRememberedLoginHref(base = 'login.php'){
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
    }catch(e){
      if (pill && !pill.textContent.trim()) pill.textContent = 'Points: 0';
    }finally{
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
        setRememberedUsername(u);
        el.textContent = `Signed in: ${u}`;
        el.href = '#';
        el.onclick = (ev) => doLogout(ev);
        el.title = 'Sign out';
      } else {
        el.textContent = 'Sign in';
        el.href = buildRememberedLoginHref('login.php');
        el.onclick = null;
        el.title = 'Sign in';
      }
    }catch(e){
      el.textContent = 'Sign in';
      el.href = buildRememberedLoginHref('login.php');
      el.onclick = null;
      el.title = 'Sign in';
    }
    refreshPointsFromServer().catch(()=>{});
  }

  initAuthPill().catch(()=>{});
  window.addEventListener('focus', () => { initAuthPill().catch(()=>{}); });
  window.addEventListener('pageshow', () => { initAuthPill().catch(()=>{}); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) initAuthPill().catch(()=>{}); });
})();
