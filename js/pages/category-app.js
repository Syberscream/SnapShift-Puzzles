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


  // Browser storage disabled here for progress authority; category state is query/hash/server-driven and server-backed.
  function lsGet(k){
    try { return null; } catch(e){ return null; }
  }
  function lsSet(k,v){
    try {} catch(e){}
  }

  async function fetchUnlockedMap(){ return window.SnapshiftPuzzleAccess.fetchUnlockedMap('/api/unlocked_get.php'); }

  
  function showSyncing(on){
    try{
      const d = document.getElementById("syncDot");
      if (!d) return;
      d.style.display = on ? "inline-block" : "none";
    }catch(e){}
  }
async function fetchPoints(){
    try{
      const r = await fetch("/api/points_get.php", { credentials:"include", cache:"no-store" });
      const j = await r.json();
      if (j && j.ok && j.loggedIn) return Math.max(0, Number(j.points||0) || 0);
    }catch(e){}
    return 0;
  }

  
  

  
  function applySupporterUi(supporter){
    const pill = document.getElementById("supporterPill");
    if (!pill) return;
    const active = !!(supporter && supporter.active);
    if (!active){
      pill.hidden = true;
      pill.setAttribute("aria-hidden", "true");
      pill.style.display = "none";
      pill.textContent = "★ Supporter";
      return;
    }
    const label = String((supporter && supporter.badgeLabel) || "Supporter").trim() || "Supporter";
    pill.textContent = `★ ${label}`;
    pill.hidden = false;
    pill.setAttribute("aria-hidden", "false");
    pill.style.display = "";
  }

  async function initAuthPill(){
    const el = document.getElementById("authPill");
    try{
      const r = await fetch("/api/me.php", { cache:"no-store", credentials:"include" });
      const j = await r.json();
      if (!el) {
        applySupporterUi((j && j.loggedIn && j.supporter) ? (j.supporter || null) : null);
        authLoggedIn = !!(j && j.loggedIn);
        return;
      }
      authLoggedIn = !!(j && j.loggedIn);
      if (j && j.loggedIn){
        const u = j.username || "Account";
        setRememberedUsername(u);
        el.textContent = `Signed in: ${u}`;
        el.href = "logout.php";
        el.title = "Sign out";
      } else {
        authLoggedIn = false;
        el.textContent = "Sign in";
        el.href = buildRememberedLoginHref("login.php");
        el.title = "Sign in";
      }
      applySupporterUi((j && j.loggedIn && j.supporter) ? (j.supporter || null) : null);
    } catch {
      authLoggedIn = false;
      if (el){
        el.textContent = "Sign in";
        el.href = buildRememberedLoginHref("login.php");
        el.title = "Sign in";
      }
      applySupporterUi(null);
    }
  }
  // =========================
  // Cloud Sync removed from category
  // Category is now server-authoritative for account-aware unlocks, points, and completion state.
  // Browser storage here is UI-only and not used as progress authority.
  // =========================

