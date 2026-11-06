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
      return j;
    }catch(e){
      if (pill && !pill.textContent.trim()) pill.textContent = 'Points: 0';
      return null;
    }
  }

  function ensureSupporterBadgePill(){
    const auth = document.getElementById('authPill');
    if (!auth || !auth.parentNode) return null;
    let badge = document.getElementById('supporterBadgePill');
    if (badge) return badge;
    badge = document.createElement('span');
    badge.id = 'supporterBadgePill';
    badge.className = 'supporterBadgePill';
    badge.hidden = true;
    badge.setAttribute('aria-hidden', 'true');
    badge.style.display = 'none';
    badge.textContent = '★ Supporter';
    auth.insertAdjacentElement('afterend', badge);
    return badge;
  }

  function formatSupporterDate(value){
    try{
      if (!value) return 'Every 30 days';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return 'Every 30 days';
      return d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
    }catch(e){ return 'Every 30 days'; }
  }

  function renderSupporterUi(supporter){
    const badge = ensureSupporterBadgePill();
    const section = document.getElementById('supporterStatusSection');
    const badgeValue = document.getElementById('supporterBadgeValue');
    const planValue = document.getElementById('supporterPlanValue');
    const nextValue = document.getElementById('supporterNextBonusValue');
    const note = document.getElementById('supporterBonusNote');
    const active = !!(supporter && supporter.active);

    if (badge) {
      badge.hidden = !active;
      badge.setAttribute('aria-hidden', active ? 'false' : 'true');
      badge.style.display = active ? '' : 'none';
      if (active) badge.textContent = `★ ${String(supporter.badgeLabel || 'Supporter')}`;
    }
    if (section) {
      section.hidden = !active;
      section.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (!active) return;

    if (badgeValue) badgeValue.textContent = `★ ${String(supporter.badgeLabel || 'Supporter')}`;
    if (planValue) planValue.textContent = String(supporter.plan || 'Supporter');
    if (nextValue) nextValue.textContent = formatSupporterDate(supporter.nextBonusAt || '');
    if (note) {
      const awarded = Number(supporter.bonusAwardedPoints || 0) || 0;
      note.textContent = awarded > 0
        ? `Supporter loyalty bonus received: +${awarded} points. Next bonus date: ${formatSupporterDate(supporter.nextBonusAt || '')}.`
        : `Supporter loyalty bonus: +${Number(supporter.bonusAmount || 250)} points every ${Number(supporter.bonusIntervalDays || 30)} days while active.`;
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
        renderSupporterUi(j.supporter || null);
        if (typeof j.points === 'number') {
          const pill = document.getElementById('pointsPill');
          if (pill) pill.textContent = `Points: ${Math.max(0, Number(j.points) || 0)}`;
        } else {
          const pj = await refreshPointsFromServer();
          renderSupporterUi((pj && pj.supporter) ? pj.supporter : (j.supporter || null));
        }
      } else {
        el.textContent = 'Sign in';
        el.href = buildRememberedLoginHref('login.php');
        el.onclick = null;
        el.title = 'Sign in';
        renderSupporterUi(null);
        await refreshPointsFromServer();
      }
    }catch(e){
      el.textContent = 'Sign in';
      el.href = buildRememberedLoginHref('login.php');
      el.onclick = null;
      el.title = 'Sign in';
      renderSupporterUi(null);
      await refreshPointsFromServer();
    }
  }

  initAuthPill().catch(()=>{});
  window.addEventListener('focus', () => { initAuthPill().catch(()=>{}); });
  window.addEventListener('pageshow', () => { initAuthPill().catch(()=>{}); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) initAuthPill().catch(()=>{}); });
})();
