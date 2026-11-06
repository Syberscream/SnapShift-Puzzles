(() => {
  try {
    const y = document.getElementById('footerYear');
    if (y) y.textContent = new Date().getFullYear();
  } catch(e){}

  const REMEMBERED_USERNAME_COOKIE = 'snapshift_remembered_username';

  function getRememberedUsername(){
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + REMEMBERED_USERNAME_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch(e){ return ''; }
  }

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

  function shortName(value){
    const raw = String(value || '').trim();
    if (!raw) return 'Player';
    return raw.length > 18 ? (raw.slice(0, 18) + 'â€¦') : raw;
  }

  async function refreshShopAuthUi(){
    const authPill = document.getElementById('authPill');
    const pointsPill = document.getElementById('pointsPill');
    if (!authPill) return;

    authPill.href = buildRememberedLoginHref('/login.php');
    authPill.textContent = 'Sign in';
    authPill.removeAttribute('title');
    if (pointsPill) {
      pointsPill.style.display = 'none';
      pointsPill.textContent = 'Points: 0';
    }

    try{
      const r = await fetch('/api/me.php', { credentials:'include', cache:'no-store' });
      const j = await r.json().catch(() => null);
      if (!(j && j.ok && j.loggedIn)) return;

      authPill.textContent = `Signed in: ${shortName(j.username)}`;
      authPill.href = '/logout.php';
      authPill.title = 'Sign out';

      try{
        const pr = await fetch('/api/points_get.php', { credentials:'include', cache:'no-store' });
        const pj = await pr.json().catch(() => null);
        if (pointsPill && pj && pj.ok && pj.loggedIn) {
          pointsPill.textContent = `Points: ${Math.max(0, Number(pj.points) || 0)}`;
          pointsPill.style.display = 'inline-flex';
        }
      }catch(e){}
    }catch(e){}
  }

  refreshShopAuthUi();
})();