const GAME_URL = "game.html";
  const THEME_URL = "theme.json";
  const CATALOG_URL = "puzzles/index.json";


    const CATEGORIES = [
    { id:"animals", name:"Animals", desc:"Wildlife, pets, safari scenes.", tile:"category_tiles/animals.png" },
    { id:"architecture", name:"Architecture", desc:"Buildings, interiors, design.", tile:"category_tiles/architecture.png" },
    { id:"art", name:"Art", desc:"Paintings, illustrations, museums.", tile:"category_tiles/art.png" },
    { id:"cities", name:"Cities", desc:"Skylines, streets, downtown.", tile:"category_tiles/cities.png" },
    { id:"food", name:"Food", desc:"Meals, desserts, ingredients.", tile:"category_tiles/food.png" },
    { id:"fractals", name:"Fractals", desc:"Patterns, math art, abstractions.", tile:"category_tiles/fractals.png" },
    { id:"landscapes", name:"Landscapes", desc:"Fields, hills, scenic views.", tile:"category_tiles/landscapes.png" },
    { id:"marine", name:"Marine", desc:"Sea, boats, underwater worlds.", tile:"category_tiles/marine.png" },
    { id:"scifi", name:"SciFi", desc:"Futuristic worlds, tech, aliens.", tile:"category_tiles/scifi.png" },
    { id:"space", name:"Space", desc:"Planets, stars, nebulae.", tile:"category_tiles/space.png" },
    { id:"vehicles", name:"Vehicles", desc:"Cars, bikes, machines.", tile:"category_tiles/vehicles.png" },
    { id:"puzzles_of_the_day", name:"Puzzles of the Day", desc:"Daily featured picks.", tile:"category_tiles/puzzles_of_the_day.png" },
  ];

  const RELATED_CATEGORY_MAP = {
    animals: ['landscapes', 'marine', 'art', 'puzzles_of_the_day'],
    architecture: ['cities', 'art', 'landscapes', 'vehicles'],
    art: ['fractals', 'architecture', 'landscapes', 'scifi'],
    cities: ['architecture', 'vehicles', 'food', 'landscapes'],
    food: ['cities', 'art', 'animals', 'puzzles_of_the_day'],
    fractals: ['art', 'scifi', 'space', 'landscapes'],
    landscapes: ['animals', 'marine', 'cities', 'space'],
    marine: ['animals', 'landscapes', 'space', 'vehicles'],
    scifi: ['space', 'fractals', 'art', 'vehicles'],
    space: ['scifi', 'fractals', 'landscapes', 'marine'],
    vehicles: ['cities', 'architecture', 'scifi', 'marine'],
    puzzles_of_the_day: ['animals', 'landscapes', 'cities', 'scifi']
  };

  const title = document.getElementById("title");
  const subtitle = document.getElementById("subtitle");
  const grid = document.getElementById("grid");
  const countPill = document.getElementById("countPill");
  const unlockedPill = document.getElementById("unlockedPill");
  const pointsPill = document.getElementById("pointsPill");
  const filterAllBtn = document.getElementById("filterAllBtn");
  const filterUnlockedBtn = document.getElementById("filterUnlockedBtn");
  const filterLockedBtn = document.getElementById("filterLockedBtn");
  const paginationWrap = document.getElementById("paginationWrap");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageSelect = document.getElementById("pageSelect");
  const pageStatus = document.getElementById("pageStatus");
  const playBtn = document.getElementById("playBtn");
  const categoryTipsIntro = document.getElementById("categoryTipsIntro");
  const categoryTipsList = document.getElementById("categoryTipsList");
  const categoryFaqList = document.getElementById("categoryFaqList");
  const unlockModal = document.getElementById("unlockModal");
  const unlockPuzzleName = document.getElementById("unlockPuzzleName");
  const unlockCostValue = document.getElementById("unlockCostValue");
  const unlockPointsValue = document.getElementById("unlockPointsValue");
  const unlockAfterValue = document.getElementById("unlockAfterValue");
  const unlockMsg = document.getElementById("unlockMsg");
  const unlockCancelBtn = document.getElementById("unlockCancelBtn");
  const unlockConfirmBtn = document.getElementById("unlockConfirmBtn");

  const UNLOCK_COST_BASE = 60;
  const UNLOCK_COST_STEP = 25;
  let authLoggedIn = false;
  let pendingUnlockIndex = -1;


  function slugifyName(s){
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "puzzle";
  }

  function puzzlePageUrl(catId, puzzle){
    const slug = slugifyName(puzzle && puzzle.name ? puzzle.name : "");
    return `/puzzle/${encodeURIComponent(catId)}/${slug}.html`;
  }

  function hashParams(){
    const h = (location.hash || "").replace(/^#/, "");
    return new URLSearchParams(h);
  }

  function getCat(){
    const q = new URLSearchParams(location.search);
    const s = q.get("cat") || hashParams().get("cat") || "";
    return String(s || "").toLowerCase();
  }

  function applyCategoryShopBanner(t, bust){
    const wrap = document.getElementById('categoryShopBannerImage');
    const link = document.getElementById('categoryShopBannerImageLink');
    const img = document.getElementById('categoryShopBannerImageImg');
    if (!wrap || !link || !img) return;

    const enabled = (t.categoryShopBannerEnabled !== false);
    const src = String(t.categoryShopBannerImage ?? '/98bannerads12/Banner1.png').trim();
    const href = String(t.categoryShopBannerHref ?? '/shop.html').trim() || '/shop.html';
    const alt = String(t.categoryShopBannerAlt ?? 'Snapshift category shop banner').trim() || 'Snapshift category shop banner';

    if (!enabled || !src) {
      wrap.hidden = true;
      img.removeAttribute('src');
      return;
    }

    wrap.hidden = false;
    link.href = href;
    link.setAttribute('aria-label', alt);
    img.alt = alt;
    img.src = `${src}${src.includes('?') ? '&' : '?'}t=${bust}`;
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
      root.style.setProperty('--controlBg', pick('buttonBackgroundColor', 'rgba(11,18,32,0.88)'));
      root.style.setProperty('--controlBorder', pick('borderColor', 'rgba(42,57,82,0.95)'));
      root.style.setProperty('--controlText', pick('buttonTextColor', '#e8eef7'));
      root.style.setProperty('--controlBgAlt', pick('sectionBackgroundColor', 'rgba(18,28,48,0.92)'));
    }catch(e){}
  }

  async function applyThemeFromJson(){
    if (window.SnapshiftSiteTheme && typeof window.SnapshiftSiteTheme.load === "function"){
      try{
        await window.SnapshiftSiteTheme.load({
          url: THEME_URL,
          frogSelector: "#frogImg",
          onTheme: applyCategoryShopBanner,
        });
      } catch {}
      return;
    }
    try{
      const bust = Date.now();
      const r = await fetch(THEME_URL + "?t=" + bust, { cache:"no-store" });
      if (!r.ok) return;
      const t = await r.json();
      applyAdminThemeTokens(t);
      const enabled = !!t.themeEnabled;
      const alpha = Math.max(0, Math.min(1, Number(t.themeAlpha ?? 0.85)));
      document.body.classList.toggle("theme-on", enabled);
      document.documentElement.style.setProperty("--themeAlpha", String(alpha));
      document.documentElement.style.setProperty("--bgUrl", t.backgroundImage ? `url("${t.backgroundImage}?t=${bust}")` : "none");
      const frog = document.getElementById("frogImg");
      if (frog) {
        if (t.frogImage) {
          frog.src = `${t.frogImage}${String(t.frogImage).includes('?') ? '&' : '?'}t=${bust}`;
          frog.style.removeProperty("display");
        } else {
          frog.removeAttribute("src");
          frog.style.display = "none";
        }
      }
      applyCategoryShopBanner(t, bust);
    } catch {}
  }

  async function loadCatalog(){
    const url = CATALOG_URL + (CATALOG_URL.includes("?") ? "&" : "?") + "t=" + Date.now();
    const res = await fetch(url, { cache:"no-store" });
    if (!res.ok) throw new Error("catalog missing");
    const data = await res.json();

    const srcObj =
      (data && data.categories && typeof data.categories === "object") ? data.categories :
      (data && data.catalog && typeof data.catalog === "object") ? data.catalog :
      null;

    if (!srcObj) throw new Error("bad catalog format");

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
    return next;
  }

  let CAT_ID = "";
  let LIST = [];
  let FULL_CATALOG = null;
  let VIEW = [];
  let activeFilter = "all";
  let unlockedCount = 1;
  let unlockedRecord = { version: 2, unlockedSrcs: [], updatedAt: "" };
  let unlockedSrcSet = new Set();
  let nextUnlockIdx = 0;
  let categoryServerCardStates = new Map();
  let categoryServerCategoryStates = new Map();
  let categoryCardStateFetchPromise = null;
  let currentPage = 1;
  const PAGE_SIZE = 16;

  const COMPLETION_DIFF_ORDER = ["hard", "medium", "easy"];
  let completionAuthKnown = false;
  let completionAuthLoggedIn = false;
  const categoryCompletionCache = new Map();
  let categoryBadgeRunId = 0;
  let categoryRefreshSeq = 0;
  let categoryRefreshTimers = [];
  let categoryBadgeTimers = [];

  function normalizeCatId(v){ return window.SnapshiftPuzzleAccess.normalizeCatId(v); }

  function normalizeUnlockSrc(src){ return window.SnapshiftPuzzleAccess.normalizeSrc(src); }

  function categoryCardStateKey(categoryId, puzzleIdx, puzzleSrc = ""){
    const cleanSrc = normalizePuzzleSrcIdentity(puzzleSrc);
    return cleanSrc ? `src:${cleanSrc}` : `idx:${normalizeCatId(categoryId)}:${Math.max(0, Number(puzzleIdx) || 0)}`;
  }

  function bustCategoryCardStateCache(){
    categoryServerCardStates = new Map();
    categoryServerCategoryStates = new Map();
    categoryCardStateFetchPromise = null;
  }

  function setCategoryCardStatePayload(payload){
    const nextByCard = new Map();
    const nextByCategory = new Map();
    const byCard = payload && payload.byCard && typeof payload.byCard === 'object' ? payload.byCard : null;
    const byCategory = payload && payload.byCategory && typeof payload.byCategory === 'object' ? payload.byCategory : null;
    if (byCard) Object.keys(byCard).forEach((key) => { if (byCard[key]) nextByCard.set(key, byCard[key]); });
    if (byCategory) Object.keys(byCategory).forEach((key) => { if (byCategory[key]) nextByCategory.set(key, byCategory[key]); });
    categoryServerCardStates = nextByCard;
    categoryServerCategoryStates = nextByCategory;
    categoryCardStateFetchPromise = null;
    const catState = getCategoryServerCategoryState(CAT_ID);
    if (catState) {
      unlockedCount = Math.max(1, Number(catState.unlockedCount) || unlockedCount || 1);
      nextUnlockIdx = Math.max(0, Number(catState.nextLockedIdx) || nextUnlockIdx || 0);
    }
    return { byCard: categoryServerCardStates, byCategory: categoryServerCategoryStates };
  }

  function getCategoryServerCardState(categoryId, puzzleIdx, puzzleSrc){
    return categoryServerCardStates.get(categoryCardStateKey(categoryId, puzzleIdx, puzzleSrc)) || null;
  }

  function getCategoryServerCategoryState(categoryId){
    return categoryServerCategoryStates.get(normalizeCatId(categoryId)) || null;
  }

  function buildSourceUnlockRecord(raw, items){
    const built = window.SnapshiftPuzzleAccess.buildRecord(raw, items);
    return { record: built.record, set: built.set };
  }

  function getPuzzleListIndex(puzzle){
    const wanted = normalizeUnlockSrc(puzzle && puzzle.src);
    if (!wanted) return -1;
    return LIST.findIndex((item) => normalizeUnlockSrc(item && item.src) === wanted);
  }

  function syncUnlockedStateFromMap(unlockedMap){
    const state = window.SnapshiftPuzzleAccess.buildState(unlockedMap, CAT_ID, LIST);
    unlockedRecord = state.record;
    unlockedSrcSet = state.set;
    unlockedCount = state.unlockedCount;
    nextUnlockIdx = state.nextLockedIdx;
    return { record: state.record, set: state.set };
  }

  function isPuzzleUnlocked(puzzle){ return window.SnapshiftPuzzleAccess.isUnlockedSrc(unlockedSrcSet, puzzle && puzzle.src); }

  async function fetchCategoryCardStates(force = false){
    if (!force && categoryServerCardStates.size && categoryServerCategoryStates.size) {
      return { byCard: categoryServerCardStates, byCategory: categoryServerCategoryStates };
    }
    if (!force && categoryCardStateFetchPromise) return categoryCardStateFetchPromise;

    categoryCardStateFetchPromise = (async () => {
      try{
        const categories = {};
        categories[CAT_ID] = LIST.map((item, idx) => ({
          src: String(item && item.src || ''),
          puzzleIdx: Math.max(0, Number(item && item.puzzleIdx != null ? item.puzzleIdx : idx) || 0)
        }));
        const cards = categories[CAT_ID].map((item) => ({
          categoryId: CAT_ID,
          puzzleIdx: Math.max(0, Number(item.puzzleIdx) || 0),
          puzzleSrc: String(item.src || '')
        }));
        const r = await fetch('/api/puzzle_card_state_get.php', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categories, cards })
        });
        const j = await r.json().catch(() => null);
        if (j && j.ok && j.loggedIn) return setCategoryCardStatePayload(j);
        categoryServerCardStates = new Map();
        categoryServerCategoryStates = new Map();
        return { byCard: categoryServerCardStates, byCategory: categoryServerCategoryStates };
      }catch(e){
        if (!categoryServerCardStates.size) categoryServerCardStates = new Map();
        if (!categoryServerCategoryStates.size) categoryServerCategoryStates = new Map();
        return { byCard: categoryServerCardStates, byCategory: categoryServerCategoryStates };
      } finally {
        categoryCardStateFetchPromise = null;
      }
    })();

    return categoryCardStateFetchPromise;
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

  function completionCacheKey(categoryId, puzzleIdx, puzzleSrc = ""){
    const cat = String(categoryId || "").trim().toLowerCase();
    const src = normalizePuzzleSrcIdentity(puzzleSrc);
    return src ? `${cat}::src::${src}` : `${cat}::idx::${Math.max(0, Number(puzzleIdx) || 0)}`;
  }

  function bustCategoryCompletionCache(){
    categoryCompletionCache.clear();
    bustCategoryCardStateCache();
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
    }catch(e){
      completionAuthKnown = true;
      completionAuthLoggedIn = false;
    }
    return completionAuthLoggedIn;
  }

  async function fetchCompletedStatusForPuzzle(categoryId, puzzleIdx, puzzleSrc = "", opts = {}){
    const cacheKey = completionCacheKey(categoryId, puzzleIdx, puzzleSrc);
    if (!opts.force && categoryCompletionCache.has(cacheKey)) return categoryCompletionCache.get(cacheKey);

    const loggedIn = await ensureCompletionAuth(!!opts.force);
    if (!loggedIn) {
      categoryCompletionCache.set(cacheKey, null);
      return null;
    }

    const cleanCat = normalizeCatId(categoryId);
    const idx = Math.max(0, Number(puzzleIdx) || 0);
    const cleanSrc = normalizePuzzleSrcIdentity(puzzleSrc);
    const serverState = getCategoryServerCardState(cleanCat, idx, cleanSrc);
    const serverStatus = completionStatusFromSummary(serverState && serverState.completion);
    if (serverStatus) {
      categoryCompletionCache.set(cacheKey, serverStatus);
      return serverStatus;
    }

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
          const rating = normalizeCompletionRating(getDisplayRatingFromProgress(progress));
          const result = {
            completed:true,
            diffKey:String(progress.diffKey || diffKey || "easy"),
            diffLabel:getDiffLabelForBadge(progress.diffKey || diffKey || "easy"),
            rating,
            badge: normalizeCompletionBadge(null, progress.diffKey || diffKey || "easy", rating)
          };
          if (!best || completionAchievementRank(result) > completionAchievementRank(best)) best = result;
        }
      }catch(e){}
    }

    categoryCompletionCache.set(cacheKey, best || null);
    return best || null;
  }

  function completionStatusFromSummary(summary){
    if (!(summary && summary.completed)) return null;
    const rating = normalizeCompletionRating(summary.rating || getDisplayRatingFromProgress(summary));
    return {
      completed: true,
      diffKey: String(summary.diffKey || "easy"),
      diffLabel: String(summary.diffLabel || getDiffLabelForBadge(summary.diffKey || "easy")),
      rating,
      badge: normalizeCompletionBadge(summary.badge, summary.diffKey || "easy", rating)
    };
  }

  function getDiffLabelForBadge(diffKey){
    const key = String(diffKey || "easy").toLowerCase();
    if (key === "hard") return "Hard";
    if (key === "medium") return "Medium";
    return "Easy";
  }

  function buildCompletionStarsText(stars){
    const count = Math.max(0, Math.floor(Number(stars) || 0));
    return "&#9733;".repeat(count) + "&#9734;".repeat(Math.max(0, 3 - count));
  }

  function normalizeCompletionRating(rating){
    if (!rating || typeof rating !== "object") return null;
    const stars = Math.max(0, Math.floor(Number(rating.stars) || 0));
    return {
      stars,
      label: String(rating.label || "").trim(),
      key: String(rating.key || "").trim().toLowerCase(),
      scorePct: Math.max(0, Math.floor(Number(rating.scorePct) || 0)),
      moveEffPct: Math.max(0, Math.floor(Number(rating.moveEffPct) || 0)),
      speedEffPct: Math.max(0, Math.floor(Number(rating.speedEffPct) || 0)),
      starsText: String(rating.starsText || buildCompletionStarsText(stars))
    };
  }

  function normalizeCompletionBadge(badge, diffKey, rating){
    const diffLabel = String(badge && badge.diffLabel || getDiffLabelForBadge(diffKey));
    const stars = Math.max(0, Number(rating && rating.stars) || 0);
    const scorePct = Math.max(0, Number(rating && rating.scorePct) || 0);
    const medalLabel = String(badge && badge.medalLabel || rating && rating.label || "").trim();
    return {
      completedLabel: String(badge && badge.completedLabel || "Completed"),
      diffLabel,
      completedTitle: String(badge && badge.completedTitle || `Completed (${diffLabel})`),
      medalLabel,
      medalKey: String(badge && badge.medalKey || rating && rating.key || "").trim().toLowerCase(),
      medalTitle: String(badge && badge.medalTitle || (medalLabel ? `${medalLabel} - ${stars} star${stars === 1 ? "" : "s"} - ${scorePct}% performance` : ""))
    };
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
        starsText: buildCompletionStarsText(stars)
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
      starsText: buildCompletionStarsText(stars)
    };
  }

  function completionAchievementRank(status){
    if (!status || !status.completed) return -1;
    const diffWeight = status.diffKey === "hard" ? 30 : (status.diffKey === "medium" ? 20 : 10);
    const starsWeight = status.rating ? Number(status.rating.stars || 0) : 0;
    return diffWeight + starsWeight;
  }

