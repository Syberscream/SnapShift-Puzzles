(() => {
  function supporterActiveFromPayload(payload){
    const j = (payload && typeof payload === 'object') ? payload : {};
    if (!j.loggedIn) return null;
    const s = (j.supporter && typeof j.supporter === 'object') ? j.supporter : null;
    const active = !!(
      (s && (s.active || s.isActive || s.is_supporter || s.supporterActive)) ||
      j.supporterActive || j.is_supporter || j.isSupporter
    );
    if (!active) return null;
    return {
      active: true,
      badgeLabel: String((s && (s.badgeLabel || s.badge_label || s.label)) || 'Supporter').trim() || 'Supporter'
    };
  }

  function applySupporterUi(payload){
    const pill = document.getElementById('supporterPill');
    if (!pill) return;
    const supporter = supporterActiveFromPayload(payload);
    if (!supporter){
      pill.hidden = true;
      pill.setAttribute('aria-hidden', 'true');
      return;
    }
    pill.textContent = `â˜… ${supporter.badgeLabel}`;
    pill.hidden = false;
    pill.removeAttribute('aria-hidden');
  }

  async function refreshSupporterUi(){
    try{
      const r = await fetch('/api/me.php', { credentials:'include', cache:'no-store' });
      const j = await r.json().catch(() => null);
      applySupporterUi(j);
    }catch(e){
      applySupporterUi(null);
    }
  }

  refreshSupporterUi().catch(() => {});
  window.addEventListener('focus', () => { refreshSupporterUi().catch(() => {}); });
  window.addEventListener('pageshow', () => { refreshSupporterUi().catch(() => {}); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSupporterUi().catch(() => {}); });
})();
