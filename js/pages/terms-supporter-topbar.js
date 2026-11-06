(() => {
  function toTitleCaseSupporter(value){
    const raw = String(value || '').trim();
    if (!raw) return 'Supporter';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
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
      pill.textContent = `â˜… ${toTitleCaseSupporter(supporter.badgeLabel || 'Supporter')}`;
    }
  }

  async function syncSupporterTopbar(){
    const el = document.getElementById('authPill');
    if (!el) return;
    try{
      const r = await fetch('/api/me.php', { credentials:'include', cache:'no-store' });
      const j = await r.json().catch(() => null);
      const loggedIn = !!(j && j.loggedIn);

      if (loggedIn){
        renderSupporterUi(j.supporter || null, true);
      } else {
        renderSupporterUi(null, false);
      }

      try{
        const pr = await fetch('/api/points_get.php', { credentials:'include', cache:'no-store' });
        const pj = await pr.json().catch(() => null);
        renderSupporterUi(
          loggedIn ? ((pj && pj.supporter) ? pj.supporter : (j.supporter || null)) : null,
          loggedIn
        );
      }catch(e){
        renderSupporterUi(loggedIn ? (j.supporter || null) : null, loggedIn);
      }
    }catch(e){
      renderSupporterUi(null, false);
    }
  }

  ensureSupporterPill();
  syncSupporterTopbar().catch(() => {});
  window.addEventListener('focus', () => { syncSupporterTopbar().catch(() => {}); });
  window.addEventListener('pageshow', () => { syncSupporterTopbar().catch(() => {}); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncSupporterTopbar().catch(() => {}); });
})();