function clearCategoryCompletionBadges(){
    document.querySelectorAll('.statusBadges[data-role="completion"], .trifectaBadgeHost[data-role="trifecta"]').forEach(el => { el.replaceChildren(); });
  }

  function scheduleCategoryBadgeRefresh(opts = {}){
    try{ categoryBadgeTimers.forEach(id => clearTimeout(id)); }catch(e){}
    categoryBadgeTimers = [];
    const delays = Array.isArray(opts.delays) && opts.delays.length ? opts.delays : [0, 300, 900, 1800];
    delays.forEach((delay, idx) => {
      const id = setTimeout(() => {
        if (opts.force && idx === 0) bustCategoryCompletionCache();
        applyCategoryCompletionBadges({ force: !!opts.force }).catch(()=>{});
      }, Math.max(0, Number(delay) || 0));
      categoryBadgeTimers.push(id);
    });
  }

  async function applyCategoryCompletionBadges(opts = {}){
    const cards = Array.from(document.querySelectorAll('.puz[data-cat-id][data-puzzle-idx]'));
    if (!cards.length) return;

    const runId = ++categoryBadgeRunId;
    await fetchCategoryCardStates(!!opts.force);
    const loggedIn = await ensureCompletionAuth(!!opts.force);
    if (runId !== categoryBadgeRunId) return;
    if (!loggedIn) {
      clearCategoryCompletionBadges();
      return;
    }

    await Promise.all(cards.map(async (card) => {
      const badgeHost = card.querySelector('.statusBadges[data-role="completion"]');
      const trifectaHost = card.querySelector('.trifectaBadgeHost[data-role="trifecta"]');
      if (!badgeHost) return;

      const catId = normalizeCatId(card.dataset.catId || CAT_ID || '');
      const puzzleIdx = Math.max(0, Number(card.dataset.puzzleIdx) || 0);
      const puzzleSrc = String(card.dataset.puzzleSrc || '');
      const serverState = getCategoryServerCardState(catId, puzzleIdx, puzzleSrc);
      const locked = serverState ? !!serverState.locked : !isPuzzleUnlocked({ src: puzzleSrc });
      const nodes = [];

      if (locked) {
        if (runId === categoryBadgeRunId) badgeHost.replaceChildren(...nodes);
        if (runId === categoryBadgeRunId && trifectaHost) trifectaHost.replaceChildren();
        return;
      }

      if (trifectaHost) {
        const trifecta = serverState && serverState.trifecta && serverState.trifecta.completed ? serverState.trifecta : null;
        if (trifecta) {
          const trifectaBadge = document.createElement('span');
          trifectaBadge.className = 'trifectaBadge';
          trifectaBadge.textContent = '★';
          trifectaBadge.title = 'Trifecta complete: Easy, Medium, and Hard';
          trifectaBadge.setAttribute('aria-label', 'Trifecta complete: Easy, Medium, and Hard');
          trifectaHost.replaceChildren(trifectaBadge);
        } else {
          trifectaHost.replaceChildren();
        }
      }

      let status = null;
      status = completionStatusFromSummary(serverState && serverState.completion);
      if (!status) {
        status = await fetchCompletedStatusForPuzzle(catId, puzzleIdx, puzzleSrc, opts);
      }
      if (runId !== categoryBadgeRunId) return;

      if (status && status.completed) {
        const completedLabel = String(status.badge && status.badge.completedLabel || "Completed");
        const diffLabel = String(status.badge && status.badge.diffLabel || getDiffLabelForBadge(status.diffKey));
        const badge = document.createElement('span');
        badge.className = 'statusBadge';
        badge.title = String(status.badge && status.badge.completedTitle || `Completed (${diffLabel})`);
        badge.innerHTML = `<span>${completedLabel}</span><span class="statusDiff">${diffLabel}</span>`;
        nodes.push(badge);

        if (status.rating) {
          const medalLabel = String(status.badge && status.badge.medalLabel || status.rating.label || "");
          const medalBadge = document.createElement('span');
          medalBadge.className = `statusBadge isMedal is${medalLabel || status.rating.label}`;
          medalBadge.title = String(status.badge && status.badge.medalTitle || `${status.rating.label} - ${status.rating.stars} star${status.rating.stars === 1 ? '' : 's'} - ${status.rating.scorePct}% performance`);
          medalBadge.innerHTML = `<span class="statusStars">${status.rating.starsText}</span><span class="statusDiff">${medalLabel || status.rating.label}</span>`;
          nodes.push(medalBadge);
        }
      }

      if (runId === categoryBadgeRunId) badgeHost.replaceChildren(...nodes);
    }));
  }

  function scheduleCategoryRefresh(options = {}){
    try{ categoryRefreshTimers.forEach(id => clearTimeout(id)); }catch(e){}
    categoryRefreshTimers = [];
    const delays = Array.isArray(options.delays) && options.delays.length ? options.delays : [0, 450, 1400];
    delays.forEach((delay, idx) => {
      const id = setTimeout(() => {
        refreshFromServer({ force: !!options.force && idx === 0, resetBadges: true, preserveUnlocked: true }).catch(() => {});
      }, Math.max(0, Number(delay) || 0));
      categoryRefreshTimers.push(id);
    });
  }

  function filterList(list, mode){
    const items = Array.isArray(list) ? list.slice() : [];
    if (mode === "unlocked"){
      return items.filter((p) => isPuzzleUnlocked(p));
    }
    if (mode === "locked"){
      return items.filter((p) => !isPuzzleUnlocked(p));
    }
    return items;
  }

  function updateCategoryFilterButtons(){
    const map = {
      all: filterAllBtn,
      unlocked: filterUnlockedBtn,
      locked: filterLockedBtn
    };
    Object.entries(map).forEach(([mode, btn]) => {
      if (!btn) return;
      const active = mode === activeFilter;
      btn.classList.toggle("isActive", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyCategoryFilter(mode, reset = true){
    activeFilter = ["all", "unlocked", "locked"].includes(String(mode || "").toLowerCase())
      ? String(mode).toLowerCase()
      : "all";
    VIEW = filterList(LIST, activeFilter);
    if (reset) currentPage = 1;
    updateCategoryFilterButtons();
    completionAuthKnown = false;
    bustCategoryCompletionCache();
    render(reset);
  }

  function unlockCostFor(nextIdx){
    return Math.max(0, Math.floor(UNLOCK_COST_BASE + (UNLOCK_COST_STEP * Math.max(0, Number(nextIdx) || 0))));
  }

  async function applyCategoryUnlockToServer(idx){
    const puzzle = LIST[idx] || null;
    const items = LIST.map((item, itemIdx) => ({
      src: String(item && item.src || ''),
      puzzleIdx: Math.max(0, Number(item && item.puzzleIdx != null ? item.puzzleIdx : itemIdx) || 0)
    }));
    return window.SnapshiftUnlockClient.submitUnlockRequest({
      category_id: CAT_ID,
      puzzle_idx: Math.max(0, Number(idx) || 0),
      puzzle_src: String(puzzle && puzzle.src || ''),
      items
    });
  }

  function closeUnlockModal(){
    pendingUnlockIndex = -1;
    if (!unlockModal) return;
    unlockModal.classList.remove("show");
    unlockModal.setAttribute("aria-hidden", "true");
    if (unlockMsg){ unlockMsg.textContent = ""; unlockMsg.className = "unlockMsg"; }
    if (unlockConfirmBtn) unlockConfirmBtn.disabled = false;
  }

  async function openUnlockModal(puzzle, idx){
    if (!unlockModal) return;
    if (!authLoggedIn){
      alert("Please sign in to unlock puzzles with points.");
      window.location.href = buildRememberedLoginHref("login.php");
      return;
    }
    const nextLockedIdx = Math.max(0, Number(nextUnlockIdx) || 0);
    if (idx > nextLockedIdx){
      alert(`Unlock puzzle #${nextLockedIdx + 1} first.`);
      return;
    }
    pendingUnlockIndex = idx;
    const cost = unlockCostFor(idx);
    let pts = Math.max(0, Number((String(pointsPill.textContent || "").match(/(\d+)/) || [])[1] || 0) || 0);
    const freshPts = await fetchPoints();
    if (Number.isFinite(freshPts)) pts = Math.max(0, Number(freshPts) || 0);
    updateTopBar(pts);
    unlockPuzzleName.textContent = puzzle && puzzle.name ? puzzle.name : `Puzzle #${idx + 1}`;
    unlockCostValue.textContent = `${cost} points`;
    unlockPointsValue.textContent = `${pts}`;
    unlockAfterValue.textContent = `${Math.max(0, pts - cost)} left`;
    unlockMsg.textContent = pts < cost ? `You need ${cost - pts} more points to unlock this puzzle.` : "Unlocking opens this puzzle immediately in the category list.";
    unlockMsg.className = `unlockMsg ${pts < cost ? 'error' : 'ok'}`;
    unlockConfirmBtn.disabled = pts < cost;
    unlockModal.classList.add("show");
    unlockModal.setAttribute("aria-hidden", "false");
  }

  async function confirmUnlock(){
    if (pendingUnlockIndex < 0) return;
    const idx = pendingUnlockIndex;
    const puzzle = LIST[idx] || null;
    const cost = unlockCostFor(idx);
    unlockConfirmBtn.disabled = true;
    unlockMsg.textContent = "Unlocking…";
    unlockMsg.className = "unlockMsg";

    try{
      const freshPts = await fetchPoints();
      const pointsNow = Math.max(0, Number(freshPts) || 0);
      if (pointsNow < cost){
        updateTopBar(pointsNow);
        unlockPointsValue.textContent = `${pointsNow}`;
        unlockAfterValue.textContent = `${Math.max(0, pointsNow - cost)} left`;
        unlockMsg.textContent = `You need ${cost - pointsNow} more points to unlock this puzzle.`;
        unlockMsg.className = "unlockMsg error";
        unlockConfirmBtn.disabled = false;
        return;
      }

      const result = await applyCategoryUnlockToServer(idx);
      const outcome = await window.SnapshiftUnlockClient.resolveUnlockOutcome(result, {
        refresh: () => refreshFromServer({ force:true }),
        isUnlocked: () => {
          const serverState = getCategoryServerCardState(CAT_ID, idx, puzzle && puzzle.src || "");
          return serverState ? !serverState.locked : isPuzzleUnlocked(puzzle);
        }
      });
      if (!outcome.ok) {
        unlockMsg.textContent = outcome.msg;
        unlockMsg.className = "unlockMsg error";
        if (result && typeof result.points === "number") {
          const nextPoints = Math.max(0, Number(result.points) || 0);
          updateTopBar(nextPoints);
          unlockPointsValue.textContent = `${nextPoints}`;
          unlockAfterValue.textContent = `${Math.max(0, nextPoints - cost)} left`;
        }
        unlockConfirmBtn.disabled = false;
        return;
      }

      if (result && result.ok && result.loggedIn) {
        syncUnlockedStateFromMap(result.unlocked || {});
        setCategoryCardStatePayload(result);
        updateTopBar(Math.max(0, Number(result.points) || 0));
      } else {
        const refreshedPoints = await fetchPoints();
        updateTopBar(Math.max(0, Number(refreshedPoints) || 0));
      }
      unlockMsg.textContent = "Puzzle unlocked.";
      unlockMsg.className = "unlockMsg ok";
      setTimeout(() => {
        closeUnlockModal();
        refreshFromServer({ force:true }).catch(() => {});
      }, 280);
    }catch(e){
      await refreshFromServer({ force:true }).catch(() => {});
      const serverState = getCategoryServerCardState(CAT_ID, idx, puzzle && puzzle.src || "");
      const unlockedNow = serverState ? !serverState.locked : isPuzzleUnlocked(puzzle);
      if (unlockedNow) {
        unlockMsg.textContent = "Puzzle unlocked.";
        unlockMsg.className = "unlockMsg ok";
        setTimeout(() => {
          closeUnlockModal();
        }, 280);
        return;
      }
      unlockMsg.textContent = "Could not unlock this puzzle right now.";
      unlockMsg.className = "unlockMsg error";
      unlockConfirmBtn.disabled = false;
      try{ console.error("confirmUnlock failed", e); }catch(_){}
    }
  }

  function fmtCount(n){
    return n === 1 ? "1 puzzle" : `${n} puzzles`;
  }

  function pageCount(){
    return Math.max(1, Math.ceil(Math.max(0, VIEW.length) / PAGE_SIZE));
  }

  function syncPaginationControls(){
    const totalPages = pageCount();
    currentPage = Math.min(Math.max(1, Math.floor(Number(currentPage) || 1)), totalPages);
    if (paginationWrap) paginationWrap.hidden = VIEW.length <= PAGE_SIZE;
    if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
    if (pageStatus) pageStatus.textContent = `Page ${currentPage} of ${totalPages}`;
    if (pageSelect) {
      const wanted = String(currentPage);
      if (pageSelect.options.length !== totalPages) {
        pageSelect.replaceChildren();
        for (let i = 1; i <= totalPages; i++) {
          const opt = document.createElement("option");
          opt.value = String(i);
          opt.textContent = `${i}`;
          pageSelect.appendChild(opt);
        }
      }
      pageSelect.value = wanted;
      pageSelect.disabled = totalPages <= 1;
    }
  }

  function setCategoryPage(page, scrollToGrid = true){
    const totalPages = pageCount();
    const nextPage = Math.min(Math.max(1, Math.floor(Number(page) || 1)), totalPages);
    if (nextPage === currentPage) {
      syncPaginationControls();
      return;
    }
    currentPage = nextPage;
    render(false);
    if (scrollToGrid) {
      try{ grid.scrollIntoView({ behavior:"smooth", block:"start" }); }catch(e){}
    }
  }

  function render(reset=false){
    if (reset) currentPage = 1;
    grid.innerHTML = "";
    syncPaginationControls();

    const start = (currentPage - 1) * PAGE_SIZE;
    const end = Math.min(VIEW.length, start + PAGE_SIZE);

    for (let idx = start; idx < end; idx++){
      const p = VIEW[idx];
      const canonicalIdx = Math.max(0, Number(p && p.puzzleIdx != null ? p.puzzleIdx : idx) || 0);
      const orderIdx = getPuzzleListIndex(p);
      const serverState = getCategoryServerCardState(CAT_ID, canonicalIdx, p && p.src || "");
      const locked = serverState ? !!serverState.locked : !isPuzzleUnlocked(p);

      const tagName = locked ? "div" : "a";
      const card = document.createElement(tagName);
      const seoUrl = puzzlePageUrl(CAT_ID, p);
      card.className = "puz" + (locked ? " locked" : "");
      card.dataset.catId = CAT_ID;
      card.dataset.puzzleIdx = String(canonicalIdx);
      card.dataset.puzzleSrc = String(p && p.src || '');
      if (!locked){
        card.href = seoUrl;
        card.setAttribute("data-seo-url", seoUrl);
      }
      const canUnlockThis = locked && (serverState ? !!serverState.actionableUnlock : orderIdx === nextUnlockIdx);
      const lockMarkup = locked
        ? (canUnlockThis
          ? `<button class="lockBadge isActionable" type="button" aria-label="Unlock puzzle" title="Unlock puzzle">🔒</button>`
          : `<div class="lockBadge isPassive" aria-hidden="true" title="Locked">🔒</div>`)
        : ``;
      card.innerHTML = `
        <div class="thumb"><img loading="lazy" src="${p.src}" alt="${p.name}"></div>
        <div class="body">
          <div class="name">${p.name}</div>
          <div class="meta"><span>#${canonicalIdx + 1}</span><span>${locked ? "Locked" : "Play →"}</span></div>
        </div>
        <div class="statusBadges" data-role="completion"></div>
        <div class="trifectaBadgeHost" data-role="trifecta"></div>
        ${lockMarkup}
      `;

      card.querySelector("img").addEventListener("error", () => {
        card.querySelector(".thumb").innerHTML =
          `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:950;opacity:.85;">Preview</div>`;
      });

      const lockBtn = card.querySelector('.lockBadge.isActionable');
      if (lockBtn){
        lockBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          openUnlockModal(p, orderIdx).catch(() => {});
        });
      }

      card.addEventListener("click", (ev) => {
        if (locked){
          ev.preventDefault();
          if (canUnlockThis) openUnlockModal(p, orderIdx).catch(() => {});
          else alert(`Unlock puzzle #${Math.max(1, nextUnlockIdx + 1)} first.`);
          return;
        }
        if (ev.defaultPrevented) return;
        if (ev.button === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey) {
          ev.preventDefault();
          window.location.href = seoUrl;
        }
      });

      grid.appendChild(card);

    }

    syncPaginationControls();
    countPill.textContent = (activeFilter === "all")
      ? `Puzzles: ${LIST.length}`
      : `Showing: ${VIEW.length} / ${LIST.length}`;
    const serverCategoryState = getCategoryServerCategoryState(CAT_ID);
    const visibleUnlocked = serverCategoryState
      ? Math.min(Math.max(1, Number(serverCategoryState.unlockedCount) || 1), LIST.length)
      : Math.min(unlockedSrcSet.size || (LIST.length ? 1 : 0), LIST.length);
    unlockedPill.textContent = `Unlocked: ${visibleUnlocked} / ${LIST.length}`;
    const filterHint = activeFilter === "locked"
      ? "Showing locked puzzles in progression order."
      : (activeFilter === "unlocked"
          ? "Showing unlocked puzzles only."
          : `Tap an unlocked puzzle to play. ${fmtCount(LIST.length)} total.`);
    subtitle.textContent = LIST.length ? filterHint : "No puzzles found in this category.";
    scheduleCategoryBadgeRefresh({ force:false, delays:[0, 250, 700] });
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

  function categoryBrowseUrl(catId){
    return `/category.html?cat=${encodeURIComponent(String(catId || '').trim().toLowerCase())}`;
  }

  function sentenceCaseText(value){
    const raw = String(value || '').trim();
    if (!raw) return '';
    const clean = raw.replace(/\s+/g, ' ').replace(/\.+$/,'').trim();
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) + '.' : '';
  }


  function getCategoryTips(catId, catMeta){
    const name = String((catMeta && catMeta.name) || catId || 'this category');
    const lower = name.toLowerCase();
    const tips = {
      animals: [
        'Start with faces, eyes, and strong fur patterns before working outward.',
        'Use high-contrast markings like stripes, feathers, or whiskers as anchor pieces.',
        'Background foliage usually becomes easier once the main animal is established.'
      ],
      architecture: [
        'Straight lines, windows, and roof edges are the fastest anchors on architectural puzzles.',
        'Look for repeated patterns in brick, glass, and lighting to build sections quickly.',
        'Finish sky or neutral wall areas after the strongest structural lines are in place.'
      ],
      art: [
        'Group bold color regions first, then refine with brush details and edge transitions.',
        'Look for signature shapes or focal subjects before tackling abstract background areas.',
        'Art puzzles often reward color matching more than strict edge hunting.'
      ],
      cities: [
        'Skylines, roads, and bright signage make strong starting points in city scenes.',
        'Repeated windows and reflections can be grouped before you place them precisely.',
        'Separate foreground details from background buildings early to reduce confusion.'
      ],
      food: [
        'Start with plates, bowls, and strong ingredient colors to build the main composition.',
        'Textures like crusts, fruit, or garnish often connect faster than neutral table surfaces.',
        'Highlights and shadows around serving edges help lock pieces into place.'
      ],
      fractals: [
        'Work from the most distinct repeating shape rather than trying to solve the whole pattern at once.',
        'Symmetry and mirrored color changes are often the best clues in fractal puzzles.',
        'Build small repeating clusters and combine them once the pattern becomes clearer.'
      ],
      landscapes: [
        'Use the horizon, treeline, or mountain edges as your first anchor.',
        'Large sky and water areas are easier after distinct land features are placed.',
        'Color gradients matter more than small object detail in many landscape scenes.'
      ],
      marine: [
        'Pick out boats, fins, coral, or shoreline edges before tackling open water.',
        'Water reflections and wave patterns usually group best by color and brightness.',
        'Separate underwater detail from surface textures early when the scene is busy.'
      ],
      scifi: [
        'Glowing tech, ships, and strong silhouettes usually form the best starting cluster.',
        'Use repeated panels, lights, and interface lines to organize puzzle regions.',
        'Nebula or atmospheric effects are easier after the main sci-fi subject is established.'
      ],
      space: [
        'Start with planets, moons, or spacecraft before working through star fields.',
        'Strong glow edges and nebula color clouds help break the scene into manageable zones.',
        'Dark open space often makes more sense once the bright focal object is complete.'
      ],
      vehicles: [
        'Wheels, headlights, and body outlines are the quickest anchors in vehicle puzzles.',
        'Reflections across paint or glass usually connect better after the main shape is built.',
        'Keep background pavement or scenery for later once the vehicle silhouette is stable.'
      ],
      puzzles_of_the_day: [
        'Daily puzzles vary, so begin with the strongest focal object instead of assuming one fixed strategy.',
        'Use the filter and archive tools when you want a break from the featured daily pace.',
        'If a daily style feels tricky, category browsing is a good way to practice similar scenes.'
      ]
    };
    return {
      intro: `These quick tips make ${lower} puzzles easier to read at a glance and help you settle into the category faster.`,
      items: tips[catId] || [
        `Start with the most distinct focal point in this ${lower} image set.`,
        'Use repeated colors and shapes to group likely neighbors before fine adjustments.',
        'Come back to the Daily Challenge when you want one featured puzzle instead of full browsing.'
      ]
    };
  }

  function getCategoryFaq(catId, catMeta){
    const name = String((catMeta && catMeta.name) || catId || 'this category');
    const lower = name.toLowerCase();
    return [
      {
        q: `Do I need an account to play ${lower} puzzles?`,
        a: `No. You can start playing right away. An account mainly helps with saved progress, medals, and category history.`
      },
      {
        q: `How is the ${name} page different from the Daily Challenge?`,
        a: `This page lets you browse ${lower} puzzles at your own pace, while the Daily Challenge gives you one featured puzzle each day with its own streak and leaderboard flow.`
      },
      {
        q: `Can I unlock more ${lower} puzzles with points?`,
        a: `Yes. Locked puzzles can be opened with points as you move through the category progression.`
      }
    ];
  }

  function renderCategoryGuideSections(catMeta){
    const tips = getCategoryTips(CAT_ID, catMeta);
    if (categoryTipsIntro) categoryTipsIntro.textContent = tips.intro;
    if (categoryTipsList) {
      categoryTipsList.innerHTML = '';
      tips.items.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        categoryTipsList.appendChild(li);
      });
    }
    if (categoryFaqList) {
      const faqItems = getCategoryFaq(CAT_ID, catMeta);
      categoryFaqList.innerHTML = '';
      faqItems.forEach((entry) => {
        const wrap = document.createElement('div');
        wrap.className = 'categoryFaqItem';
        const strong = document.createElement('strong');
        strong.textContent = entry.q;
        const p = document.createElement('p');
        p.textContent = entry.a;
        wrap.appendChild(strong);
        wrap.appendChild(p);
        categoryFaqList.appendChild(wrap);
      });
    }
  }

  function buildCategoryIntroText(catMeta){
    const name = String((catMeta && catMeta.name) || title.textContent || CAT_ID || 'this');
    const lowerName = name.toLowerCase();
    const count = Math.max(0, Number(Array.isArray(LIST) ? LIST.length : 0) || 0);
    const desc = sentenceCaseText(catMeta && catMeta.desc);
    if (count > 0){
      return `Explore ${count} free ${lowerName} picture puzzles on Snapshift Puzzles. ${desc ? desc + ' ' : ''}Browse all puzzles or filter to unlocked or locked, unlock more puzzles with points, and jump back in each day for the daily challenge.`;
    }
    return `Browse free ${lowerName} picture puzzles on Snapshift Puzzles. ${desc ? desc + ' ' : ''}Check back for new additions and daily challenge play.`;
  }

  function buildFallbackRelatedCategories(currentId){
    return CATEGORIES
      .filter(cat => cat && cat.id !== currentId)
      .slice(0, 4)
      .map(cat => cat.id);
  }

  function renderCategoryGrowthSections(catMeta){
    const name = String((catMeta && catMeta.name) || title.textContent || CAT_ID || 'this category');
    if (categoryIntroHeading) categoryIntroHeading.textContent = `About ${name} picture puzzles`;
    if (categoryIntroCopy) categoryIntroCopy.textContent = buildCategoryIntroText(catMeta);

    if (!relatedCatsGrid) return;
    const relatedIds = (RELATED_CATEGORY_MAP[CAT_ID] && RELATED_CATEGORY_MAP[CAT_ID].length)
      ? RELATED_CATEGORY_MAP[CAT_ID]
      : buildFallbackRelatedCategories(CAT_ID);

    relatedCatsGrid.innerHTML = '';
    relatedIds
      .map(id => CATEGORIES.find(cat => cat.id === id))
      .filter(Boolean)
      .slice(0, 4)
      .forEach(cat => {
        const count = FULL_CATALOG && Array.isArray(FULL_CATALOG[cat.id]) ? FULL_CATALOG[cat.id].length : 0;
        const card = document.createElement('a');
        card.className = 'relatedCatLink';
        card.href = categoryBrowseUrl(cat.id);

        const top = document.createElement('div');
        top.className = 'relatedCatTop';

        const nameEl = document.createElement('span');
        nameEl.className = 'relatedCatName';
        nameEl.textContent = cat.name;

        const countEl = document.createElement('span');
        countEl.className = 'relatedCatCount';
        countEl.textContent = count > 0 ? `${count} puzzles` : 'Browse';

        top.appendChild(nameEl);
        top.appendChild(countEl);

        const descEl = document.createElement('span');
        descEl.className = 'relatedCatDesc';
        descEl.textContent = sentenceCaseText(cat.desc) || 'Browse this Snapshift puzzle category.';

        card.appendChild(top);
        card.appendChild(descEl);
        relatedCatsGrid.appendChild(card);
      });
  }

  function updateCategorySeo(catMeta){
    const name = String((catMeta && catMeta.name) || title.textContent || CAT_ID || 'Puzzle category');
    const count = Math.max(0, Number(Array.isArray(LIST) ? LIST.length : 0) || 0);
    const desc = count
      ? `Play ${count} free ${name} photo tile puzzles online at Snapshift Puzzles. Browse the collection, earn medals, and save your progress.`
      : `Browse free ${name} photo tile puzzles online at Snapshift Puzzles.`;
    const titleText = `${name} Jigsaw Puzzles | Snapshift Puzzles`;
    document.title = titleText;
    setSeoMeta('meta[name="description"]', desc);
    setSeoMeta('#canonicalLink', seoAbsoluteUrl(categoryBrowseUrl(CAT_ID || '')), 'href');
    setSeoMeta('#ogTitle', titleText);
    setSeoMeta('#ogDescription', desc);
    setSeoMeta('#ogUrl', seoAbsoluteUrl(categoryBrowseUrl(CAT_ID || '')));
    setSeoMeta('#ogImage', seoAbsoluteUrl((catMeta && catMeta.tile) ? catMeta.tile : '/PuzzleQuest_Logo.png'));
    const seoCopy = document.getElementById('seoCategoryCopy');
    if (seoCopy){
      seoCopy.textContent = count
        ? `${name} currently has ${count} playable photo tile puzzles. Open any unlocked puzzle to play online, track medals, and continue where you left off.`
        : `This ${name} collection is waiting for new puzzles. Build the catalog in admin to publish fresh pages for search and players.`;
    }
    const schema = {
      '@context':'https://schema.org',
      '@graph':[
        {
          '@type':'CollectionPage',
          name:`${name} puzzles`,
          url:seoAbsoluteUrl(categoryBrowseUrl(CAT_ID || '')),
          description:desc
        },
        {
          '@type':'BreadcrumbList',
          itemListElement:[
            { '@type':'ListItem', position:1, name:'Home', item:seoAbsoluteUrl('/index.html') },
            { '@type':'ListItem', position:2, name:name, item:seoAbsoluteUrl(categoryBrowseUrl(CAT_ID || '')) }
          ]
        }
      ]
    };
    const ld = document.getElementById('structuredData');
    if (ld) ld.textContent = JSON.stringify(schema);
  }
  async function refreshPlayButtonTarget(force = false){
    if (!playBtn) return;
    playBtn.textContent = "Play";
    if (!Array.isArray(LIST) || !LIST.length || !CAT_ID) {
      playBtn.href = `${GAME_URL}#cat=${encodeURIComponent(CAT_ID || "")}`;
      return;
    }

    const unlockedLimit = Math.max(1, Math.min(LIST.length, Number(unlockedCount) || 1));
    let targetPuzzle = LIST[0] || null;

    try{
      const loggedIn = await ensureCompletionAuth(!!force);
      if (loggedIn){
        await fetchCategoryCardStates(!!force);
        for (let i = 0; i < unlockedLimit; i++){
          const puzzle = LIST[i];
          if (!puzzle) continue;
          const canonicalIdx = Math.max(0, Number(puzzle.puzzleIdx ?? i) || i);
          const serverState = getCategoryServerCardState(CAT_ID, canonicalIdx, puzzle.src || "");
          const summary = serverState && serverState.completion ? serverState.completion : null;
          if (!(summary && summary.completed)){
            targetPuzzle = puzzle;
            break;
          }
          if (i === unlockedLimit - 1) targetPuzzle = LIST[0] || puzzle;
        }
      } else {
        targetPuzzle = LIST[0] || null;
      }
    }catch(e){
      targetPuzzle = LIST[0] || null;
    }

    if (targetPuzzle) playBtn.href = puzzlePageUrl(CAT_ID, targetPuzzle);
    else playBtn.href = `${GAME_URL}#cat=${encodeURIComponent(CAT_ID)}`;
  }

  function updateTopBar(points){
    const p = Math.max(0, Math.floor(Number(points || 0) || 0));
    pointsPill.textContent = `Points: ${p}`;
    refreshPlayButtonTarget().catch(() => {
      if (playBtn) playBtn.href = `${GAME_URL}#cat=${encodeURIComponent(CAT_ID)}`;
    });
  }

  async function refreshFromServer(options = {}){
    const seq = ++categoryRefreshSeq;
    const resetBadges = options.resetBadges !== false;
    const force = !!options.force;
    try{
      showSyncing(true);
      const [, u, pts] = await Promise.all([
        initAuthPill(),
        fetchUnlockedMap(),
        fetchPoints()
      ]);
      if (seq !== categoryRefreshSeq) return;
      showSyncing(false);

      syncUnlockedStateFromMap(u || {});
      await fetchCategoryCardStates(force);
      updateTopBar(pts);
      if (resetBadges || force) {
        completionAuthKnown = false;
        await ensureCompletionAuth(force);
        bustCategoryCompletionCache();
      }
      applyCategoryFilter(activeFilter, false);
      await applyCategoryCompletionBadges({ force });
    }catch(e){
      if (seq !== categoryRefreshSeq) return;
      showSyncing(false);
      applyCategoryFilter(activeFilter, false);
      if (resetBadges || force) {
        completionAuthKnown = false;
        bustCategoryCompletionCache();
        applyCategoryCompletionBadges({ force:true }).catch(() => {});
      }
    }
  }

  prevPageBtn && prevPageBtn.addEventListener("click", () => setCategoryPage(currentPage - 1));
  nextPageBtn && nextPageBtn.addEventListener("click", () => setCategoryPage(currentPage + 1));
  pageSelect && pageSelect.addEventListener("change", () => setCategoryPage(pageSelect.value));
  unlockCancelBtn && unlockCancelBtn.addEventListener("click", closeUnlockModal);
  unlockConfirmBtn && unlockConfirmBtn.addEventListener("click", () => { confirmUnlock(); });
  unlockModal && unlockModal.addEventListener("click", (ev) => { if (ev.target === unlockModal) closeUnlockModal(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && unlockModal && unlockModal.classList.contains("show")) closeUnlockModal(); });
  filterAllBtn && filterAllBtn.addEventListener("click", () => applyCategoryFilter("all", true));
  filterUnlockedBtn && filterUnlockedBtn.addEventListener("click", () => applyCategoryFilter("unlocked", true));
  filterLockedBtn && filterLockedBtn.addEventListener("click", () => applyCategoryFilter("locked", true));

  (async () => {
    await applyThemeFromJson();

        refreshRememberedLoginLinks();
        await initAuthPill();
CAT_ID = getCat();
    if (!CAT_ID){
      title.textContent = "Pick a category";
      subtitle.textContent = "Missing category. Go back to Categories.";
      renderCategoryGrowthSections({ name:"Puzzle categories", desc:"Browse Snapshift categories and daily challenge collections." });
      renderCategoryGuideSections({ name:"Puzzle categories", desc:"Browse Snapshift categories and daily challenge collections." });
      updateCategorySeo({ name:"Puzzle categories", tile:"PuzzleQuest_Logo.png" });
      if (paginationWrap) paginationWrap.hidden = true;
      return;
    }

    const catMeta = CATEGORIES.find(c => c.id === CAT_ID);
    title.textContent = catMeta ? catMeta.name : CAT_ID;
    updateCategorySeo(catMeta || { name: CAT_ID, tile:"PuzzleQuest_Logo.png" });

    try{
      let catalog = null;
      try{
        catalog = await loadCatalog();
      }catch(e){
        title.textContent = "Catalog missing";
        subtitle.textContent = "Run Build Index in admin to generate puzzles/index.json.";
        renderCategoryGrowthSections({ name: (catMeta && catMeta.name) || CAT_ID || "Puzzle category", desc:(catMeta && catMeta.desc) || "" });
        updateCategorySeo({ name: (catMeta && catMeta.name) || CAT_ID || "Puzzle category", tile:(catMeta && catMeta.tile) || "PuzzleQuest_Logo.png" });
        countPill.textContent = "Puzzles: —";
        unlockedPill.textContent = "Unlocked: —";
        if (paginationWrap) paginationWrap.hidden = true;
        return;
      }
      FULL_CATALOG = catalog;
      LIST = Array.isArray(catalog[CAT_ID]) ? catalog[CAT_ID] : [];
      const unlockedMap = await fetchUnlockedMap().catch(() => ({}));
      syncUnlockedStateFromMap(unlockedMap || {});
      await fetchCategoryCardStates(true).catch(() => {});
      activeFilter = "all";
      updateCategoryFilterButtons();
      VIEW = filterList(LIST, activeFilter);

      showSyncing(true);
      const pts = await fetchPoints().catch(() => 0);
      showSyncing(false);
      updateTopBar(pts);
      render(true);
      renderCategoryGrowthSections(catMeta || { name: CAT_ID, tile:"PuzzleQuest_Logo.png" });
      renderCategoryGuideSections(catMeta || { name: CAT_ID, tile:"PuzzleQuest_Logo.png" });
      updateCategorySeo(catMeta || { name: CAT_ID, tile:"PuzzleQuest_Logo.png" });
      await applyCategoryCompletionBadges({ force:true }).catch(() => {});
      scheduleCategoryBadgeRefresh({ force:true, delays:[300, 900, 1800] });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) scheduleCategoryRefresh({ force:true, delays:[0, 500, 1500] });
      });
      window.addEventListener("focus", () => scheduleCategoryRefresh({ force:true, delays:[0, 500, 1500] }));
      window.addEventListener("pageshow", () => scheduleCategoryRefresh({ force:true, delays:[0, 500, 1500] }));
      window.forceCategoryBadgeRefresh = () => scheduleCategoryBadgeRefresh({ force:true, delays:[0, 300, 900, 1800] });
    } catch (e){
      console.error("Category boot failed", e);
      subtitle.textContent = "Could not finish loading this category right now.";
      renderCategoryGrowthSections({ name: (catMeta && catMeta.name) || CAT_ID || "Puzzle category", desc:(catMeta && catMeta.desc) || "" });
      renderCategoryGuideSections({ name: (catMeta && catMeta.name) || CAT_ID || "Puzzle category", desc:(catMeta && catMeta.desc) || "" });
      updateCategorySeo({ name: (catMeta && catMeta.name) || CAT_ID || "Puzzle category", tile:(catMeta && catMeta.tile) || "PuzzleQuest_Logo.png" });
      if (paginationWrap) paginationWrap.hidden = true;
    }
  })();
})();
