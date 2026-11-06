(function(){
  const BP = {
    PHONE_MAX: 1024,
    SMALL_PHONE_MAX: 820,
    SMALL_PHONE_MAX_H: 520,
    DESKTOP_MIN: 1280,
    FOLD_MIN: 680,
    FOLD_MAX: 1279
  };
  function isCoarse(){
    try { return window.matchMedia('(pointer: coarse)').matches; }
    catch(e){ return false; }
  }
  function getMode(){
    if (window.SSP_forceViewport) return String(window.SSP_forceViewport);

    const w = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    const h = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    const coarse = isCoarse();
    const ratio = w && h ? (w / h) : 1;

    /* Near-square foldables can wobble between portrait and landscape
       as browser chrome expands/collapses. Catch them first. */
    if (coarse && w >= BP.FOLD_MIN && w <= BP.FOLD_MAX && ratio >= 0.84 && ratio <= 1.18) {
      return 'fold-vertical';
    }
    if (coarse && h >= BP.FOLD_MIN && h <= BP.FOLD_MAX && ratio > 1.18 && ratio < 1.9) {
      return 'fold-horizontal';
    }

    const portrait = h > w;
    const landscape = w >= h;

    if (coarse && portrait && w <= BP.PHONE_MAX) return 'phone-portrait';
    if (coarse && landscape && w <= BP.SMALL_PHONE_MAX && h <= BP.SMALL_PHONE_MAX_H) return 'phone-landscape-tight';
    if (coarse && landscape && w <= BP.PHONE_MAX) return 'phone-landscape';
    if (w >= BP.DESKTOP_MIN) return 'desktop';
    return 'tablet';
  }
  function sync(){
    document.body.dataset.viewport = getMode();
  }
  window.SSP_getViewportMode = getMode;
  window.SSP_syncViewportMode = sync;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once:false });
  else sync();
  window.addEventListener('resize', function(){ sync(); sizeLeaderboardTableWrap(); }, { passive:true });
  window.addEventListener('orientationchange', function(){ setTimeout(function(){ sync(); sizeLeaderboardTableWrap(); }, 120); }, { passive:true });
  window.addEventListener('pageshow', function(){ setTimeout(sync, 60); }, { passive:true });
})();
