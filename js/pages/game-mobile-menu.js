/* ===== PATCH: Mobile menu button wiring ===== */
(function(){
  const btn = document.getElementById('menuBtn');
  const overlay = document.getElementById('menuOverlay');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !overlay || !sidebar) return;

  function open(){ document.body.classList.add('sidebar-open'); overlay.setAttribute('aria-hidden','false'); }
  function close(){ document.body.classList.remove('sidebar-open'); overlay.setAttribute('aria-hidden','true'); }
  function toggle(){ document.body.classList.contains('sidebar-open') ? close() : open(); }

  btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggle(); });
  overlay.addEventListener('click', (e)=>{ e.preventDefault(); close(); });

  // Close on Escape
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') close(); });

  // Close after choosing a puzzle / starting (mobile UX)
  ['puzzleSel','sizeSel','startBtn'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', ()=>close());
    if (el) el.addEventListener('click', ()=>{ if (id==='startBtn') close(); });
  });

  // Expose for debugging
  window.pqToggleSidebar = toggle;
})();
