(() => {


  const REMEMBERED_USERNAME_COOKIE = "snapshift_remembered_username";
  function setRememberedUsername(username){
    const value = String(username || "").trim();
    if (!value) return;
    try {
      document.cookie = `${REMEMBERED_USERNAME_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60*60*24*365}; SameSite=Lax`;
    } catch(e){}
  }
  function getRememberedUsername(){
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + REMEMBERED_USERNAME_COOKIE.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : "";
    } catch(e){ return ""; }
  }
  function buildRememberedLoginHref(base = "login.php"){
    try {
      const url = new URL(base, window.location.href);
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (current && !/\/login\.php$/i.test(window.location.pathname)) {
        url.searchParams.set("return", current);
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
  function refreshRememberedLoginLinks(){
    try {
      document.querySelectorAll('a[href="login.php"], a[data-login-link], #authPill').forEach((el) => {
        if (!el) return;
        if (el.id === 'authPill'){
          const txt = String(el.textContent || '').toLowerCase();
          const ttl = String(el.title || '').toLowerCase();
          if (txt.includes('signed in') || ttl.includes('sign out')) return;
        }
        el.href = buildRememberedLoginHref('login.php');
      });
    } catch(e){}
  }


  // ===== PATCH: Disable localStorage for progress authority on home (server-only state) =====
  const STORAGE_DISABLED = true;
  function lsGet(k){ try{ return STORAGE_DISABLED ? null : localStorage.getItem(k); }catch(e){ return null; }; }
  function lsSet(k,v){ try{ if (!STORAGE_DISABLED) localStorage.setItem(k,String(v)); }catch(e){}; }
  function lsDel(k){ try{ if (!STORAGE_DISABLED) localStorage.removeItem(k); }catch(e){}; }
  function lsLen(){ try{ return STORAGE_DISABLED ? 0 : localStorage.length; }catch(e){ return 0; }; }
  function lsKey(i){ try{ return STORAGE_DISABLED ? null : localStorage.key(i); }catch(e){ return null; }; }

  


function applySupporterUi(supporter){
  const pill = document.getElementById("supporterPill");
  const sectionCard = document.getElementById("supporterStatusCard");
  const sectionBadge = document.getElementById("supporterSectionBadge");
  const sectionTitle = document.getElementById("supporterSectionTitle");
  const sectionSub = document.getElementById("supporterSectionSub");
  const active = !!(supporter && supporter.active);
  if (!active){
    if (pill){
      pill.hidden = true;
      pill.setAttribute("aria-hidden", "true");
    }
    if (sectionCard){
      sectionCard.hidden = true;
      sectionCard.setAttribute("aria-hidden", "true");
    }
    return;
  }
  const label = String((supporter && supporter.badgeLabel) || "Supporter").trim() || "Supporter";
  const plan = String((supporter && supporter.plan) || "monthly").trim() || "monthly";
  const nextBonusRaw = String((supporter && supporter.nextBonusAt) || "").trim();
  let nextBonusText = "Your next monthly supporter bonus will appear automatically.";
  if (nextBonusRaw){
    const dt = new Date(nextBonusRaw);
    if (!Number.isNaN(dt.getTime())){
      nextBonusText = `Next bonus: ${dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
    }
  }
  if (pill){
    pill.textContent = `★ ${label}`;
    pill.hidden = false;
    pill.removeAttribute("aria-hidden");
  }
  if (sectionCard){
    sectionCard.hidden = false;
    sectionCard.removeAttribute("aria-hidden");
  }
  if (sectionBadge) sectionBadge.textContent = `★ ${label}`;
  if (sectionTitle) sectionTitle.textContent = `${label} status: active`;
  if (sectionSub) sectionSub.textContent = `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan active. ${nextBonusText}`;
}

  async function initAuthPill(){
    try{
      const r = await fetch("/api/me.php", { cache:"no-store", credentials:"include" });
      const j = await r.json();
      const el = document.getElementById("authPill");
      if (!el) return;

      const nextFingerprint = (j && j.loggedIn)
        ? `user:${String(j.uid || j.username || j.userTag || "")}`
        : "guest";
      if (nextFingerprint !== homeAuthFingerprint){
        homeAuthFingerprint = nextFingerprint;
        meCache = j || null;
        bustCompletionStateCache();
      }

      if (j && j.loggedIn){
        completionAuthKnown = true;
        completionAuthLoggedIn = true;
        const u = j.username || "Account";
        setRememberedUsername(u);
        el.textContent = `Signed in: ${u}`;
        el.href = "#";
        el.onclick = (ev) => doLogout(ev);
        el.title = "Sign out";
        applySupporterUi(j.supporter || null);
        refreshPointsFromServer();
      } else {
        completionAuthKnown = true;
        completionAuthLoggedIn = false;
        meCache = null;
        el.textContent = "Sign in";
        el.href = buildRememberedLoginHref("login.php");
        el.onclick = null;
        el.title = "Sign in";
        applySupporterUi(null);
        pointsState = 0;
        refreshPointsFromServer();
      }
    } catch {}
  }


  function clearDailyLocalState(){
    // Daily local cleanup no longer needed on home because storage is not authoritative here.
    return;
  }

  function doLogout(ev){
    if (ev) ev.preventDefault();
    completionAuthKnown = true;
    completionAuthLoggedIn = false;
    meCache = null;
    bustCompletionStateCache();
    clearDailyLocalState();
    window.location.href = "logout.php";
  }
  // =========================
  // Cloud Sync removed from index
  // Index is now server-authoritative for account-aware Daily state.
  // Browser storage on home is UI-only and disabled for progress authority.
  // =========================

const GAME_URL = "game.html";
  const CATEGORY_URL = "category.html";
  const CATALOG_URL = "puzzles/index.json";
  const DAILY_CATALOG_URL = "daily_puzzles/index.json";
  const DAILY_HISTORY_URL = "daily_puzzles/history.json";
  const THEME_URL = "theme.json";

  const GLOBAL_POINTS_KEY = "tilepuzzle_points_global";
  // Server-authoritative points (stored in DB user_state.points)
  var pointsState = 0;

  function getPoints(){
    return pointsState;
  }

  async function refreshPointsFromServer(){
    try{
      const r = await fetch("/api/points_get.php", { credentials:"include", cache:"no-store" });
      const j = await r.json();
      pointsState = (j && j.loggedIn) ? (Number(j.points)||0) : 0;
      applySupporterUi((j && j.loggedIn && j.supporter) ? (j.supporter || null) : null);
    }catch(e){
      applySupporterUi(null);
      // keep existing pointsState if API fails
    }
    const pill = document.getElementById("pointsPill");
    if (pill) pill.textContent = `Points: ${getPoints()}`;
  }

  // Refresh points and completion badges when coming back from game or switching tabs
  window.addEventListener("focus", () => {
    refreshPointsFromServer().catch(()=>{});
    scheduleHomeProgressRefresh({ force:true, delays:[0, 450, 1400] });
  });
  window.addEventListener("pageshow", () => {
    refreshPointsFromServer().catch(()=>{});
    scheduleHomeProgressRefresh({ force:true, delays:[0, 450, 1400] });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshPointsFromServer().catch(()=>{});
      scheduleHomeProgressRefresh({ force:true, delays:[0, 450, 1400] });
    }
  });


  const LAST_CAT_KEY = "tilepuzzle_last_category";
  const LAST_PUZZLE_HINT_KEY = "tilepuzzle_last_puzzle_hint";

      const CATEGORIES = [
    { id:"animals", name:"Animals", desc:"Wildlife, pets, safari scenes.", tile:"category_tiles/animals.png" },
    { id:"architecture", name:"Architecture", desc:"Buildings, interiors, design.", tile:"category_tiles/architecture.png" },
    { id:"art", name:"Art", desc:"Paintings, illustrations, museums.", tile:"category_tiles/art.png" },
    { id:"cities", name:"Cities", desc:"Skylines, streets, downtown.", tile:"category_tiles/cities.png" },
    { id:"food", name:"Food", desc:"Meals, desserts, ingredients.", tile:"category_tiles/food.png" },
    { id:"fractals", name:"Fractals", desc:"Patterns, math art, abstractions.", tile:"category_tiles/fractals.png" },
    { id:"landscapes", name:"Landscapes", desc:"Fields, hills, scenic views.", tile:"category_tiles/landscapes.png" },
    { id:"marine", name:"Marine", desc:"Sea, boats, underwater worlds.", tile:"category_tiles/marine.png" },
    { id:"nature", name:"Nature", desc:"Daily featured picks.", tile:"category_tiles/nature.png" },
    { id:"scifi", name:"SciFi", desc:"Futuristic worlds, tech, aliens.", tile:"category_tiles/scifi.png" },
    { id:"space", name:"Space", desc:"Planets, stars, nebulae.", tile:"category_tiles/space.png" },
    { id:"vehicles", name:"Vehicles", desc:"Cars, bikes, machines.", tile:"category_tiles/vehicles.png" },
    
  ];

  let PUZZLE_CATALOG = {};
  let MANIFEST_OK = false;
  let DAILY_CATALOG = {};
  let DAILY_MANIFEST_OK = false;

  const grid = document.getElementById("grid");
  const latestRail = document.getElementById("latestRail");
  const latestSub = document.getElementById("latestSub");
  const pointsPill = document.getElementById("pointsPill");
  const lastPill = document.getElementById("lastPill"); // optional (may not exist)

  const homeUnlockModal = document.getElementById("homeUnlockModal");
  const homeUnlockPuzzleName = document.getElementById("homeUnlockPuzzleName");
  const homeUnlockCostValue = document.getElementById("homeUnlockCostValue");
  const homeUnlockPointsValue = document.getElementById("homeUnlockPointsValue");
  const homeUnlockAfterValue = document.getElementById("homeUnlockAfterValue");
  const homeUnlockMsg = document.getElementById("homeUnlockMsg");
  const homeUnlockCancelBtn = document.getElementById("homeUnlockCancelBtn");
  const homeUnlockConfirmBtn = document.getElementById("homeUnlockConfirmBtn");

  const continueBtn = document.getElementById("continueBtn");
  const reloadBtn = document.getElementById("reloadBtn");
  const catalogState = document.getElementById("catalogState");


  function withCacheBust(url, bust){
    const s = String(url || '').trim();
    if (!s) return '';
    return s + (s.includes('?') ? '&' : '?') + 't=' + bust;
  }

  function applyHomeShopBanner(t, bust){
    const wrap = document.getElementById('shopBannerImage');
    const link = document.getElementById('shopBannerImageLink');
    const img = document.getElementById('shopBannerImageImg');
    if (!wrap || !link || !img) return;

    const enabled = (t.shopBannerEnabled !== false);
    const src = String(t.shopBannerImage ?? '/98bannerads12/Banner1.png').trim();
    const href = String(t.shopBannerHref ?? '/shop.html').trim() || '/shop.html';
    const alt = String(t.shopBannerAlt ?? 'Snapshift Swag Shop banner').trim() || 'Snapshift Swag Shop banner';

    if (!enabled || !src) {
      wrap.hidden = true;
      return;
    }

    wrap.hidden = false;
    link.href = href;
    link.setAttribute('aria-label', alt);
    img.alt = alt;
    img.src = withCacheBust(src, bust);
  }

function applyAdminThemeTokens(t){
  if (window.SnapshiftSiteTheme && typeof window.SnapshiftSiteTheme.applyTokens === "function"){
    window.SnapshiftSiteTheme.applyTokens(t);
    return;
  }
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
  }catch(e){}
}

  async function applyThemeFromJson(){
    if (window.SnapshiftSiteTheme && typeof window.SnapshiftSiteTheme.load === "function"){
      try{
        await window.SnapshiftSiteTheme.load({
          url: THEME_URL,
          frogSelector: "#frogImg",
          onTheme: applyHomeShopBanner,
        });
      } catch (e) {
        window.SnapshiftSiteTheme.applyTokens({});
        console.warn("Theme load failed:", e);
      }
      return;
    }
    try{
      const r = await fetch(THEME_URL + "?t=" + Date.now(), { cache:"no-store" });
      if (!r.ok) throw new Error("theme.json missing");
      const t = await r.json();
      applyAdminThemeTokens(t);

      const enabled = (t.themeEnabled !== false);
      const alpha = Math.max(0, Math.min(1, Number(t.themeAlpha ?? 0.85)));
      const bg = String(t.backgroundImage ?? "jungle_background.png");
      const frogSrc = String(t.frogImage ?? "red_eyed_frog.png");

      const bust = Date.now();
      document.body.classList.toggle("theme-on", enabled);
      document.documentElement.style.setProperty("--themeAlpha", String(alpha));
      document.documentElement.style.setProperty("--bgUrl", `url("${bg}?t=${bust}")`);

      const frog = document.getElementById("frogImg");
      if (frog) frog.src = `${frogSrc}?t=${bust}`;
    } catch (e) {
      applyAdminThemeTokens({});
      console.warn("Theme load failed:", e);
    }
  }

  function safeList(catId){
    const v = PUZZLE_CATALOG[catId];
    return Array.isArray(v) ? v : [];
  }
  function safeDailyList(catId){
    const v = DAILY_CATALOG[catId];
    return Array.isArray(v) ? v : [];
  }

  
  
  function pickThumb(it){
    // prefer server-provided thumb if present, else derive from src
    if (it && it.thumb) return it.thumb;
    return thumbFromSrc(it && it.src ? it.src : "");
  }
function decodeMaybeTwice(value){
    let v = String(value || "");
    try { v = decodeURIComponent(v); } catch(e) {}
    if (/%[0-9A-Fa-f]{2}/.test(v)){
      try { v = decodeURIComponent(v); } catch(e) {}
    }
    return v;
  }

function normalizeCatId(catId){
    const s = String(catId || "").trim().toLowerCase();
    const aliases = {
      city: "cities",
      landscape: "landscapes"
    };
    return aliases[s] || s;
  }

  function categoryFromSrc(src){
    const m = String(src || "").match(/^puzzles\/([^\/]+)\//i);
    return m ? normalizeCatId(m[1]) : null;
  }

  function openCategory(catId){
    lsSet(LAST_CAT_KEY, catId);
    window.location.href = `${CATEGORY_URL}?cat=${encodeURIComponent(catId)}`;
  }


  let homeUnlockedMap = {};

  async function fetchHomeUnlockedMap(){
    try{
      const r = await fetch('/api/unlocked_get.php', { credentials:'include', cache:'no-store' });
      const j = await r.json().catch(() => null);
      if (j && j.ok && j.loggedIn && j.unlocked && typeof j.unlocked === 'object') {
        homeUnlockedMap = j.unlocked || {};
        return homeUnlockedMap;
      }
    }catch(e){}
    homeUnlockedMap = {};
    return homeUnlockedMap;
  }

  function buildHomeUnlockRecord(raw, list){
    const items = Array.isArray(list) ? list : [];
    const incoming = (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.unlockedSrcs))
      ? raw.unlockedSrcs : [];
    const out = [];
    const seen = new Set();
    incoming.forEach((src) => {
      const key = normalizePuzzleSrcIdentity(src);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(key);
    });
    const firstSrc = normalizePuzzleSrcIdentity(items[0] && items[0].src);
    if (firstSrc && !seen.has(firstSrc)) {
      seen.add(firstSrc);
      out.unshift(firstSrc);
    }
    return new Set(out.filter(Boolean));
  }

  function getHomeCategoryUnlockSet(catId){
    const cleanCat = normalizeCatId(catId);
    return buildHomeUnlockRecord(homeUnlockedMap && homeUnlockedMap[cleanCat], safeList(cleanCat));
  }

  function isHomePuzzleUnlocked(catId, puzzleSrc){
    const set = getHomeCategoryUnlockSet(catId);
    const src = normalizePuzzleSrcIdentity(puzzleSrc);
    return !!src && set.has(src);
  }

  function getHomeNextUnlockInfo(catId){
    const cleanCat = normalizeCatId(catId);
    const list = safeList(cleanCat);
    const set = getHomeCategoryUnlockSet(cleanCat);
    for (let i = 0; i < list.length; i++){
      const src = normalizePuzzleSrcIdentity(list[i] && list[i].src);
      if (src && !set.has(src)) return { idx: i, src, puzzle: list[i] };
    }
    return { idx: -1, src: "", puzzle: null };
  }

  function unlockCostFor(nextIdx){
    return Math.max(0, Math.floor(60 + (25 * Math.max(0, Number(nextIdx) || 0))));
  }

  async function addHomeServerPoints(delta){
    try{
      const r = await fetch("/api/points_set.php", {
        method:"POST",
        credentials:"include",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ delta: Number(delta) || 0 })
      });
      const j = await r.json().catch(() => null);
      if (j && j.ok && j.loggedIn) {
        pointsState = Math.max(0, Number(j.points) || 0);
        const pill = document.getElementById("pointsPill");
        if (pill) pill.textContent = `Points: ${pointsState}`;
        return pointsState;
      }
    }catch(e){}
    return null;
  }

  async function pushHomeUnlockedMapToServer(unlockedMap){
    try{
      const r = await fetch("/api/unlocked_set.php", {
        method:"POST",
        credentials:"include",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ unlocked: unlockedMap || {} })
      });
      const j = await r.json().catch(() => null);
      if (j && j.ok && j.loggedIn && j.unlocked && typeof j.unlocked === "object") {
        homeUnlockedMap = j.unlocked || {};
        return homeUnlockedMap;
      }
    }catch(e){}
    return null;
  }

  let pendingHomeUnlock = null;

  function closeHomeUnlockModal(){
    pendingHomeUnlock = null;
    if (!homeUnlockModal) return;
    homeUnlockModal.classList.remove("show");
    homeUnlockModal.setAttribute("aria-hidden", "true");
    if (homeUnlockMsg){ homeUnlockMsg.textContent = ""; homeUnlockMsg.className = "homeUnlockMsg"; }
    if (homeUnlockConfirmBtn) homeUnlockConfirmBtn.disabled = false;
  }

  async function openHomeUnlockModal(item){
    if (!homeUnlockModal) return;
    const cleanSrc = decodeMaybeTwice(String(item && item.src ? item.src : ""));
    const catId = normalizeCatId(categoryFromSrc(cleanSrc) || (item && item.catId) || "animals");
    const srcId = normalizePuzzleSrcIdentity(cleanSrc);
    if (!srcId) return;

    const ptsResp = await fetch("/api/points_get.php", { credentials:"include", cache:"no-store" }).then(r => r.json()).catch(() => null);
    if (!(ptsResp && ptsResp.loggedIn)) {
      alert("Please sign in to unlock puzzles with points.");
      window.location.href = buildRememberedLoginHref("login.php");
      return;
    }
    pointsState = Math.max(0, Number(ptsResp.points) || 0);
    if (pointsPill) pointsPill.textContent = `Points: ${pointsState}`;

    await fetchHomeUnlockedMap();
    const nextInfo = getHomeNextUnlockInfo(catId);
    if (!nextInfo.src) {
      await applyLatestCompletionBadges({ force:true });
    scheduleLatestBadgeRefresh({ force:true, delays:[250, 900, 1800] });
      scheduleLatestBadgeRefresh({ force:true, delays:[250, 900, 1800] });
      return;
    }
    if (srcId !== nextInfo.src){
      alert(`Unlock puzzle #${nextInfo.idx + 1} in ${catId} first.`);
      return;
    }

    const cost = unlockCostFor(nextInfo.idx);
    const available = Math.max(0, Number(pointsState) || 0);
    pendingHomeUnlock = {
      item: item || null,
      catId,
      srcId,
      idx: nextInfo.idx,
      cost
    };

    if (homeUnlockPuzzleName) homeUnlockPuzzleName.textContent = String(item && item.name || nextInfo.puzzle && nextInfo.puzzle.name || `Puzzle #${nextInfo.idx + 1}`);
    if (homeUnlockCostValue) homeUnlockCostValue.textContent = `${cost} points`;
    if (homeUnlockPointsValue) homeUnlockPointsValue.textContent = `${available}`;
    if (homeUnlockAfterValue) homeUnlockAfterValue.textContent = `${Math.max(0, available - cost)} left`;
    if (homeUnlockMsg) {
      homeUnlockMsg.textContent = available < cost
        ? `You need ${cost - available} more points to unlock this puzzle.`
        : "Unlocking opens this puzzle immediately in the category list.";
      homeUnlockMsg.className = `homeUnlockMsg ${available < cost ? 'error' : 'ok'}`;
    }
    if (homeUnlockConfirmBtn) homeUnlockConfirmBtn.disabled = available < cost;
    homeUnlockModal.classList.add("show");
    homeUnlockModal.setAttribute("aria-hidden", "false");
  }

  async function confirmHomeUnlock(){
    if (!pendingHomeUnlock) return;
    const pending = pendingHomeUnlock;
    const cost = Math.max(0, Number(pending.cost) || 0);
    if (homeUnlockConfirmBtn) homeUnlockConfirmBtn.disabled = true;
    if (homeUnlockMsg) {
      homeUnlockMsg.textContent = "Unlocking…";
      homeUnlockMsg.className = "homeUnlockMsg";
    }

    const ptsResp = await fetch("/api/points_get.php", { credentials:"include", cache:"no-store" }).then(r => r.json()).catch(() => null);
    const available = ptsResp && ptsResp.loggedIn ? Math.max(0, Number(ptsResp.points) || 0) : 0;
    pointsState = available;
    if (pointsPill) pointsPill.textContent = `Points: ${pointsState}`;
    if (homeUnlockPointsValue) homeUnlockPointsValue.textContent = `${available}`;
    if (homeUnlockAfterValue) homeUnlockAfterValue.textContent = `${Math.max(0, available - cost)} left`;

    if (available < cost){
      if (homeUnlockMsg) {
        homeUnlockMsg.textContent = `You need ${cost - available} more points to unlock this puzzle.`;
        homeUnlockMsg.className = "homeUnlockMsg error";
      }
      if (homeUnlockConfirmBtn) homeUnlockConfirmBtn.disabled = false;
      return;
    }

    const newTotal = await addHomeServerPoints(-cost);
    if (typeof newTotal !== "number"){
      if (homeUnlockMsg) {
        homeUnlockMsg.textContent = "Could not spend points right now. Please try again.";
        homeUnlockMsg.className = "homeUnlockMsg error";
      }
      if (homeUnlockConfirmBtn) homeUnlockConfirmBtn.disabled = false;
      return;
    }

    const currentSet = getHomeCategoryUnlockSet(pending.catId);
    currentSet.add(pending.srcId);
    const nextRecord = { version: 2, unlockedSrcs: Array.from(currentSet), updatedAt: new Date().toISOString() };
    homeUnlockedMap[pending.catId] = nextRecord;
    const pushed = await pushHomeUnlockedMapToServer(homeUnlockedMap);
    if (pushed && typeof pushed === "object") homeUnlockedMap = pushed;
    else homeUnlockedMap[pending.catId] = nextRecord;

    if (pointsPill) pointsPill.textContent = `Points: ${Math.max(0, Number(newTotal) || 0)}`;
    refreshLatestLockDecorations();
    await applyLatestCompletionBadges({ force:true });
    scheduleLatestBadgeRefresh({ force:true, delays:[250, 900, 1800] });
    if (homeUnlockMsg) {
      homeUnlockMsg.textContent = "Puzzle unlocked.";
      homeUnlockMsg.className = "homeUnlockMsg ok";
    }
    setTimeout(() => closeHomeUnlockModal(), 280);
  }

  async function clickLatestLock(item){
    return openHomeUnlockModal(item);
  }

  if (homeUnlockCancelBtn) {
    homeUnlockCancelBtn.addEventListener("click", () => closeHomeUnlockModal());
  }
  if (homeUnlockConfirmBtn) {
    homeUnlockConfirmBtn.addEventListener("click", () => { confirmHomeUnlock().catch(() => {}); });
  }
  if (homeUnlockModal) {
    homeUnlockModal.addEventListener("click", (ev) => {
      if (ev.target === homeUnlockModal) closeHomeUnlockModal();
    });
  }
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && homeUnlockModal && homeUnlockModal.classList.contains("show")) {
      closeHomeUnlockModal();
    }
  });

  function refreshLatestLockDecorations(){
    const cards = Array.from(document.querySelectorAll('.card[data-cat-id][data-puzzle-src]'));
    cards.forEach((card) => {
      const catId = normalizeCatId(card.dataset.catId || '');
      const puzzleSrc = String(card.dataset.puzzleSrc || '');
      const locked = !isHomePuzzleUnlocked(catId, puzzleSrc);
      card.dataset.locked = locked ? '1' : '0';

      const meta = card.querySelector('.meta');
      if (meta) {
        const spans = meta.querySelectorAll('span');
        if (spans[1]) spans[1].textContent = locked ? 'Locked' : 'Play →';
      }

      const lockBtn = card.querySelector('.latestLockBtn');
      if (lockBtn){
        if (!locked){
          lockBtn.className = 'latestLockBtn';
          lockBtn.style.display = 'none';
          lockBtn.disabled = true;
          lockBtn.title = '';
        } else {
          const nextInfo = getHomeNextUnlockInfo(catId);
          const srcId = normalizePuzzleSrcIdentity(puzzleSrc);
          const actionable = !!srcId && !!nextInfo.src && srcId === nextInfo.src;
          lockBtn.className = `latestLockBtn show ${actionable ? 'isActionable' : 'isPassive'}`;
          lockBtn.style.display = 'inline-flex';
          lockBtn.disabled = !actionable;
          lockBtn.title = actionable ? `Click to unlock with ${unlockCostFor(nextInfo.idx)} points` : 'Unlock previous puzzles first';
        }
      }
    });
  }

  function openLatestPuzzle(item){
    const cleanSrc = decodeMaybeTwice(String(item && item.src ? item.src : ""));
    const resolvedCatId = normalizeCatId(categoryFromSrc(cleanSrc) || (item && item.catId) || "animals");
    const locked = !isHomePuzzleUnlocked(resolvedCatId, cleanSrc);

    lsSet(LAST_CAT_KEY, resolvedCatId);
    lsSet(LAST_PUZZLE_HINT_KEY, JSON.stringify({
      catId: resolvedCatId,
      src: cleanSrc,
      name: item && item.name ? String(item.name) : "",
      updated: Number(item && item.updated ? item.updated : 0) || 0
    }));

    const puzzleName = (item && item.name) ? String(item.name) : "";
    if (locked) {
      window.location.href = `${CATEGORY_URL}?cat=${encodeURIComponent(resolvedCatId)}`;
      return;
    }
    window.location.href = `${GAME_URL}#cat=${encodeURIComponent(resolvedCatId)}&src=${encodeURIComponent(cleanSrc)}&puzzle=${encodeURIComponent(puzzleName)}`;
  }


  async function fetchLatestProgressForContinue(){
    try{
      const r = await fetch("/api/state_get.php", { credentials:"include", cache:"no-store" });
      const j = await r.json().catch(() => null);
      if (j && j.ok && j.loggedIn && j.progress && typeof j.progress === "object") {
        const progress = j.progress;
        const completedRaw = progress.completed;
        const completed = completedRaw === true || completedRaw === 1 || completedRaw === "1" || String(completedRaw || "").toLowerCase() === "true";
        if (!completed) return progress;
      }
    }catch(e){}
    return null;
  }

  function getContinueDifficultyLabel(diffKey){
    const key = String(diffKey || "").toLowerCase();
    if (key === "hard") return "Hard";
    if (key === "medium") return "Medium";
    return "Easy";
  }

  function formatContinueRelativeTime(value){
    try{
      if (!value) return "";
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return "";
      const diffMs = Date.now() - dt.getTime();
      if (!Number.isFinite(diffMs)) return "";
      const mins = Math.max(0, Math.round(diffMs / 60000));
      if (mins < 1) return "Saved";
      if (mins < 60) return `saved ${mins} min ago`;
      const hours = Math.round(mins / 60);
      if (hours < 24) return `saved ${hours} hr ago`;
      const days = Math.round(hours / 24);
      if (days < 7) return `saved ${days} day${days === 1 ? "" : "s"} ago`;
      return "saved " + dt.toLocaleDateString();
    }catch(e){
      return "";
    }
  }

  function ensureContinueButtonLayout(){
    if (!continueBtn) return null;
    let wrap = continueBtn.querySelector(".continueLabelWrap");
    let main = continueBtn.querySelector(".continueMain");
    let sub = continueBtn.querySelector(".continueSub");
    if (!wrap || !main || !sub){
      continueBtn.textContent = "";
      wrap = document.createElement("span");
      wrap.className = "continueLabelWrap";
      main = document.createElement("span");
      main.className = "continueMain";
      sub = document.createElement("span");
      sub.className = "continueSub";
      wrap.appendChild(main);
      wrap.appendChild(sub);
      continueBtn.appendChild(wrap);
    }
    return { wrap, main, sub };
  }

  function setContinueButtonDisplay(mainText, subText = "", titleText = ""){
    if (!continueBtn) return;
    const nodes = ensureContinueButtonLayout();
    if (!nodes) return;
    nodes.main.textContent = String(mainText || "All Caught Up");
    nodes.sub.textContent = String(subText || "");
    continueBtn.classList.toggle("hasMeta", !!subText);
    continueBtn.title = String(titleText || (subText || mainText || "All Caught Up"));
  }

  function openGameResumeLatest(){
    window.location.href = `${GAME_URL}#resume=latest`;
  }

  function openLastPuzzleHint(){
    try{
      const raw = lsGet(LAST_PUZZLE_HINT_KEY);
      if (!raw) return false;
      const hint = JSON.parse(raw);
      const catId = normalizeCatId(String(hint && hint.catId ? hint.catId : ""));
      const src = decodeMaybeTwice(String(hint && hint.src ? hint.src : ""));
      const puzzleName = String(hint && hint.name ? hint.name : "");
      if (!catId || !src) return false;
      lsSet(LAST_CAT_KEY, catId);
      window.location.href = `${GAME_URL}#cat=${encodeURIComponent(catId)}&src=${encodeURIComponent(src)}&puzzle=${encodeURIComponent(puzzleName)}`;
      return true;
    }catch(e){
      return false;
    }
  }

  async function refreshContinueButtonState(){
    if (!continueBtn) return;
    try{
      const progress = await fetchLatestProgressForContinue();
      if (progress && progress.categoryId) {
        const puzzleName = String(progress.puzzleName || "Saved puzzle").trim();
        const diffLabel = getContinueDifficultyLabel(progress.diffKey);
        const whenLabel = formatContinueRelativeTime(progress.updatedAt || progress.savedAt);
        const main = progress.isDaily ? "Resume Daily" : `Continue ${diffLabel}`;
        const sub = [puzzleName, whenLabel].filter(Boolean).join(" · ");
        setContinueButtonDisplay(main, sub, puzzleName || "Continue your unfinished puzzle");
        return;
      }
    }catch(e){}
    setContinueButtonDisplay("All Caught Up", "", "You have no unfinished puzzle to resume");
  }

  const COMPLETION_DIFF_ORDER = ["hard", "medium", "easy"];
  let completionAuthKnown = false;
  let completionAuthLoggedIn = false;
  const latestCompletionCache = new Map();
  let latestCompletionSummaryMap = null;
  let latestCompletionSummaryAt = 0;
  let latestBadgeRunId = 0;
  let latestSummaryFetchPromise = null;

  function bustCompletionStateCache(){
    try{ latestCompletionCache.clear(); }catch(e){}
    latestCompletionSummaryMap = null;
    latestCompletionSummaryAt = 0;
  }

  function completionSummaryKey(categoryId, puzzleIdx, puzzleSrc){
    const cleanSrc = normalizePuzzleSrcIdentity(puzzleSrc);
    if (cleanSrc) return `src:${cleanSrc}`;
    return `idx:${normalizeCatId(categoryId)}:${Math.max(0, Number(puzzleIdx) || 0)}`;
  }

  async function fetchLatestCompletionSummary(force = false){
    const now = Date.now();
    if (!force && latestCompletionSummaryMap && (now - latestCompletionSummaryAt) < 5000) return latestCompletionSummaryMap;
    if (!force && latestSummaryFetchPromise) return latestSummaryFetchPromise;
    latestSummaryFetchPromise = (async () => {
      const loggedIn = await ensureCompletionAuth(force);
      if (!loggedIn) {
        latestCompletionSummaryMap = new Map();
        latestCompletionSummaryAt = Date.now();
        return latestCompletionSummaryMap;
      }
      try{
        const r = await fetch(`/api/progress_summary_get.php?all=1&_=${Date.now()}`, { credentials:'include', cache:'no-store' });
        const j = await r.json().catch(() => null);
        const map = new Map();
        const byKey = j && j.ok && j.loggedIn && j.byKey && typeof j.byKey === 'object' ? j.byKey : null;
        if (byKey) {
          Object.keys(byKey).forEach((key) => { if (byKey[key]) map.set(key, byKey[key]); });
        }
        latestCompletionSummaryMap = map;
        latestCompletionSummaryAt = Date.now();
        return map;
      }catch(e){
        if (latestCompletionSummaryMap) return latestCompletionSummaryMap;
        const empty = new Map();
        latestCompletionSummaryMap = empty;
        latestCompletionSummaryAt = Date.now();
        return empty;
      } finally {
        latestSummaryFetchPromise = null;
      }
    })();
    return latestSummaryFetchPromise;
  }

  function normalizePuzzleSrcIdentity(src){
    try{
      let v = String(src || "").trim();
      if (!v) return "";
      try{ v = decodeURIComponent(v); }catch(e){}
      v = v.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
      return v.toLowerCase();
    }catch(e){
      return "";
    }
  }

  function buildProgressKeyFromMeta(meta = {}){
    const dailyKey = String(meta.dailyKey || "").trim();
    const diff = String(meta.diffKey || "easy").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "easy";
    if (dailyKey) return `daily:${dailyKey}:${diff}`;
    const cat = String(meta.categoryId || meta.catId || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "unknown";
    const srcId = normalizePuzzleSrcIdentity(meta.puzzleSrc || meta.src || "");
    if (srcId) return `puzzle:${cat}:src:${srcId}:${diff}`;
    const idx = Math.max(0, Number(meta.puzzleIdx ?? meta.index ?? 0) || 0);
    return `puzzle:${cat}:${idx}:${diff}`;
  }

  function completionCacheKey(categoryId, puzzleIdx, puzzleSrc = ""){
    const cat = String(categoryId || "").trim().toLowerCase();
    const src = normalizePuzzleSrcIdentity(puzzleSrc);
    return src ? `${cat}::src::${src}` : `${cat}::idx::${Math.max(0, Number(puzzleIdx) || 0)}`;
  }

  async function ensureCompletionAuth(forceRefresh = false){
    if (!forceRefresh && completionAuthKnown) return completionAuthLoggedIn;
    completionAuthKnown = false;
    completionAuthLoggedIn = false;
    try{
      const bust = `_=${Date.now()}`;
      const r = await fetch(`/api/me.php?${bust}`, { cache:"no-store", credentials:"include" });
      const j = await r.json().catch(() => null);
      completionAuthLoggedIn = !!(j && j.loggedIn);
      completionAuthKnown = true;
      const nextFingerprint = completionAuthLoggedIn
        ? `user:${String(j.uid || j.username || j.userTag || "")}`
        : "guest";
      if (nextFingerprint !== homeAuthFingerprint){
        homeAuthFingerprint = nextFingerprint;
        meCache = j || null;
        bustCompletionStateCache();
      }
    }catch(e){
      completionAuthKnown = true;
      completionAuthLoggedIn = false;
      if (homeAuthFingerprint !== "guest"){
        homeAuthFingerprint = "guest";
        meCache = null;
        bustCompletionStateCache();
      }
    }
    return completionAuthLoggedIn;
  }

  async function fetchCompletedStatusForPuzzle(categoryId, puzzleIdx, puzzleSrc = "", opts = {}){
    const cacheKey = completionCacheKey(categoryId, puzzleIdx, puzzleSrc);
    if (!opts.force && latestCompletionCache.has(cacheKey)) return latestCompletionCache.get(cacheKey);

    const loggedIn = await ensureCompletionAuth(!!opts.force);
    if (!loggedIn) {
      latestCompletionCache.set(cacheKey, null);
      return null;
    }

    const cleanCat = normalizeCatId(categoryId);
    const idx = Math.max(0, Number(puzzleIdx) || 0);
    const cleanSrc = normalizePuzzleSrcIdentity(puzzleSrc);

    try{
      const summaryMap = await fetchLatestCompletionSummary(!!opts.force);
      const key = completionSummaryKey(cleanCat, idx, cleanSrc);
      const summary = summaryMap && summaryMap.get(key);
      if (summary && summary.completed) {
        const result = {
          completed: true,
          diffKey: String(summary.diffKey || 'easy'),
          rating: getDisplayRatingFromProgress(summary)
        };
        latestCompletionCache.set(cacheKey, result);
        return result;
      }
    }catch(e){}

    let best = null;
    for (const diffKey of COMPLETION_DIFF_ORDER){
      try{
        const qs = cleanSrc
          ? new URLSearchParams({ category_id: cleanCat, puzzle_src: cleanSrc, diff_key: diffKey })
          : new URLSearchParams({ progress_key: buildProgressKeyFromMeta({ categoryId: cleanCat, puzzleIdx: idx, puzzleSrc: cleanSrc, diffKey }) });
        qs.set("_", String(Date.now()) + "-" + diffKey);
        const r = await fetch(`/api/state_get.php?${qs.toString()}`, { credentials:"include", cache:"no-store" });
        const j = await r.json().catch(() => null);
        const progress = (j && j.ok && j.loggedIn && j.progress && typeof j.progress === "object") ? j.progress : null;
        if (progress && !progress.isDaily && !!progress.completed) {
          const result = {
            completed:true,
            diffKey:String(progress.diffKey || diffKey || "easy"),
            rating: getDisplayRatingFromProgress(progress)
          };
          if (!best || completionAchievementRank(result) > completionAchievementRank(best)) best = result;
        }
      }catch(e){}
    }

    latestCompletionCache.set(cacheKey, best || null);
    return best || null;
  }

  function getDiffLabelForBadge(diffKey){
    const key = String(diffKey || "easy").toLowerCase();
    if (key === "hard") return "Hard";
    if (key === "medium") return "Medium";
    return "Easy";
  }

  function shapeForBadgeRating(progress){
    const diff = String(progress && progress.diffKey || "easy").toLowerCase();
    const fallback = diff === "hard"
      ? { rows:8, cols:12 }
      : (diff === "medium" ? { rows:6, cols:9 } : { rows:4, cols:6 });
    const rows = Math.max(1, Number(progress && progress.rows) || fallback.rows);
    const cols = Math.max(1, Number(progress && progress.cols) || fallback.cols);
    return { rows, cols, total: rows * cols };
  }

  function getDisplayRatingFromProgress(progress){
    if (!progress || typeof progress !== "object") return null;
    const medalRaw = String(progress.medal || progress.medalKey || "").trim().toLowerCase();
    let stars = Math.max(0, Math.floor(Number(progress.stars) || 0));
    let label = "";
    let key = "";

    if (medalRaw === "gold" || medalRaw === "3" || medalRaw === "three") { stars = Math.max(stars, 3); label = "Gold"; key = "gold"; }
    else if (medalRaw === "silver" || medalRaw === "2" || medalRaw === "two") { stars = Math.max(stars, 2); label = "Silver"; key = "silver"; }
    else if (medalRaw === "bronze" || medalRaw === "1" || medalRaw === "one") { stars = Math.max(stars, 1); label = "Bronze"; key = "bronze"; }

    if (!label && stars >= 3) { stars = 3; label = "Gold"; key = "gold"; }
    else if (!label && stars === 2) { label = "Silver"; key = "silver"; }
    else if (!label && stars === 1) { label = "Bronze"; key = "bronze"; }

    const scorePct = Math.max(0, Math.floor(Number(progress.scorePct ?? progress.score_pct) || 0));
    if (label) {
      return {
        stars,
        label,
        key,
        scorePct,
        moveEffPct: Math.max(0, Math.floor(Number(progress.moveEffPct ?? progress.move_eff_pct) || 0)),
        speedEffPct: Math.max(0, Math.floor(Number(progress.speedEffPct ?? progress.speed_eff_pct) || 0)),
        starsText: "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars))
      };
    }
    return computePuzzleRating(progress);
  }

  function computePuzzleRating(progress){
    if (!progress || typeof progress !== "object") return null;
    const shape = shapeForBadgeRating(progress);
    const diff = String(progress.diffKey || "easy").toLowerCase();
    const total = Math.max(1, shape.total);
    const moves = Math.max(total, Math.floor(Number(progress.movesMade) || total));
    const elapsedMs = Math.max(1000, Math.floor(Number(progress.elapsedMs) || 0) || (total * 7000));
    const parPerTileMs = diff === "hard" ? 8000 : (diff === "medium" ? 6800 : 5600);
    const moveEff = Math.min(1, total / moves);
    const speedEff = Math.min(1, (total * parPerTileMs) / elapsedMs);
    const score = Math.max(0, Math.min(1, (moveEff * 0.72) + (speedEff * 0.28)));
    let stars = 1, label = "Bronze", key = "bronze";
    if (score >= 0.90) {
      stars = 3; label = "Gold"; key = "gold";
    } else if (score >= 0.76) {
      stars = 2; label = "Silver"; key = "silver";
    }
    return {
      stars,
      label,
      key,
      scorePct: Math.round(score * 100),
      moveEffPct: Math.round(moveEff * 100),
      speedEffPct: Math.round(speedEff * 100),
      starsText: "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars))
    };
  }

  function completionAchievementRank(status){
    if (!status || !status.completed) return -1;
    const diffWeight = status.diffKey === "hard" ? 30 : (status.diffKey === "medium" ? 20 : 10);
    const starsWeight = status.rating ? Number(status.rating.stars || 0) : 0;
    return diffWeight + starsWeight;
  }

  function clearLatestCompletionBadges(){
    document.querySelectorAll(".statusBadges[data-role='completion']").forEach(el => { el.replaceChildren(); });
  }

  function scheduleLatestBadgeRefresh(opts = {}){
    const delays = Array.isArray(opts.delays) && opts.delays.length ? opts.delays : [0, 300, 900, 1800];
    delays.forEach((delay, idx) => {
      setTimeout(() => {
        if (opts.force && idx === 0) bustCompletionStateCache();
        applyLatestCompletionBadges({ force: !!opts.force }).catch(()=>{});
      }, Math.max(0, Number(delay) || 0));
    });
  }

  async function applyLatestCompletionBadges(opts = {}){
    const cards = Array.from(document.querySelectorAll(".card[data-cat-id][data-puzzle-idx]"));
    if (!cards.length) return;

    const runId = ++latestBadgeRunId;
    await fetchHomeUnlockedMap();
    refreshLatestLockDecorations();
    const loggedIn = await ensureCompletionAuth(!!opts.force);
    if (runId !== latestBadgeRunId) return;
    if (!loggedIn) {
      clearLatestCompletionBadges();
      refreshLatestLockDecorations();
      return;
    }

    await fetchLatestCompletionSummary(!!opts.force);
    await Promise.all(cards.map(async (card) => {
      const badgeHost = card.querySelector(".statusBadges[data-role='completion']");
      if (!badgeHost) return;
      const catId = normalizeCatId(card.dataset.catId || "");
      const puzzleIdx = Math.max(0, Number(card.dataset.puzzleIdx) || 0);
      const puzzleSrc = String(card.dataset.puzzleSrc || "");
      const locked = !isHomePuzzleUnlocked(catId, puzzleSrc);
      const nodes = [];
      if (locked) {
        if (runId === latestBadgeRunId) badgeHost.replaceChildren(...nodes);
        return;
      }
      const status = await fetchCompletedStatusForPuzzle(catId, puzzleIdx, puzzleSrc, opts);
      if (runId !== latestBadgeRunId) return;
      if (status && status.completed) {
        const badge = document.createElement("span");
        badge.className = "statusBadge";
        badge.title = `Completed (${getDiffLabelForBadge(status.diffKey)})`;
        badge.innerHTML = `<span>Completed</span><span class="statusDiff">${getDiffLabelForBadge(status.diffKey)}</span>`;
        nodes.push(badge);
        if (status.rating) {
          const medalBadge = document.createElement("span");
          medalBadge.className = `statusBadge isMedal is${status.rating.label}`;
          medalBadge.title = `${status.rating.label} • ${status.rating.stars} star${status.rating.stars === 1 ? "" : "s"} • ${status.rating.scorePct}% performance`;
          medalBadge.innerHTML = `<span class="statusStars">${status.rating.starsText}</span><span class="statusDiff">${status.rating.label}</span>`;
          nodes.push(medalBadge);
        }
      }
      if (runId === latestBadgeRunId) badgeHost.replaceChildren(...nodes);
    }));
  }

  window.forceHomeBadgeRefresh = () => scheduleLatestBadgeRefresh({ force:true, delays:[0, 300, 900, 1800] });

  function scheduleHomeProgressRefresh(opts = {}){
    try{ homeProgressRefreshTimers.forEach(id => clearTimeout(id)); }catch(e){}
    homeProgressRefreshTimers = [];
    const delays = Array.isArray(opts.delays) && opts.delays.length ? opts.delays : [0, 350, 1200];
    delays.forEach((delay, idx) => {
      const id = setTimeout(() => {
        refreshHomeProgressDecorations({ force: !!opts.force && idx === 0 }).catch(()=>{});
      }, Math.max(0, Number(delay) || 0));
      homeProgressRefreshTimers.push(id);
    });
  }

  async function refreshHomeProgressDecorations(opts = {}){
    const force = !!opts.force;
    if (force) bustCompletionStateCache();
    await ensureCompletionAuth(force);
    await fetchHomeUnlockedMap();
    refreshLatestLockDecorations();
    await refreshContinueButtonState();
    await renderDaily();
    await applyLatestCompletionBadges({ force });
    await renderDailyHistory();
  }

  async function loadCatalog(){
    try{
      const url = CATALOG_URL + (CATALOG_URL.includes("?") ? "&" : "?") + "t=" + Date.now();
      const res = await fetch(url, { cache:"no-store" });
      if (!res.ok) throw new Error("manifest missing");
      const data = await res.json();

      const srcObj =
        (data && data.categories && typeof data.categories === "object") ? data.categories :
        (data && data.catalog && typeof data.catalog === "object") ? data.catalog :
        null;

      if (!srcObj) throw new Error("bad manifest format");

      const next = {};
      for (const k of Object.keys(srcObj)){
        const arr = Array.isArray(srcObj[k]) ? srcObj[k]
          : (srcObj[k] && Array.isArray(srcObj[k].puzzles)) ? srcObj[k].puzzles
          : [];

        next[k] = arr
          .filter(p => p && typeof p.src === "string")
          .map((p, idx) => ({
            name: String(p.name || "Puzzle"),
            src: String(p.src),
            updated: Number(p.updated ?? p.mtime ?? p.time ?? 0) || 0,
            puzzleIdx: Math.max(0, Number(p.puzzleIdx ?? p.index ?? idx) || 0)
          }));
      }

      PUZZLE_CATALOG = next;
      MANIFEST_OK = true;
      if (catalogState) catalogState.textContent = "Live";
      return true;
    } catch {
      PUZZLE_CATALOG = {};
      MANIFEST_OK = false;
      if (catalogState) catalogState.textContent = "Missing";
      return false;
    }
  }


  async function loadDailyCatalog(){
    try{
      const url = DAILY_CATALOG_URL + (DAILY_CATALOG_URL.includes("?") ? "&" : "?") + "t=" + Date.now();
      const res = await fetch(url, { cache:"no-store" });
      if (!res.ok) throw new Error("daily manifest missing");
      const data = await res.json();

      const srcObj =
        (data && data.categories && typeof data.categories === "object") ? data.categories :
        (data && data.catalog && typeof data.catalog === "object") ? data.catalog :
        null;

      if (!srcObj) throw new Error("bad daily manifest format");

      const next = {};
      for (const k of Object.keys(srcObj)){
        const arr = Array.isArray(srcObj[k]) ? srcObj[k]
          : (srcObj[k] && Array.isArray(srcObj[k].puzzles)) ? srcObj[k].puzzles
          : [];

        next[k] = arr
          .filter(p => p && typeof p.src === "string")
          .map((p, idx) => ({
            name: String(p.name || "Puzzle"),
            src: String(p.src),
            updated: Number(p.updated ?? p.mtime ?? p.time ?? 0) || 0,
            puzzleIdx: Math.max(0, Number(p.puzzleIdx ?? p.index ?? idx) || 0)
          }));
      }

      DAILY_CATALOG = next;
      DAILY_MANIFEST_OK = true;
      return true;
    } catch {
      DAILY_CATALOG = {};
      DAILY_MANIFEST_OK = false;
      return false;
    }
  }


  function renderLatest(){
    latestRail.innerHTML = "";


    const NEW_DAYS = 7;
    const NEW_MS = NEW_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const items = [];
    for (const catId of Object.keys(PUZZLE_CATALOG)){
      for (const p of safeList(catId)){
        items.push({
          catId,
          name: p.name || "Puzzle",
          src: p.src,
          updated: p.updated || 0,
          puzzleIdx: Math.max(0, Number(p && p.puzzleIdx) || 0)
        });
      }
    }

    items.sort((a,b) => (b.updated - a.updated) || a.name.localeCompare(b.name));
    const top = items.slice(0, 6);

    if (!MANIFEST_OK || top.length === 0){
      latestSub.textContent = "Add puzzles/index.json to enable latest puzzles.";
      const msg = document.createElement("div");
      msg.className = "pill";
      msg.style.padding = "12px";
      msg.textContent = "Latest puzzles will appear here after the catalog is generated.";
      latestRail.appendChild(msg);
      return;
    }

    latestSub.textContent = "Newest uploads across all categories.";

    for (const it of top){
      const displayCatId = normalizeCatId(categoryFromSrc(it.src) || it.catId);
      const c = CATEGORIES.find(x => x.id === displayCatId);
      const labelCat = c ? c.name : displayCatId;


      const isNew = (it.updated * 1000) >= (now - NEW_MS);
      const el = document.createElement("div");
      el.className = "card";
      el.dataset.catId = displayCatId;
      el.dataset.puzzleIdx = String(Math.max(0, Number(it && it.puzzleIdx) || 0));
      el.dataset.puzzleSrc = String(it && it.src || "");
      el.innerHTML = `
        ${isNew ? `<div class="newRibbon">NEW</div>` : ``}
        <button class="latestLockBtn" type="button" aria-label="Unlock puzzle">🔒</button>
        <div class="statusBadges" data-role="completion"></div>
        <div class="thumb"><img src="${it.src}" alt="${it.name}"></div>
        <div class="body">
          <div class="name">${it.name}</div>
          <div class="meta"><span>${labelCat}</span><span>Play →</span></div>
        </div>
      `;el.querySelector("img").addEventListener("error", () => {
        el.querySelector(".thumb").innerHTML =
          `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:950;opacity:.85;">Preview</div>`;
      });

      const latestLockBtn = el.querySelector('.latestLockBtn');
      if (latestLockBtn){
        latestLockBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          clickLatestLock(it).catch(() => {});
        });
      }
      el.addEventListener("click", () => openLatestPuzzle(it));
      latestRail.appendChild(el);
    }

    scheduleHomeProgressRefresh({ force:true, delays:[0, 300] });
  }

  function renderGrid(){
    grid.innerHTML = "";

    const last = lsGet(LAST_CAT_KEY);
    if (lastPill) if (lastPill) lastPill.textContent = `Last: ${last || "—"}`;
    pointsPill.textContent = `Points: ${getPoints()}`;

    for (const c of CATEGORIES){
      const puzzles = safeList(c.id).length;

      const el = document.createElement("div");
      el.className = "cat";
      el.innerHTML = `
        <div class="tile"><img src="${c.tile}" alt="${c.name}"></div>
        <div class="info">
          <div>
            <div class="catName">${c.name}</div>
            <div class="catDesc">${c.desc || ""}</div>
          </div>
          <div class="tags">
            <span class="tag">${puzzles} puzzles</span>
            ${last === c.id ? `<span class="tag">last</span>` : ``}
          </div>
        </div>
      `;

      el.querySelector("img").addEventListener("error", () => {
        const tile = el.querySelector(".tile");
        tile.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:950;opacity:.85;">${c.name}</div>`;
      });

      el.addEventListener("click", () => openCategory(c.id));
      grid.appendChild(el);
    }
  }



  function seoAbsoluteUrl(path){
    try{ return new URL(String(path || '/'), location.origin).href; }catch(e){ return String(path || '/'); }
  }

  function setSeoMeta(selector, value, attr){
    const el = document.querySelector(selector);
    if (!el) return;
    if ((attr || 'content') === 'href') el.setAttribute('href', String(value || ''));
    else el.setAttribute(attr || 'content', String(value || ''));
  }

  function updateHomeSeo(){
    const totalPuzzles = Object.keys(PUZZLE_CATALOG || {}).reduce((sum, key) => sum + safeList(key).length, 0);
    const titleText = 'Snapshift Puzzles | Free Online Picture Tile Puzzles & Daily Challenge';
    const desc = `${totalPuzzles || 'Dozens of'} free online picture tile puzzles across ${CATEGORIES.length} categories, plus a Daily Challenge, medals, streaks, saved progress, and categories like Animals, Landscapes, Food, Space, and more.`;
    document.title = titleText;
    setSeoMeta('meta[name="description"]', desc);
    setSeoMeta('#canonicalLink', seoAbsoluteUrl('/index.html'), 'href');
    setSeoMeta('#ogTitle', titleText);
    setSeoMeta('#ogDescription', desc);
    setSeoMeta('#ogUrl', seoAbsoluteUrl('/index.html'));
    const seoCopy = document.getElementById('seoHomeCopy');
    if (seoCopy){
      seoCopy.textContent = `${totalPuzzles || 'Dozens of'} free picture tile puzzles are live right now. Browse categories like Animals, Architecture, Art, Cities, Food, Fractals, Landscapes, Marine, Sci‑Fi, Space, and Vehicles, then return daily for a fresh Daily Challenge, player ratings, saved progress, and past dates in the Daily Archive.`;
    }
    const schema = {
      '@context':'https://schema.org',
      '@graph':[
        {
          '@type':'WebSite',
          name:'Snapshift Puzzles',
          url:seoAbsoluteUrl('/index.html')
        },
        {
          '@type':'CollectionPage',
          name:'Snapshift Puzzles categories',
          url:seoAbsoluteUrl('/index.html'),
          description:desc
        }
      ]
    };
    const ld = document.getElementById('structuredData');
    if (ld) ld.textContent = JSON.stringify(schema);
  }
  continueBtn.addEventListener("click", async () => {
    const prevMain = continueBtn.querySelector(".continueMain") ? continueBtn.querySelector(".continueMain").textContent : "All Caught Up";
    const prevSub = continueBtn.querySelector(".continueSub") ? continueBtn.querySelector(".continueSub").textContent : "";
    const prevTitle = continueBtn.title || "You have no unfinished puzzle to resume";
    continueBtn.disabled = true;
    setContinueButtonDisplay("Opening…", prevSub, prevTitle);
    try{
      const progress = await fetchLatestProgressForContinue();
      if (progress && progress.categoryId) {
        openGameResumeLatest();
        return;
      }

      if (openLastPuzzleHint()) return;

      const last = lsGet(LAST_CAT_KEY) || (CATEGORIES[0] && CATEGORIES[0].id) || "animals";
      openCategory(last);
    } catch(e) {
      const last = lsGet(LAST_CAT_KEY) || (CATEGORIES[0] && CATEGORIES[0].id) || "animals";
      openCategory(last);
    } finally {
      continueBtn.disabled = false;
      setContinueButtonDisplay(prevMain, prevSub, prevTitle);
      refreshContinueButtonState().catch(()=>{});
    }
  });

  if (reloadBtn) {
    reloadBtn.addEventListener("click", async () => {
      bustCompletionStateCache();
      await loadCatalog();
      renderLatest();
      renderGrid();
      updateHomeSeo();
      scheduleHomeProgressRefresh({ force:true, delays:[0, 400] });
    });
  }

  (async () => {
    await applyThemeFromJson();
    
    refreshRememberedLoginLinks();
    await initAuthPill();
    await refreshPointsFromServer();
    await loadCatalog();
    await loadDailyCatalog();
    await renderDaily();
    await renderDailyHistory();
    renderLatest();
    renderGrid();
    updateHomeSeo();
    await refreshHomeProgressDecorations({ force:true });
    scheduleHomeProgressRefresh({ force:true, delays:[500, 1500] });
    setTimeout(() => { try{ maybeRunStreakEffectTest('home'); }catch(e){} }, 360);
  })();

  window.addEventListener('snapshift:daily-rollover', async () => {
    try{
      await loadDailyCatalog();
    }catch(e){}
    try{
      await renderDaily();
    }catch(e){}
    try{
      await renderDailyHistory();
    }catch(e){}
    try{
      const modal = document.getElementById('lbModal');
      if (modal && modal.classList.contains('show')) {
        await loadDailyLeaderboard();
      }
    }catch(e){}
  });

  try{
    const lbParam = new URLSearchParams(window.location.search).get('lb');
    if (lbParam === 'daily' || lbParam === 'rating') {
      sessionStorage.setItem('snapshift_open_lb_mode', lbParam);
      try {
        const cleanUrl = window.location.pathname + window.location.hash;
        history.replaceState({}, document.title, cleanUrl);
      } catch(e) {}
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          openLeaderboardModal(lbParam === 'rating' ? 'rating' : 'daily').catch?.(()=>{});
        });
      });
    }
  } catch(e) {}

  function formatDayShort(dayKey){
    try{
      const d = new Date(dayKey + "T00:00:00Z");
      return d.toLocaleDateString(undefined, { month:"short", day:"numeric", timeZone:"UTC" });
    }catch{ return dayKey || "—"; }
  }

  function starsFromMedalValue(value){
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 0;
    if (raw === 'gold' || raw === '3' || raw === 'three') return 3;
    if (raw === 'silver' || raw === '2' || raw === 'two') return 2;
    if (raw === 'bronze' || raw === '1' || raw === 'one') return 1;
    return 0;
  }

  function extractDailyHistoryStars(day){
    if (!day || typeof day !== 'object') return 0;
    const direct = Math.max(0, Math.floor(Number(day.stars ?? day.star_count ?? day.starCount ?? day.medal_stars ?? day.medalStars ?? 0) || 0));
    if (direct > 0) return Math.min(3, direct);

    const rating = day.rating && typeof day.rating === 'object' ? day.rating : null;
    const ratingStars = Math.max(0, Math.floor(Number(rating && (rating.stars ?? rating.star_count ?? rating.starCount) || 0) || 0));
    if (ratingStars > 0) return Math.min(3, ratingStars);

    const medalStars = starsFromMedalValue(day.medal ?? day.medalKey ?? day.medal_key ?? day.rating_label ?? day.ratingLabel);
    if (medalStars > 0) return medalStars;

    const nestedMedalStars = starsFromMedalValue(rating && (rating.medal ?? rating.medalKey ?? rating.medal_key ?? rating.label));
    if (nestedMedalStars > 0) return nestedMedalStars;

    return 0;
  }

  const dailyHistoryStarsCache = new Map();
  async function fetchDailyHistoryStarsFromProgress(dayKey){
    const dk = String(dayKey || '').trim();
    if (!dk) return 0;
    if (dailyHistoryStarsCache.has(dk)) return dailyHistoryStarsCache.get(dk);

    let stars = 0;
    const candidateKeys = [
      `daily:${dk}:hard`,
      `daily:${dk}:medium`,
      `daily:${dk}:easy`,
      `daily:${dk}:daily:0:hard`,
      `daily:${dk}:daily:0:medium`,
      `daily:${dk}:daily:0:easy`,
      `daily:${dk}:unknown:0:hard`,
      `daily:${dk}:unknown:0:medium`,
      `daily:${dk}:unknown:0:easy`
    ];

    for (const progressKey of candidateKeys){
      try{
        const r = await fetch(`/api/state_get.php?progress_key=${encodeURIComponent(progressKey)}&_=${Date.now()}`, { credentials:'include', cache:'no-store' });
        const j = await r.json().catch(() => null);
        const p = j && j.ok && j.loggedIn && j.progress && typeof j.progress === 'object' ? j.progress : null;
        if (!p) continue;
        const completed = !!(p.completed || String(p.completed || '').toLowerCase() === 'true' || String(p.completed || '') === '1');
        if (!completed) continue;
        const progressDay = String(p.dayKey || '').trim();
        if (progressDay && progressDay !== dk) continue;
        stars = extractDailyHistoryStars(p);
        if (stars > 0) break;
        stars = 1;
        break;
      }catch(e){}
    }

    dailyHistoryStarsCache.set(dk, stars);
    return stars;
  }

  async function enrichDailyHistoryDays(days){
    const list = Array.isArray(days) ? days : [];
    await Promise.all(list.map(async (d) => {
      if (!d || !d.completed || !d.day) return;
      const explicitStars = extractDailyHistoryStars(d);
      if (explicitStars > 0) {
        d._displayStars = explicitStars;
        return;
      }
      d._displayStars = await fetchDailyHistoryStarsFromProgress(d.day);
    }));
    return list;
  }

  function renderDailyHistoryStrip(days){
    const strip = document.getElementById("dailyHistoryStrip");
    if (!strip) return;
    strip.innerHTML = "";
    (Array.isArray(days) ? days : []).forEach((d) => {
      const cell = document.createElement("div");
      const dateObj = new Date(String(d.day||"") + "T00:00:00Z");
      const dow = isNaN(dateObj) ? "" : dateObj.toLocaleDateString(undefined, { weekday:"short", timeZone:"UTC" });
      const num = isNaN(dateObj) ? "" : dateObj.toLocaleDateString(undefined, { day:"numeric", timeZone:"UTC" });
      const stars = Math.min(3, Math.max(0, Number(d && (d._displayStars || extractDailyHistoryStars(d))) || 0));
      const starText = stars > 0 ? '★'.repeat(stars) : (d.claimed ? '★' : '');
      const medalLabel = stars > 0 ? ` • ${stars} medal star${stars === 1 ? '' : 's'}` : '';
      const claimedLabel = d.claimed ? ' • Reward claimed' : '';
      cell.className = "dailyHistoryDay" + (d.completed ? " isDone" : "") + (d.missed ? " isMissed" : "") + (d.is_today ? " dailyHistoryToday" : "");
      cell.title = `${d.day || ""}${d.completed ? " • Completed" : (d.missed ? " • Missed" : "")}${medalLabel}${claimedLabel}`;
      cell.innerHTML = `${starText ? `<div class="dailyHistoryStar" aria-hidden="true">${starText}</div>` : ''}<div class="dailyHistoryDow">${dow}</div><div class="dailyHistoryNum">${num}</div>`;
      strip.appendChild(cell);
    });
  }


  const STREAK_EFFECTS = {
    7: {
      eyebrow: 'Milestone reached',
      title: '7-Day Streak<br>Unlocked!',
      sub: 'A full week of Daily wins. Nice work.',
      medal: 'Weekly Warrior Unlocked',
      accent: '#7cc4ff',
      medalFg: '#e8f3ff',
      colors: ['#7cc4ff','#7cffb2','#ffffff','#9ae6ff','#c39bff','#ffd666']
    },
    14: {
      eyebrow: 'Milestone reached',
      title: '14-Day Challenge<br>Complete!',
      sub: 'You just locked in a full 14-day Daily streak.',
      medal: 'Streak Master Unlocked',
      accent: '#ffd666',
      medalFg: '#fff1b8',
      colors: ['#ffd666','#7cc4ff','#7cffb2','#ff8fc7','#ffffff','#c39bff']
    },
    30: {
      eyebrow: 'Legendary milestone',
      title: '30-Day Streak<br>Legend!',
      sub: 'Thirty straight Daily wins. That is elite consistency.',
      medal: 'Monthly Legend Unlocked',
      accent: '#c39bff',
      medalFg: '#f1e4ff',
      colors: ['#c39bff','#ffd666','#7cc4ff','#ff8fc7','#ffffff','#7cffb2']
    }
  };
  function wasStreakCelebrated(milestone, day){
    try{ return !!day && !!milestone && localStorage.getItem(`pq_streak_fx_${milestone}_${day}`) === '1'; }catch(e){ return false; }
  }
  function markStreakCelebrated(milestone, day){
    try{ if (day && milestone) localStorage.setItem(`pq_streak_fx_${milestone}_${day}`, '1'); }catch(e){}
  }
  function buildStreakOverlay(){
    let overlay = document.getElementById('challengeCelebrateOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'challengeCelebrateOverlay';
    overlay.className = 'challengeCelebrateOverlay';
    overlay.innerHTML = `
      <div class="challengeCelebrateBackdrop"></div>
      <div class="challengeCelebrateBurst" id="challengeCelebrateBurst"></div>
      <div class="challengeCelebrateCard">
        <div class="challengeCelebrateEyebrow" id="challengeCelebrateEyebrow"></div>
        <div class="challengeCelebrateTitle" id="challengeCelebrateTitle"></div>
        <div class="challengeCelebrateSub" id="challengeCelebrateSub"></div>
        <div class="challengeCelebrateMedal" id="challengeCelebrateMedal"><span class="challengeCelebrateSpark">★</span><span id="challengeCelebrateMedalText"></span><span class="challengeCelebrateSpark">★</span></div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }
  function fillStreakConfetti(container, milestone){
    if (!container) return;
    const cfg = STREAK_EFFECTS[Number(milestone)] || STREAK_EFFECTS[14];
    const colors = Array.isArray(cfg.colors) && cfg.colors.length ? cfg.colors : STREAK_EFFECTS[14].colors;
    let html = '';
    for (let i=0;i<42;i++){
      const left = Math.round((i / 41) * 100);
      const dx = Math.round((Math.random()*46) - 23) + 'vw';
      const rot = Math.round((Math.random()*900) - 450) + 'deg';
      const delay = (Math.random()*0.38).toFixed(2) + 's';
      const dur = (2.2 + Math.random()*1.05).toFixed(2) + 's';
      const color = colors[i % colors.length];
      const w = 8 + (i % 4);
      const h = 16 + ((i * 3) % 7);
      html += `<span style="left:${left}%;--dx:${dx};--rot:${rot};animation-delay:${delay};animation-duration:${dur};background:${color};width:${w}px;height:${h}px;"></span>`;
    }
    container.innerHTML = html;
  }
  function launchStreakCelebration(milestone){
    const cfg = STREAK_EFFECTS[Number(milestone)] || STREAK_EFFECTS[14];
    const overlay = buildStreakOverlay();
    const card = overlay.querySelector('.challengeCelebrateCard');
    const backdrop = overlay.querySelector('.challengeCelebrateBackdrop');
    const eyebrow = document.getElementById('challengeCelebrateEyebrow');
    const title = document.getElementById('challengeCelebrateTitle');
    const sub = document.getElementById('challengeCelebrateSub');
    const medal = document.getElementById('challengeCelebrateMedal');
    const medalText = document.getElementById('challengeCelebrateMedalText');
    if (eyebrow) eyebrow.textContent = cfg.eyebrow || 'Milestone reached';
    if (title) title.innerHTML = cfg.title || 'Challenge Complete!';
    if (sub) sub.textContent = cfg.sub || '';
    if (medalText) medalText.textContent = cfg.medal || 'Streak Unlocked';
    if (eyebrow) eyebrow.style.color = cfg.accent || '#ffd666';
    if (card){
      card.style.borderColor = (cfg.accent || '#ffd666') + '66';
      card.style.boxShadow = `0 28px 70px rgba(0,0,0,.48), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 46px ${(cfg.accent || '#ffd666')}33`;
    }
    if (medal){
      medal.style.color = cfg.medalFg || '#fff1b8';
      medal.style.borderColor = (cfg.accent || '#ffd666') + '59';
    }
    if (backdrop){
      const accent = cfg.accent || '#ffd666';
      backdrop.style.background = `radial-gradient(circle at center, ${accent}33 0%, ${accent}18 18%, rgba(0,0,0,0) 56%), radial-gradient(circle at center, rgba(11,18,32,0.12) 0%, rgba(11,18,32,0.55) 100%)`;
    }
    fillStreakConfetti(document.getElementById('challengeCelebrateBurst'), milestone);
    overlay.classList.remove('show');
    void overlay.offsetWidth;
    overlay.classList.add('show');
    ['dailyCard','dailyStatsCard'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('dailyCelebratePulse');
      void el.offsetWidth;
      el.classList.add('dailyCelebratePulse');
      setTimeout(() => el.classList.remove('dailyCelebratePulse'), 2600);
    });
    try{ if (navigator.vibrate) navigator.vibrate([70, 35, 110, 35, 160]); }catch(e){}
    setTimeout(() => overlay.classList.remove('show'), 3400);
  }
  function maybeCelebrateStreakMilestone(current, lastCompleted){
    const cur = Number(current || 0);
    const last = String(lastCompleted || '');
    if (![7,14,30].includes(cur) || !last || wasStreakCelebrated(cur, last)) return;
    markStreakCelebrated(cur, last);
    launchStreakCelebration(cur);
  }
  function consumeStreakEffectTest(target){
    try{
      const raw = localStorage.getItem('pq_streak_effect_test');
      if (!raw) return 0;
      const j = JSON.parse(raw);
      const milestone = Number(j && j.milestone || 0);
      if (![7,14,30].includes(milestone)) return 0;
      const age = Date.now() - Number(j && j.ts || 0);
      if (age > 15 * 60 * 1000){
        localStorage.removeItem('pq_streak_effect_test');
        return 0;
      }
      const tgt = String(j && j.target || 'any');
      if (tgt !== 'any' && tgt !== target) return 0;
      localStorage.removeItem('pq_streak_effect_test');
      return milestone;
    }catch(e){ return 0; }
  }
  function maybeRunStreakEffectTest(target){
    const milestone = consumeStreakEffectTest(target);
    if (milestone) setTimeout(() => launchStreakCelebration(milestone), 180);
  }
  let streakRewardToastTimer = null;
  function showStreakRewardToast(message, detail = "") {
    const el = document.getElementById("streakRewardToast");
    if (!el || !message) return;
    el.innerHTML = `${message}${detail ? `<small>${detail}</small>` : ''}`;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    if (streakRewardToastTimer) clearTimeout(streakRewardToastTimer);
    streakRewardToastTimer = setTimeout(() => { try{ el.classList.remove("show"); }catch(e){} }, 3600);
  }

  let pendingLeaderboardMode = null;

  function showLeaderboardRotateToast(mode = "daily"){
    pendingLeaderboardMode = mode === "rating" ? "rating" : "daily";
    const overlay = document.getElementById("leaderboardRotateOverlay");
    if (!overlay) return;
    overlay.classList.add("show");
  }

  function hideLeaderboardRotateToast(){
    const overlay = document.getElementById("leaderboardRotateOverlay");
    if (!overlay) return;
    overlay.classList.remove("show");
  }

  function syncLeaderboardRotateToast(){
    if (leaderboardRequiresLandscape()) {
      if (pendingLeaderboardMode) showLeaderboardRotateToast(pendingLeaderboardMode);
      return;
    }
    hideLeaderboardRotateToast();
    if (pendingLeaderboardMode) {
      const nextMode = pendingLeaderboardMode;
      pendingLeaderboardMode = null;
      setTimeout(() => { openLeaderboardModal(nextMode); }, 80);
    }
  }

  function enableLeaderboardTableTouchScroll(){
    const modal = document.getElementById('lbModal');
    const wrap = modal ? modal.querySelector('.lbTableWrap') : null;
    if (!modal || !wrap || wrap.dataset.touchScrollBound === '1') return;
    wrap.dataset.touchScrollBound = '1';

    let startX = 0, startY = 0, startLeft = 0, startTop = 0, active = false;

    wrap.addEventListener('touchstart', (e) => {
      if (!modal.classList.contains('show') || !e.touches || !e.touches[0]) return;
      const t = e.touches[0];
      active = true;
      startX = t.clientX;
      startY = t.clientY;
      startLeft = wrap.scrollLeft;
      startTop = wrap.scrollTop;
    }, { passive: true });

    wrap.addEventListener('touchmove', (e) => {
      if (!active || !modal.classList.contains('show') || !e.touches || !e.touches[0]) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      wrap.scrollLeft = startLeft - dx;
      wrap.scrollTop = startTop - dy;
      e.preventDefault();
    }, { passive: false });

    const endTouch = () => { active = false; };
    wrap.addEventListener('touchend', endTouch, { passive: true });
    wrap.addEventListener('touchcancel', endTouch, { passive: true });
  }

  function sizeLeaderboardTableWrap(){
    const modal = document.getElementById('lbModal');
    const card = modal ? modal.querySelector('.lbCard') : null;
    const wrap = card ? card.querySelector('.lbTableWrap') : null;
    if (!modal || !card || !wrap || !modal.classList.contains('show')) return;

    const cardStyles = window.getComputedStyle(card);
    const padTop = parseFloat(cardStyles.paddingTop || '0') || 0;
    const padBottom = parseFloat(cardStyles.paddingBottom || '0') || 0;
    let used = padTop + padBottom;

    Array.from(card.children).forEach((child) => {
      if (child === wrap) return;
      const styles = window.getComputedStyle(child);
      const mt = parseFloat(styles.marginTop || '0') || 0;
      const mb = parseFloat(styles.marginBottom || '0') || 0;
      used += child.getBoundingClientRect().height + mt + mb;
    });

    const available = Math.max(180, Math.floor(card.clientHeight - used - 8));
    wrap.style.height = available + 'px';
    wrap.style.maxHeight = available + 'px';
    wrap.style.overflowY = 'auto';
    if (!wrap.style.overflowX) wrap.style.overflowX = 'auto';
  }
  function formatStreakRewardSummary(awarded){
    const list = Array.isArray(awarded) ? awarded : [];
    if (!list.length) return null;
    if (list.length === 1){
      const a = list[0] || {};
      return {
        main: `${Number(a.milestone || 0)}-Day streak bonus: +${Number(a.reward || 0)} points!`,
        detail: 'Milestone reward added to your total.'
      };
    }
    const total = list.reduce((sum, a) => sum + Math.max(0, Number(a && a.reward || 0)), 0);
    const labels = list.map((a) => `${Number(a && a.milestone || 0)}-Day`).join(' • ');
    return {
      main: `Streak bonuses awarded: +${total} points!`,
      detail: labels
    };
  }
  async function maybeClaimStreakRewards(current, lastCompleted){
    const cur = Number(current || 0);
    const last = String(lastCompleted || '');
    if (cur < 7 || !last) return null;
    try{
      const r = await fetch('/api/streak_reward_claim.php', {
        method:'POST',
        credentials:'include',
        headers:{ 'Content-Type':'application/json' },
        body:'{}'
      });
      const j = await r.json().catch(() => null);
      if (!j || !j.ok) return j;
      if (typeof j.points === 'number'){
        pointsState = Math.max(0, Math.floor(Number(j.points) || 0));
        const pill = document.getElementById('pointsPill');
        if (pill) pill.textContent = `Points: ${pointsState}`;
      }
      if (Array.isArray(j.awarded) && j.awarded.length){
        const summary = formatStreakRewardSummary(j.awarded);
        if (summary) showStreakRewardToast(summary.main, summary.detail);
      }
      return j;
    }catch(e){
      return null;
    }
  }

  async function renderDailyHistory(){
    const card = document.getElementById("dailyStatsCard");
    const note = document.getElementById("dailyHistoryNote");
    const sub = document.getElementById("dailyHistorySub");
    const streakPill = document.getElementById("dailyStreakPill");
    const bestPill = document.getElementById("dailyBestPill");
    const elCur = document.getElementById("dailyCurrentValue");
    const elBest = document.getElementById("dailyBestValue");
    const elDone = document.getElementById("dailyCompletedValue");
    const elLast = document.getElementById("dailyLastValue");
    if (!card) return;

    try{
      const r = await fetch('/api/daily_history.php?days=14', { cache:'no-store', credentials:'include' });
      const j = await r.json();
      if (!j || !j.ok || !j.loggedIn){
        card.hidden = true;
        return;
      }
      card.hidden = false;
      const current = Number(j.current_streak || 0);
      const best = Number(j.best_streak || 0);
      const total = Number(j.total_completed || 0);
      const last = j.last_completed || '';
      if (streakPill) streakPill.textContent = `Daily streak: ${current}`;
      if (bestPill) bestPill.textContent = `Best: ${best}`;
      if (elCur) elCur.textContent = String(current);
      if (elBest) elBest.textContent = String(best);
      if (elDone) elDone.textContent = String(total);
      if (elLast) elLast.textContent = last ? formatDayShort(last) : '—';
      if (sub) sub.textContent = `Your last ${Number(j.days_requested || 14)} Daily Challenges.`;
      if (note) note.textContent = '★ Medal stars';
      const historyDays = await enrichDailyHistoryDays(j.days || []);
      renderDailyHistoryStrip(historyDays);
      maybeCelebrateStreakMilestone(current, last);
      await maybeClaimStreakRewards(current, last);
    }catch(e){
      card.hidden = true;
    }
  }

  // ===== DAILY_CHALLENGE (safe) =====
  const DAILY_BONUS = 50;
  const DAILY_KEY_PREFIX = "tilepuzzle_daily_";

  const DAILY_ROLLOVER_TZ = "America/Vancouver";
  const DAILY_ROLLOVER_HOUR = 17;

  function zonedNowParts(timeZone){
    try{
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', second:'2-digit',
        hour12:false
      });
      const parts = {};
      dtf.formatToParts(new Date()).forEach(p => { if (p.type !== 'literal') parts[p.type] = p.value; });
      return parts;
    }catch(e){
      const d = new Date();
      return {
        year: String(d.getFullYear()),
        month: String(d.getMonth()+1).padStart(2,'0'),
        day: String(d.getDate()).padStart(2,'0'),
        hour: String(d.getHours()).padStart(2,'0'),
        minute: String(d.getMinutes()).padStart(2,'0'),
        second: String(d.getSeconds()).padStart(2,'0')
      };
    }
  }

  function todayKey(){
    const p = zonedNowParts(DAILY_ROLLOVER_TZ);
    let y = Number(p.year || 0);
    let m = Number(p.month || 1);
    let d = Number(p.day || 1);
    const hour = Number(p.hour || 0);
    if (hour < DAILY_ROLLOVER_HOUR){
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 1);
      y = dt.getUTCFullYear();
      m = dt.getUTCMonth() + 1;
      d = dt.getUTCDate();
    }
    return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  function getDailyStreak(){ return 0; }
  function hashToIndex(seed, n){
    let h = 0;
    for (let i=0;i<seed.length;i++) h = (h*31 + seed.charCodeAt(i)) >>> 0;
    return n ? (h % n) : 0;
  }
let DAILY_HISTORY_CACHE = null;

async function fetchDailyHistoryData(){
  if (DAILY_HISTORY_CACHE) return DAILY_HISTORY_CACHE;
  try{
    const r = await fetch(DAILY_HISTORY_URL + '?t=' + Date.now(), { cache:'no-store' });
    if (!r.ok) throw new Error('history missing');
    const j = await r.json();
    if (!j || typeof j !== 'object') throw new Error('bad history');
    DAILY_HISTORY_CACHE = j;
    return DAILY_HISTORY_CACHE;
  }catch(e){
    DAILY_HISTORY_CACHE = {};
    return DAILY_HISTORY_CACHE;
  }
}

function normalizeHistoryDailyItem(item, day){
  if (!item || !item.src) return null;
  return {
    day,
    catId: String(item.catId || 'daily'),
    name: String(item.name || 'Puzzle'),
    src: decodeMaybeTwice(String(item.src || '')),
    thumb: String(item.thumb || '').trim(),
    updated: Number(item.updated || 0) || 0,
    puzzleIdx: Math.max(0, Number(item.puzzleIdx || 0) || 0)
  };
}

async function resolveCurrentDailyFromHistory(){
  try{
    const history = await fetchDailyHistoryData();
    const day = String(history && history.today || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const days = history && history.days && typeof history.days === 'object' ? history.days : {};
    const exact = days && days[day] ? days[day] : null;
    if (!exact || !exact.src) return null;
    return normalizeHistoryDailyItem(exact, day);
  }catch(e){
    return null;
  }
}
async function renderDaily(){
    const elTitle = document.getElementById("dailyTitle");
    const elSub = document.getElementById("dailySub");
    const elImg = document.getElementById("dailyImg");
    
    elImg.addEventListener("error", () => {
      const full = elImg.dataset && elImg.dataset.full ? elImg.dataset.full : null;
      if (full && elImg.src !== full) elImg.src = full;
    });
const streakPill = document.getElementById("dailyStreakPill");
    const bonusPill = document.getElementById("dailyBonusPill");
    const playBtn = document.getElementById("dailyPlayBtn");
    if (!elTitle || !playBtn) return;

    streakPill.textContent = `Daily streak: ${getDailyStreak()}`;
    bonusPill.textContent = `Bonus: +${DAILY_BONUS}`;

    let daily = null;
    try{ daily = await resolveCurrentDailyFromHistory(); }catch(e){}
    if (!daily){
      elSub.textContent = "Daily unavailable. Rebuild /daily_puzzles/history.json from build_daily_archive.php.";
      playBtn.disabled = true;
      return;
    }
    const c = CATEGORIES.find(x => x.id === daily.catId);
    const labelCat = c ? c.name : (String(daily.catId || "").toLowerCase() === "daily" ? "Daily Pool" : (daily.catId || "Daily"));

const cleanSrc = decodeMaybeTwice(String(daily.src||""));
    let done = false;
    try{
      done = await fetchDailyCompletedState(daily.day, cleanSrc);
    }catch(e){}
    elTitle.textContent = `Daily Challenge • ${daily.day}`;
    elSub.textContent = `${labelCat} • ${daily.name}${done ? ' • Completed' : ''}`;
    elImg.src = cleanSrc;

    playBtn.disabled = false;
    playBtn.textContent = done ? "View Daily" : "Play Daily";
    playBtn.onclick = () => {
      const cleanSrc = decodeMaybeTwice(String(daily.src||""));
      window.location.href = `${GAME_URL}#daily=${encodeURIComponent(daily.day)}&cat=${encodeURIComponent(daily.catId)}&src=${encodeURIComponent(cleanSrc)}&puzzle=${encodeURIComponent(daily.name||"")}`;
    };
  

    try{ wireLeaderboardUi(); }catch{}

    // Stable leaderboard handoff from other pages (avoids query-jump / modal bounce)
    try{
      const pendingLbMode = sessionStorage.getItem('snapshift_open_lb_mode');
      if (pendingLbMode === 'daily' || pendingLbMode === 'rating') {
        sessionStorage.removeItem('snapshift_open_lb_mode');
        try { window.scrollTo(0, 0); } catch(e) {}
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            openLeaderboardModal(pendingLbMode === 'rating' ? 'rating' : 'daily').catch?.(()=>{});
          });
        });
      }
    }catch(e){}
}

  function prevDayKey(dayKey){
    // dayKey: YYYY-MM-DD
    try{
      const [y,m,d] = String(dayKey||"").split("-").map(x=>parseInt(x,10));
      if (!y||!m||!d) return "";
      const dt = new Date(Date.UTC(y, m-1, d));
      dt.setUTCDate(dt.getUTCDate()-1);
      const yy = dt.getUTCFullYear();
      const mm = String(dt.getUTCMonth()+1).padStart(2,"0");
      const dd = String(dt.getUTCDate()).padStart(2,"0");
      return `${yy}-${mm}-${dd}`;
    }catch(e){ return ""; }
  }


  async function fetchDailyCompletedState(dayKey, dailySrc = ""){
    const dk = String(dayKey || "").trim();
    const cleanSrc = decodeMaybeTwice(String(dailySrc || "")).trim();
    if (!dk) return false;

    try{
      const loggedIn = await ensureCompletionAuth(false);
      if (!loggedIn) return false;
    }catch(e){
      return false;
    }

    try{
      const raw = localStorage.getItem('pq_daily_progress_' + dk);
      const backup = raw ? JSON.parse(raw) : null;
      if (backup && backup.completed) {
        const savedSrc = decodeMaybeTwice(String(backup.puzzleSrc || '')).trim();
        const sameSrc = !cleanSrc || !savedSrc || savedSrc === cleanSrc;
        if (sameSrc) return true;
      }
    }catch(e){}

    try{
      const qs = new URLSearchParams({
        day: dk,
        category_id: 'daily',
        diff_key: 'hard'
      });
      if (cleanSrc) qs.set('puzzle_src', cleanSrc);
      const sr = await fetch('/api/state_get.php?' + qs.toString(), { cache:'no-store', credentials:'include' });
      const sj = await sr.json().catch(() => null);
      const progress = sj && sj.ok && sj.loggedIn && sj.progress && typeof sj.progress === 'object' ? sj.progress : null;
      if (progress && progress.completed) {
        const savedSrc = decodeMaybeTwice(String(progress.puzzleSrc || '')).trim();
        const sameSrc = !cleanSrc || !savedSrc || savedSrc === cleanSrc;
        if (sameSrc) return true;
      }
    }catch(e){}

    const isArchiveDay = /^\d{4}-\d{2}-\d{2}$/.test(dk) && dk < todayKey();
    try{
      const hr = await fetch('/api/daily_history.php?days=14', { cache:'no-store', credentials:'include' });
      const hj = await hr.json().catch(() => null);
      if (isArchiveDay && hj && hj.ok && hj.loggedIn) {
        const days = Array.isArray(hj.days) ? hj.days : [];
        const match = days.find(d => String(d && d.day || '').trim() === dk);
        if (match && !!(match && match.completed)) {
          const savedSrc = decodeMaybeTwice(String(match && (match.src || match.puzzleSrc || '') || '')).trim();
          const sameSrc = !cleanSrc || !savedSrc || savedSrc === cleanSrc;
          if (sameSrc) return true;
        }
        if (String(hj.last_completed || '').trim() === dk) return true;
      }
    }catch(e){}

    return false;
  }

  // ===== DAILY LEADERBOARD (safe) =====
  let CURRENT_LB_DAY = "";
  let CURRENT_LB_MODE = "daily";

  function calcMoveEfficiency(moves){
    const mv = Math.max(0, Math.floor(Number(moves) || 0));
    if (!mv) return null;
    return Math.max(1, Math.min(100, Math.round((96 / mv) * 100)));
  }

  function fmtMsToClock(ms){
    const total = Math.max(0, Number(ms)||0);
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const tenths = Math.floor((total % 1000) / 100);
    return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${tenths}`;
  }
  function leaderboardMedalMeta(key){
    const k = String(key || '').toLowerCase();
    if (k === 'gold') return { key:'gold', icon:'👑', stars:'★★★', title:'Gold medal • 3 stars' };
    if (k === 'silver') return { key:'silver', icon:'🎖️', stars:'★★', title:'Silver medal • 2 stars' };
    return { key:'bronze', icon:'🛡️', stars:'★', title:'Bronze medal • 1 star' };
  }
  function medalTierForMs(ms){
    const value = Number(ms || 0);
    if (!value || value < 0) return null;
    if (value <= 4*60*1000) return 'gold';
    if (value <= 8*60*1000) return 'silver';
    if (value <= 12*60*1000) return 'bronze';
    return null;
  }
  function renderLeaderboardMedalBadge(key){
    if (!key) return '<span class="lbValMuted">—</span>';
    const m = leaderboardMedalMeta(key);
    return `<span class="lbMedalWrap" title="${m.title}"><span class="lbMedalBadge is${m.key.charAt(0).toUpperCase()+m.key.slice(1)}"><span class="lbMedalIcon">${m.icon}</span><span class="lbMedalStars">${m.stars}</span></span></span>`;
  }
  function renderLeaderboardCountBadge(key, value){
    const m = leaderboardMedalMeta(key);
    const n = fmtNum(value || 0);
    return `<span class="lbCountBadge ${m.key}" title="${m.title} count"><span class="countIcon">${m.icon}</span><span>${n}</span></span>`;
  }
  function fmtNum(n){
    return Number(n || 0).toLocaleString();
  }
  function lbHeadHtml(mode){
    if (mode === "rating") {
      return '<th class="lbRankCell">#</th><th>User</th><th>Rating</th><th><span class="lbHeadBadge" title="Gold medals • 3 stars"><span>👑</span><span class="headLabel">Gold</span></span></th><th><span class="lbHeadBadge" title="Silver medals • 2 stars"><span>🎖️</span><span class="headLabel">Silver</span></span></th><th><span class="lbHeadBadge" title="Bronze medals • 1 star"><span>🛡️</span><span class="headLabel">Bronze</span></span></th><th>Done</th>';
    }
    return '<th class="lbRankCell">#</th><th>User</th><th>Time</th><th>Moves</th><th>Eff</th><th><span class="lbHeadBadge" title="Speed medal"><span>👑</span><span class="headLabel">Medal</span></span></th>';
  }
  function syncLbModeUi(mode){
    CURRENT_LB_MODE = mode === "rating" ? "rating" : "daily";
    const dailyTab = document.getElementById("lbDailyTab");
    const ratingTab = document.getElementById("lbRatingTab");
    if (dailyTab) {
      dailyTab.classList.toggle("active", CURRENT_LB_MODE === "daily");
      dailyTab.setAttribute("aria-selected", CURRENT_LB_MODE === "daily" ? "true" : "false");
    }
    if (ratingTab) {
      ratingTab.classList.toggle("active", CURRENT_LB_MODE === "rating");
      ratingTab.setAttribute("aria-selected", CURRENT_LB_MODE === "rating" ? "true" : "false");
    }
    const headRow = document.getElementById("lbHeadRow");
    if (headRow) headRow.innerHTML = lbHeadHtml(CURRENT_LB_MODE);
    const claimBtn = document.getElementById("lbClaimBtn");
    if (claimBtn && CURRENT_LB_MODE !== "daily") {
      claimBtn.hidden = true;
      claimBtn.disabled = true;
      claimBtn.textContent = "Claim Now";
    }
    const helpWrap = document.getElementById("lbRatingHelpWrap");
    if (helpWrap) helpWrap.classList.toggle("show", CURRENT_LB_MODE === "rating");
  }
  let meCache = null;
  let homeAuthFingerprint = "guest";

  async function loadDailyLeaderboard(){
    syncLbModeUi("daily");
    const body = document.getElementById("lbBody");
    const sub = document.getElementById("lbSub");
    const title = document.getElementById("lbTitle");
    const yourRank = document.getElementById("lbYourRank");
    const msg = document.getElementById("lbMsg");
    body.innerHTML = "";
    if (msg) msg.textContent = "";
    try{ if(!meCache){ const r0 = await fetch("/api/me.php",{cache:"no-store", credentials:"include"}); meCache = await r0.json(); } }catch{ meCache=null; }
    const daily = (typeof resolveCurrentDailyFromHistory === "function") ? await resolveCurrentDailyFromHistory() : null;
    if (!daily){ CURRENT_LB_DAY = ""; title.textContent = "Daily Leaderboard"; sub.textContent="Daily not available yet."; if (yourRank) yourRank.textContent = ""; return; }
    CURRENT_LB_DAY = String(daily.day || "");
    title.textContent = `Daily Leaderboard • ${CURRENT_LB_DAY}`;
    sub.textContent = "Loading…";
    try{
      const qs = new URLSearchParams({ day: daily.day });
      const r = await fetch("/api/leaderboard_top.php?"+qs.toString(), { cache:"no-store", credentials:"include" });
      const j = await r.json();
      if (!j.ok){ sub.textContent = j.msg || "Not available"; return; }
      const items = Array.isArray(j.items) ? j.items : (Array.isArray(j.rows) ? j.rows : []);
      const lbMode = (j && j.mode) ? String(j.mode) : "daily";
      sub.textContent = (lbMode === "points") ? `Showing ${items.length} players ranked by points.` : `Showing today’s top ${items.length} fastest runs.`;
      try{
        if (meCache && meCache.loggedIn){
          const rr = await fetch("/api/leaderboard_rank.php?"+qs.toString(), {cache:"no-store", credentials:"include"});
          const rj = await rr.json();
          if (yourRank) yourRank.textContent = rj && rj.ok && rj.rank ? `Your position: #${rj.rank}` : `Your position: not ranked yet`;
        } else if (yourRank) {
          yourRank.textContent = "";
        }
      }catch{}
      if (!items.length){
        body.innerHTML = `<tr><td class="lbEmpty" colspan="6">No scores yet. Be the first to finish today’s Daily Challenge.</td></tr>`;
        return;
      }
      items.forEach((it, idx) => {
        const tr = document.createElement("tr");
        if (idx === 0) tr.classList.add("lbTop1");
        else if (idx === 1) tr.classList.add("lbTop2");
        else if (idx === 2) tr.classList.add("lbTop3");
        try{ if(meCache && meCache.uid && it.user_id && Number(it.user_id)===Number(meCache.uid)) tr.classList.add("lbRowMe"); }catch{}
        const mv = (it.moves == null ? null : Number(it.moves));
        const accRaw = (it.acc == null ? it.accuracy : it.acc);
        const acc = ((accRaw == null || Number(accRaw) <= 0) ? calcMoveEfficiency(mv) : Number(accRaw));
        const points = (it.points == null ? null : Number(it.points));
        const isPointsMode = (lbMode === "points") || (it.time_ms == null && points != null);
        const timeCell = isPointsMode ? ((points == null || Number.isNaN(points)) ? "—" : `${points} pts`) : fmtMsToClock(it.time_ms);
        const medalTier = isPointsMode ? null : medalTierForMs(it.time_ms);
        const medalCell = isPointsMode ? '<span class="lbValMuted">—</span>' : renderLeaderboardMedalBadge(medalTier);
        const rankClass = idx === 0 ? "top1" : (idx === 1 ? "top2" : (idx === 2 ? "top3" : ""));
        const userName = it.username || "?";
        tr.innerHTML = `<td class="lbRankCell"><span class="lbRankPill ${rankClass}">${idx+1}</span></td><td class="lbUserCell">${userName}</td><td>${timeCell}</td><td>${isPointsMode?'<span class="lbValMuted">—</span>':(mv==null?'<span class="lbValMuted">—</span>':mv)}</td><td>${isPointsMode?'<span class="lbValMuted">—</span>':(acc==null?'<span class="lbValMuted">—</span>':(Math.round(acc)+"%"))}</td><td class="medal">${medalCell}</td>`;
        body.appendChild(tr);
      });
    }catch{
      sub.textContent = "Could not load leaderboard.";
    }
  }

  async function loadRatingLeaderboard(){
    syncLbModeUi("rating");
    const body = document.getElementById("lbBody");
    const sub = document.getElementById("lbSub");
    const title = document.getElementById("lbTitle");
    const yourRank = document.getElementById("lbYourRank");
    const msg = document.getElementById("lbMsg");
    body.innerHTML = "";
    title.textContent = "Player Ratings • Top 30";
    sub.textContent = "Loading…";
    if (msg) msg.textContent = "Best 30 puzzle results per player. Tap ? for rating values.";
    try{
      const wrap = document.querySelector("#leaderboardModal .lbTableWrap");
      if (wrap){
        wrap.style.overflowX = "auto";
        wrap.style.overflowY = "auto";
        wrap.style.webkitOverflowScrolling = "touch";
        wrap.scrollLeft = 0;
        wrap.scrollTop = 0;
      }
      enableLeaderboardTableTouchScroll();
      requestAnimationFrame(() => { sizeLeaderboardTableWrap(); });
    }catch(e){}
    try{ if(!meCache){ const r0 = await fetch("/api/me.php",{cache:"no-store", credentials:"include"}); meCache = await r0.json(); } }catch{ meCache=null; }
    try{
      const qs = new URLSearchParams({ limit: "30" });
      const r = await fetch("/api/rating_top.php?" + qs.toString(), { cache:"no-store", credentials:"include" });
      const j = await r.json();
      if (!j || !j.ok) {
        sub.textContent = (j && (j.msg || j.error)) ? (j.msg || j.error) : "Could not load ratings.";
        if (yourRank) yourRank.textContent = "";
        return;
      }
      const items = Array.isArray(j.items) ? j.items : (Array.isArray(j.rows) ? j.rows : []);
      sub.textContent = `Showing the top ${items.length} all-time player ratings.`;
      if (meCache && meCache.loggedIn) {
        try{
          const rr = await fetch("/api/rating_rank.php", { cache:"no-store", credentials:"include" });
          const rj = await rr.json();
          if (yourRank) {
            yourRank.textContent = rj && rj.ok && rj.has_entry
              ? `Your rating: #${rj.rank} • ${fmtNum(rj.rating)} pts`
              : "Your rating: complete puzzles to enter";
          }
        }catch{
          if (yourRank) yourRank.textContent = "";
        }
      } else if (yourRank) {
        yourRank.textContent = "Sign in to track your player rating.";
      }
      if (!items.length) {
        body.innerHTML = `<tr><td class="lbEmpty" colspan="7">No player ratings yet. Complete puzzles to start the all-time board.</td></tr>`;
        return;
      }
      items.forEach((it, idx) => {
        const tr = document.createElement("tr");
        if (idx === 0) tr.classList.add("lbTop1");
        else if (idx === 1) tr.classList.add("lbTop2");
        else if (idx === 2) tr.classList.add("lbTop3");
        try{ if(meCache && meCache.uid && it.user_id && Number(it.user_id)===Number(meCache.uid)) tr.classList.add("lbRowMe"); }catch{}
        const rankClass = idx === 0 ? "top1" : (idx === 1 ? "top2" : (idx === 2 ? "top3" : ""));
        const userName = it.username || "Player";
        const rating = fmtNum(it.rating || 0);
        const done = fmtNum(it.completed_count || it.completed || 0);
        tr.innerHTML = `<td class="lbRankCell"><span class="lbRankPill ${rankClass}">${idx+1}</span></td><td class="lbUserCell">${userName}</td><td>${rating}</td><td>${renderLeaderboardCountBadge('gold', it.gold || 0)}</td><td>${renderLeaderboardCountBadge('silver', it.silver || 0)}</td><td>${renderLeaderboardCountBadge('bronze', it.bronze || 0)}</td><td>${done}</td>`;
        body.appendChild(tr);
      });
    }catch{
      sub.textContent = "Could not load player ratings.";
      if (yourRank) yourRank.textContent = "";
    }
  }

  async function fetchJsonResilient(url, options){
    const res = await fetch(url, options);
    const raw = await res.text();
    try{
      return JSON.parse(raw);
    }catch(e){}

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = raw.slice(start, end + 1);
      try{
        return JSON.parse(candidate);
      }catch(e){}
    }

    throw new Error('Invalid JSON response');
  }

  function friendlyLeaderboardMessage(value, fallback = ''){
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    const lower = raw.toLowerCase();
    if (lower === 'not_logged_in' || lower === 'not logged in' || lower === 'login_required' || lower === 'auth_required') {
      return 'Sign in to claim rewards.';
    }
    return raw.replace(/_/g, ' ');
  }

  function getDailyResetCountdownText(){
    try{
      const el = document.querySelector('[data-daily-countdown-value]');
      const raw = String((el && el.textContent) || '').trim();
      if (raw && /^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
    }catch(e){}
    return '';
  }

  function getRewardResetLabel(){
    const tz = String(window.SNAPSHIFT_DAILY_RESET_TZ || 'America/Vancouver').replace(/_/g, ' ');
    const hour = ((Number(window.SNAPSHIFT_DAILY_RESET_HOUR ?? 17) % 24) + 24) % 24;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return hour12 + ':00 ' + suffix + ' ' + tz;
  }

  function buildRewardWindowMessage(options = {}){
    const count = getDailyResetCountdownText();
    const reward = Math.max(0, Math.floor(Number(options.reward) || 0));
    const rank = Math.max(0, Math.floor(Number(options.rank) || 0));

    if (options.nowAvailable) {
      return reward
        ? `Reward ready: claim +${reward} points for yesterday's Daily.`
        : `Reward ready to claim.`;
    }

    if (options.alreadyClaimed) {
      return reward
        ? `Yesterday's Daily reward was already claimed: +${reward} points.`
        : `Yesterday's Daily reward was already claimed.`;
    }

    if (options.noReward) {
      return rank
        ? `Yesterday's Daily finished at #${rank}. No reward this time.`
        : `No Daily reward available.`;
    }

    return count
      ? `Daily rewards become claimable after reset in ${count}.`
      : `Daily rewards become claimable after reset.`;
  }

  function applyRewardClaimUi(status, options = {}){
    const btn = document.getElementById('lbClaimBtn');
    const msg = document.getElementById('lbMsg');
    const loggedIn = !!options.loggedIn;
    if (!btn) return;

    const claimableCount = Math.max(0, Math.floor(Number(status && status.claimable_count) || 0));
    const claimDay = String((status && status.claim_day) || '').trim();
    const claimedPoints = Math.max(0, Math.floor(Number(status && status.claimed_points) || 0));
    const pendingPoints = Math.max(0, Math.floor(Number(status && status.pending_points) || 0));
    const activeDailyDay = String((status && status.active_daily_day) || '').trim();

    btn.textContent = claimableCount > 1 ? `Claim Now (${claimableCount})` : 'Claim Now';

    if (!loggedIn) {
      btn.hidden = true;
      btn.disabled = true;
      if (msg && options.clearGuestMessage !== false) msg.textContent = '';
      return;
    }

    if (!status || !status.ok) {
      btn.hidden = true;
      btn.disabled = true;
      if (msg) msg.textContent = friendlyLeaderboardMessage(status && status.msg, buildRewardWindowMessage());
      return;
    }

    if (status.ui && typeof status.ui === 'object') {
      const ui = status.ui;
      btn.textContent = String(ui.button_label || btn.textContent || 'Claim Now');
      btn.hidden = !ui.button_visible;
      btn.disabled = !ui.button_enabled;
      if (msg && typeof ui.message === 'string') msg.textContent = ui.message;
      return;
    }

    if (status.claimable || claimableCount > 0 || claimDay) {
      btn.hidden = false;
      btn.disabled = false;

      if (msg) {
        if (claimableCount > 1) {
          msg.textContent = `You have ${claimableCount} Daily rewards ready to claim.` + (pendingPoints > 0 ? ` Pending total: +${pendingPoints} points.` : '');
        } else if (claimDay && activeDailyDay && claimDay !== activeDailyDay) {
          msg.textContent = pendingPoints > 0
            ? `Reward ready: claim +${pendingPoints} points from ${claimDay}.`
            : `Reward ready to claim from ${claimDay}.`;
        } else {
          msg.textContent = pendingPoints > 0
            ? `Reward ready: claim +${pendingPoints} points.`
            : `Reward ready to claim.`;
        }
      }
      return;
    }

    if (claimedPoints > 0) {
      btn.hidden = true;
      btn.disabled = true;
      if (msg) msg.textContent = `Daily rewards already claimed: +${claimedPoints} points.`;
      return;
    }

    const rank = Math.max(0, parseInt(status && (status.rank_pos ?? status.rank), 10) || 0);
    if (rank > 0) {
      btn.hidden = true;
      btn.disabled = true;
      if (msg) msg.textContent = buildRewardWindowMessage({ noReward:true, rank });
      return;
    }

    if (status.msg && /top\s+\d+/i.test(String(status.msg))) {
      btn.hidden = true;
      btn.disabled = true;
      if (msg) msg.textContent = friendlyLeaderboardMessage(status.msg, buildRewardWindowMessage({ noReward:true }));
      return;
    }

    btn.hidden = true;
    btn.disabled = true;
    if (msg) msg.textContent = friendlyLeaderboardMessage(status.msg, buildRewardWindowMessage());
  }

  function showDailyRewardToast(message, detail = ''){
    if (!message) return;
    if (typeof showStreakRewardToast === 'function') {
      showStreakRewardToast(message, detail);
    }
  }

  async function claimDailyReward(){
    const btn = document.getElementById('lbClaimBtn');
    const msg = document.getElementById('lbMsg');
    if (!btn || btn.disabled) return;

    const originalText = btn.textContent || 'Claim Now';
    btn.disabled = true;
    btn.textContent = 'Claiming...';

    try{
      const status = (window.rewardClaimState && typeof window.rewardClaimState === 'object') ? window.rewardClaimState : {};
      const claimDay = String(status.claim_day || '').trim();
      const claimUrl = claimDay
        ? `/api/reward_claim.php?day=${encodeURIComponent(claimDay)}&_=${Date.now()}`
        : `/api/reward_claim.php?_=${Date.now()}`;

      const data = await fetchJsonResilient(claimUrl, {
        method:'POST',
        cache:'no-store',
        credentials:'include',
        headers:{ 'X-Requested-With':'XMLHttpRequest' }
      });
      if (!(data && data.ok)) {
        const serverMessage = friendlyLeaderboardMessage(data && (data.msg || data.error), '');
        throw new Error(serverMessage || 'Could not claim reward.');
      }

      const granted = Math.max(0, parseInt(data.claimed_points, 10) || 0);
      const claimedDays = Math.max(1, parseInt(data.claimed_days, 10) || 0);
      const medals = data && data.medals ? data.medals : {};
      const medalTotal = (parseInt(medals.gold,10)||0) + (parseInt(medals.silver,10)||0) + (parseInt(medals.bronze,10)||0);
      const medalLine = medalTotal > 0 ? ` • ${medalTotal} medal${medalTotal === 1 ? '' : 's'}` : '';
      const pointLine = granted > 0 ? ` +${granted} points` : '';
      const claimedLabel = data && data.claim_day ? String(data.claim_day) : claimDay;

      if (typeof syncProfilePills === 'function') {
        try { await syncProfilePills(); } catch(e){}
      }

      const toastTitle = claimedDays > 1 ? `Claimed ${claimedDays} Daily rewards` : 'Reward claimed!';
      const toastBody = `${pointLine || ' Reward applied.'}${medalLine}`.trim();
      showDailyRewardToast(toastTitle, toastBody);

      window.lastRewardClaimResult = data;
      window.lastRewardClaimAt = Date.now();

      if (msg) {
        if (claimedDays > 1) {
          msg.textContent = granted > 0
            ? `Claimed ${claimedDays} Daily rewards: +${granted} points.${medalLine ? ' ' + medalLine.trim() : ''}`
            : `Claimed ${claimedDays} Daily rewards.`;
        } else {
          const label = claimedLabel || 'the previous day';
          msg.textContent = granted > 0
            ? `Reward claimed for ${label}: +${granted} points.${medalLine ? ' ' + medalLine.trim() : ''}`
            : `Reward processed for ${label}.`;
        }
      }

      try { await loadDailyHistoryStats(); } catch(e){}
      await openLeaderboardModal('daily');
    } catch(err) {
      const text = friendlyLeaderboardMessage(err && err.message, 'Could not claim reward.');
      if (msg) msg.textContent = text;
      showDailyRewardToast('Could not claim daily reward.', text);
    } finally {
      if (btn && !btn.hidden) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
  }

  function leaderboardRequiresLandscape(){
    try{
      return !!(window.matchMedia && window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches);
    }catch(e){
      return false;
    }
  }

  function closeLeaderboardModal(){
    const modal = document.getElementById("lbModal");
    if (!modal) return;
    modal.classList.remove("show");
    document.body.classList.remove("lb-open");
    try{ modal.removeAttribute("data-mode"); }catch(e){}
  }

  async function openLeaderboardModal(mode){
    const modal = document.getElementById("lbModal");
    if (!modal) return;
    if (leaderboardRequiresLandscape()) {
      showLeaderboardRotateToast(mode);
      return;
    }
    hideLeaderboardRotateToast();
    enableLeaderboardTableTouchScroll();
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    try{ modal.setAttribute("data-mode", mode === "rating" ? "rating" : "daily"); }catch(e){}
    document.body.classList.add("lb-open");
    modal.classList.add("show");
    requestAnimationFrame(() => { sizeLeaderboardTableWrap(); });
    try{ modal.scrollTop = 0; }catch(e){}
    try{
      const card = modal.querySelector(".lbCard");
      if (card) card.scrollTop = 0;
      const wrap = modal.querySelector(".lbTableWrap");
      if (wrap){
        wrap.scrollTop = 0;
        wrap.scrollLeft = 0;
        requestAnimationFrame(() => { sizeLeaderboardTableWrap(); });
      }
    }catch(e){}
    if (mode === "rating") await loadRatingLeaderboard();
    else {
      await loadDailyLeaderboard();
      try{
        const claimBtn = document.getElementById("lbClaimBtn");
        try{ if(!meCache){ meCache = await fetchJsonResilient("/api/me.php", { cache:"no-store", credentials:"include" }); } }catch{ meCache = null; }
        if (claimBtn){
          const rj = await fetchJsonResilient(`/api/reward_status.php?_=${Date.now()}`, {
            cache:"no-store",
            credentials:"include",
            headers:{ 'X-Requested-With':'XMLHttpRequest' }
          });
          window.rewardClaimState = rj;
          window.lastRewardStatusPayload = rj;
          const rewardLoggedIn = !!(rj && (rj.logged_in || rj.loggedIn));
          applyRewardClaimUi(rj, { loggedIn: rewardLoggedIn });
        }
      } catch (err) {
        try{
          const msg = document.getElementById("lbMsg");
          if (msg) msg.textContent = friendlyLeaderboardMessage(err && err.message, 'Could not load reward status.');
        }catch(e){}
      }
    }
  }

  function wireLeaderboardUi(){
    const lbBtn = document.getElementById("dailyLbBtn");
    const ratingBtn = document.getElementById("ratingLbBtn");
    const modal = document.getElementById("lbModal");
    const claimBtn = document.getElementById("lbClaimBtn");
    const closeBtn = document.getElementById("lbCloseBtn");
    const dailyTab = document.getElementById("lbDailyTab");
    const ratingTab = document.getElementById("lbRatingTab");
    if (!lbBtn || !modal || !closeBtn) return;
    if (claimBtn){
      claimBtn.onclick = (ev) => {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
        claimDailyReward().catch(() => {});
      };
    }
    lbBtn.onclick = async () => { await openLeaderboardModal("daily"); };
    if (ratingBtn) ratingBtn.onclick = async () => { await openLeaderboardModal("rating"); };
    const dailyRewardsInfoBtn = document.getElementById('dailyRewardsInfoBtn');
    if (dailyRewardsInfoBtn) dailyRewardsInfoBtn.onclick = () => { window.location.href = 'daily-rewards.html'; };
    if (dailyTab) dailyTab.onclick = async () => { await openLeaderboardModal("daily"); };
    if (ratingTab) ratingTab.onclick = async () => { await openLeaderboardModal("rating"); };
    closeBtn.onclick = () => {
      closeLeaderboardModal();
    };
    modal.addEventListener("click", (e)=>{
      if(e.target===modal){
        closeLeaderboardModal();
      }
    });
    const enforceLandscapeForWidePortrait = () => {
      if (!modal.classList.contains('show')) {
        syncLeaderboardRotateToast();
        return;
      }
      if (!leaderboardRequiresLandscape()) return;
      const activeMode = (modal.getAttribute('data-mode') === 'rating') ? 'rating' : 'daily';
      closeLeaderboardModal();
      showLeaderboardRotateToast(activeMode);
    };
    window.addEventListener('resize', () => { setTimeout(enforceLandscapeForWidePortrait, 60); }, { passive:true });
    window.addEventListener('orientationchange', () => { setTimeout(enforceLandscapeForWidePortrait, 120); }, { passive:true });
  }

    try{ wireLeaderboardUi(); }catch{}

})();
