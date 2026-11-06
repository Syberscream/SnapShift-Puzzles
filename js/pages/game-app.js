  const rewardPlacementToastEl = document.getElementById("rewardPlacementToast");
  const accomplishmentToastEl = document.getElementById("accomplishmentToast");
  const pointsFloatLayerEl = document.getElementById("pointsFloatLayer");
  let pqAudioCtx = null;
  let pqUiMuted = false;
  let showGameRewardPreview = null;
  let updateMuteButton = null;
  let resolvePointsFloatAnchor = null;
  let spawnPointsFloat = null;
  let sumAwardedPoints = null;
  let playMedalFanfare = null;
  let ensureUiAudio = null;
  let setUiMuted = null;
  let showAccomplishmentToast = null;
  let playCoinCascade = null;
  let triggerDailyCompletionPulse = null;
  let applyCompactSidebar = null;
  ({
    showGameRewardPreview,
    updateMuteButton,
    resolvePointsFloatAnchor,
    spawnPointsFloat,
    sumAwardedPoints,
    playMedalFanfare,
    ensureUiAudio,
    setUiMuted,
    showAccomplishmentToast,
    playCoinCascade,
    triggerDailyCompletionPulse,
  } = window.SnapshiftGameFeedback.create({
    getUiMuted: () => pqUiMuted,
    setUiMuted: (value) => { pqUiMuted = !!value; },
    getAudioContext: () => pqAudioCtx,
    setAudioContext: (value) => { pqAudioCtx = value; },
    applyCompactSidebar: () => applyCompactSidebar(),
    refs: {
      getRewardPlacementToastEl: () => rewardPlacementToastEl,
      getAccomplishmentToastEl: () => accomplishmentToastEl,
      getPointsFloatLayerEl: () => pointsFloatLayerEl,
      getMuteBtnEl: () => muteBtn,
    },
  }));
  document.querySelectorAll("[data-reward-preview]").forEach(btn => {
    btn.addEventListener("click", () => showGameRewardPreview(btn.getAttribute("data-reward-preview")));
  });
  window.addEventListener("pointerdown", ensureUiAudio, { passive:true });
  window.addEventListener("keydown", ensureUiAudio, { passive:true });

  const __PQ_IS_DAILY = /(^|[?#&])daily=/.test(String(location.href||""));

  
  const DAILY_TEST_EASY = false; // Daily defaults to Hard
// ===== DAILY CHALLENGE POLICY (centralized flags) =====
  // Daily mode is detected ONLY from the URL via __PQ_IS_DAILY above.
  // Use these flags as the single source of truth for what Daily allows.
  const DAILY_POLICY = {
    forceDifficultyHard: true,       // Daily always Hard
    allowPlace1TileHint: false,      // Disable "Place 1 Tile"
    allowCorrectTileOutline: false,  // Disable green correct-tile outline
    allowCorrectFX: false,           // Disable green correct FX (glow)
    hideUnlockNextPuzzle: true,      // Hide Next/Unlock
    hideHardModeToggle: true         // Hide Hard toggle button
  };

  // Best-effort UI hiding. Does not affect gameplay logic if elements differ.
  (function(){
    function applyDailyUiPolicy(){
      if (!__PQ_IS_DAILY) return;
      try{
        if (DAILY_POLICY.forceDifficultyHard){
          const sel = document.getElementById("sizeSel");
          if (sel){
            // keep existing label if your UI uses a custom string
            sel.innerHTML = DAILY_TEST_EASY ? '<option value="easy">Easy</option>' : '<option value="hard">Hard</option>';
            sel.value = "hard";
            sel.disabled = true;
          // force hardMode off for daily test
          
          }
        }
      }catch(e){}
      try{
        if (DAILY_POLICY.hideHardModeToggle){
          const hb = document.getElementById("hardBtn");
          if (hb) hb.style.display = "none";
        }
      }catch(e){}
      try{
        if (DAILY_POLICY.hideUnlockNextPuzzle){
          const nb = document.getElementById("nextPuzzleBtn");
          if (nb) nb.style.display = "none";
        }
      }catch(e){}
      try{
        if (!DAILY_POLICY.allowPlace1TileHint){
          const hp = document.getElementById("hintPlaceBtn");
          if (hp) hp.style.display = "none";
        }
      }catch(e){}
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyDailyUiPolicy, { once:true });
    else applyDailyUiPolicy();
  })();

  try{ if (__PQ_IS_DAILY) document.documentElement.classList.add("pq-daily"); }catch(e){}

(() => {
  // ===== PATCH: Disable localStorage for progress authority in game (UI preferences only) =====
  const STORAGE_DISABLED = true;
  function lsGet(k){ try{ return STORAGE_DISABLED ? null : localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ if (!STORAGE_DISABLED) localStorage.setItem(k,String(v)); }catch(e){} }
  function lsDel(k){ try{ if (!STORAGE_DISABLED) localStorage.removeItem(k); }catch(e){} }
  function lsLen(){ try{ return STORAGE_DISABLED ? 0 : localStorage.length; }catch(e){ return 0; } }
  function lsKey(i){ try{ return STORAGE_DISABLED ? null : localStorage.key(i); }catch(e){ return null; } }
    /* ==========================================================
     EDIT YOUR PUZZLES HERE
     - Landing tiles (category_tiles/*.png) must exist on disk.
     - Puzzle images (src) must exist too.
     ========================================================== */

  // 12 categories matching your tile PNG filenames
  const CATEGORIES = [
    { id:"animals", name:"Animals", desc:"Wildlife, pets, safari scenes.", tile:"category_tiles/animals.png" },
    { id:"architecture", name:"Architecture", desc:"Buildings, interiors, design.", tile:"category_tiles/architecture.png" },
    { id:"art", name:"Art", desc:"Paintings, illustrations, museums.", tile:"category_tiles/art.png" },
    { id:"cities", name:"Cities", desc:"Skylines, streets, downtown.", tile:"category_tiles/cities.png" },
    { id:"food", name:"Food", desc:"Warm rooms, cafes, home vibes.", tile:"category_tiles/food.png" },
     { id:"fractals", name:"Fractals", desc:"Skylines, streets, downtown.", tile:"category_tiles/fractals.png" },
    { id:"landscapes", name:"Landscapes", desc:"Fields, hills, scenic views.", tile:"category_tiles/landscapes.png" },
    { id:"marine", name:"Marine", desc:"Sea, boats, underwater worlds.", tile:"category_tiles/marine.png" },
    { id:"nature", name:"Nature", desc:"Forests, flowers, wild places.", tile:"category_tiles/nature.png" },
    { id:"scifi", name:"SciFi", desc:"Graffiti, murals, bold patterns.", tile:"category_tiles/scifi.png" },
    { id:"space", name:"Space", desc:"Modern life, neighborhoods.", tile:"category_tiles/space.png" },
    { id:"vehicles", name:"Vehicles", desc:"Cars, bikes, machines.", tile:"category_tiles/vehicles.png" },
  ];

  // IMPORTANT: keys must match CATEGORIES ids exactly
  // Loaded from puzzles/index.json at boot (with aliases for city/cities, landscape/landscapes)
  let PUZZLE_CATALOG = {
    animals: [],
    architecture: [],
    art: [],
    cities: [],
    food: [],
    fractals: [],
    landscapes: [],
    marine: [],
    nature: [],
    scifi: [],
    space: [],
    vehicles: [],
  };

  let PUZZLE_INDEX_META = null;
  let PUZZLE_CATALOG_LOADED = false;

  const CATEGORY_ALIASES = {
    city: ["city", "cities"],
    landscape: ["landscape", "landscapes"],
  };

  function clonePuzzleList(list){
    return Array.isArray(list) ? list.map(p => ({ name: String(p.name || "Puzzle"), src: String(p.src || "") })) : [];
  }

  function firstNonEmptyList(indexData){
    const cats = (indexData && indexData.categories) || {};
    for (const key of Object.keys(cats)) {
      const arr = cats[key];
      if (Array.isArray(arr) && arr.length) return clonePuzzleList(arr);
    }
    return [];
  }

  function getIndexListForCategory(indexData, catId){
    const cats = (indexData && indexData.categories) || {};
    const candidates = CATEGORY_ALIASES[catId] || [catId];
    for (const k of candidates){
      const arr = cats[k];
      if (Array.isArray(arr) && arr.length) return clonePuzzleList(arr);
    }
    return [];
  }

  async function loadPuzzleCatalogFromIndex(){
    const urls = ["puzzles/index.json", "/puzzles/index.json"];
    let data = null;
    let lastErr = null;

    for (const url of urls){
      try{
        const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
        if (!r.ok) { lastErr = new Error("HTTP " + r.status + " for " + url); continue; }
        data = await r.json();
        break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!data || typeof data !== "object") {
      console.warn("Failed to load puzzles/index.json", lastErr);
      return;
    }

    PUZZLE_INDEX_META = data;

    const nextCatalog = {};
    for (const c of CATEGORIES){
      nextCatalog[c.id] = getIndexListForCategory(data, c.id);
    }

    // If a category tile exists but JSON has no matching category, keep it empty (card still shows 0 puzzles).
    PUZZLE_CATALOG = nextCatalog;
    PUZZLE_CATALOG_LOADED = true;
  }

  /* ==========================================================
     STORAGE / ECONOMY
     - Points are GLOBAL across categories
     - Unlocks are per-category
     ========================================================== */
  const GLOBAL_POINTS_KEY = "tilepuzzle_points_global";
  let AUTH_LOGGED_IN = false;
  let AUTH_USER_TAG = "";

  // ===== Server unlocks (per-user) =====

  let unlockedCache = null; // {catId: record}
  let unlockedSrcSet = new Set();
  let unlockedPlayableIndices = [];
  let nextUnlockIdx = 0;

  function normalizeUnlockSrc(value){ return window.SnapshiftPuzzleAccess.normalizeSrc(value); }

  function buildSourceUnlockRecord(raw, items){
    return window.SnapshiftPuzzleAccess.buildRecord(raw, items);
  }

  function isPuzzleUnlockedIndex(idx){
    const src = normalizeUnlockSrc(PUZZLES && PUZZLES[idx] && PUZZLES[idx].src);
    return !!src && unlockedSrcSet.has(src);
  }

  function getFirstUnlockedIndex(){
    return unlockedPlayableIndices.length ? unlockedPlayableIndices[0] : 0;
  }

  function syncUnlockedStateFromCache(){
    if (!unlockedCache || typeof unlockedCache !== 'object') unlockedCache = {};
    const state = window.SnapshiftPuzzleAccess.buildState(unlockedCache, CATEGORY_ID, PUZZLES);
    unlockedCache[CATEGORY_ID] = state.record;
    unlockedSrcSet = state.set;
    unlockedPlayableIndices = [];
    for (let i = 0; i < PUZZLES.length; i++) {
      if (window.SnapshiftPuzzleAccess.isUnlockedSrc(unlockedSrcSet, PUZZLES[i] && PUZZLES[i].src)) unlockedPlayableIndices.push(i);
    }
    if (!unlockedPlayableIndices.length && PUZZLES.length) unlockedPlayableIndices = [0];
    unlockedCount = unlockedPlayableIndices.length;
    nextUnlockIdx = state.nextLockedIdx;
    return { record: state.record, set: state.set, changed:false };
  }

  async function fetchUnlockedFromServer(){ return window.SnapshiftPuzzleAccess.fetchUnlockedMap('/api/unlocked_get.php'); }

  async function pushUnlockedToServer(unlockedMap){ return window.SnapshiftPuzzleAccess.pushUnlockedMap('/api/unlocked_set.php', unlockedMap); }

  let fetchServerPoints = null;
  let applySyncedPoints = null;
  let syncPointsFromServer = null;
  let savePoints = null;
  let saveCurrentPuzzle = null;


  // ===== Server-saved unfinished puzzle progress =====
  let pendingResumeProgress = null;
  let progressSaveTimer = null;
  let lastProgressFingerprint = "";
  let progressSaveSeq = 0;
  let lastAcceptedProgressSeq = 0;
  let progressSaveBusy = false;
  let progressSaveQueued = false;
  let progressSaveQueuedForce = false;
  const progressClientSessionId = (() => {
    try{
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    }catch(e){}
    return "sess-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  })();
  let resumePromptResolve = null;
  let saveStatusTimer = null;
  let completedPuzzleState = false;
  let activePuzzleUiContextToken = 0;
  let setSaveStatus = null;
  let scheduleSaveStatusIdle = null;
  let syncSaveStatusForAuth = null;
  let askResumeProgress = null;
  let getCurrentDailyDayKey = null;
  let buildProgressKeyFromMeta = null;
  let currentPuzzleMeta = null;
  let writeDailyProgressBackup = null;

    function resetActivePuzzleProgressStateForDifficultySwitch() {
      pendingResumeProgress = null;
      completedPuzzleState = false;
      lastProgressFingerprint = "";
      hideAllLines = false;
      flashWinUntil = 0;
      try { correctFx.clear(); } catch (e) {}
      try { updateCompletionRatingDisplay(null); } catch (e) {}
    }

    function bumpActivePuzzleUiContext() {
      activePuzzleUiContextToken += 1;
    }
let readDailyProgressBackup = null;
let clearDailyProgressBackup = null;
let fetchProgressFromServer = null;
let fetchLatestProgressFromServer = null;
let fetchContinueStateFromServer = null;
let refreshLandingContinueButtonState = null;
let fetchDailyProgressForDay = null;
let fetchCurrentPuzzleProgressFromServer = null;
let clearProgressOnServer = null;
let persistProgressNow = null;
let forcePersistCompletedProgress = null;
let scheduleProgressSave = null;
let markProgressDirty = null;
let closeResumePrompt = null;
({
    setSaveStatus,
    scheduleSaveStatusIdle,
    syncSaveStatusForAuth,
    closeResumePrompt,
    askResumeProgress,
    getCurrentDailyDayKey,
    buildProgressKeyFromMeta,
    currentPuzzleMeta,
    writeDailyProgressBackup,
    readDailyProgressBackup,
    clearDailyProgressBackup,
    fetchProgressFromServer,
    fetchLatestProgressFromServer,
    fetchContinueStateFromServer,
    refreshLandingContinueButtonState,
    fetchDailyProgressForDay,
    fetchCurrentPuzzleProgressFromServer,
    clearProgressOnServer,
    persistProgressNow,
    forcePersistCompletedProgress,
    scheduleProgressSave,
    markProgressDirty,
  } = window.SnapshiftGameProgress.create({
    getAuthLoggedIn: () => AUTH_LOGGED_IN,
    getCompletedPuzzleState: () => completedPuzzleState,
    setCompletedPuzzleState: (value) => { completedPuzzleState = !!value; },
    getLastAcceptedProgressSeq: () => lastAcceptedProgressSeq,
    setLastAcceptedProgressSeq: (value) => { lastAcceptedProgressSeq = Math.max(0, Math.floor(Number(value) || 0)); },
    getProgressSaveBusy: () => progressSaveBusy,
    setProgressSaveBusy: (value) => { progressSaveBusy = !!value; },
    getProgressSaveQueued: () => progressSaveQueued,
    setProgressSaveQueued: (value) => { progressSaveQueued = !!value; },
    getProgressSaveQueuedForce: () => progressSaveQueuedForce,
    setProgressSaveQueuedForce: (value) => { progressSaveQueuedForce = !!value; },
    getProgressSaveSeq: () => progressSaveSeq,
    setProgressSaveSeq: (value) => { progressSaveSeq = Math.max(0, Math.floor(Number(value) || 0)); },
    getLastProgressFingerprint: () => lastProgressFingerprint,
    setLastProgressFingerprint: (value) => { lastProgressFingerprint = String(value || ""); },
    getSaveStatusTimer: () => saveStatusTimer,
    setSaveStatusTimer: (value) => { saveStatusTimer = value; },
    getProgressSaveTimer: () => progressSaveTimer,
    setProgressSaveTimer: (value) => { progressSaveTimer = value; },
    getActivePuzzleUiContextToken: () => activePuzzleUiContextToken,
    getResumePromptResolve: () => resumePromptResolve,
    setResumePromptResolve: (value) => { resumePromptResolve = value; },
    getDiffKey: () => diffKey,
    getDifficulties: () => DIFFICULTIES,
    getCategoryId: () => CATEGORY_ID,
    getCategoryName: () => CATEGORY_NAME,
    getCurrentPuzzleIdx: () => currentPuzzleIdx,
    getPuzzles: () => PUZZLES,
    getRows: () => ROWS,
    getCols: () => COLS,
    getLastPuzzleHintKey: () => LAST_PUZZLE_HINT_KEY,
    getProgressClientSessionId: () => progressClientSessionId,
    isSolved: () => isSolved(),
    parseRouteHash: () => parseRouteHash(),
    isDailyRun: () => isDailyRun(),
    isDailyRoute: () => __PQ_IS_DAILY,
    normalizeUnlockSrc: (value) => normalizeUnlockSrc(value),
    decodeMaybeTwice: (value) => decodeMaybeTwice(value),
    formatElapsed: (value) => fmtTime(value),
    lsGet: (key) => lsGet(key),
    updateCompletionRatingDisplay: (value) => updateCompletionRatingDisplay(value),
    collectProgressSnapshot: (opts) => collectProgressSnapshot(opts),
    buildProgressFingerprint: (progress) => buildProgressFingerprint(progress),
    applyProgressSnapshot: (progress) => applyProgressSnapshot(progress),
    forceSolvedSnapshot: (progress) => forceSolvedSnapshot(progress),
    refs: {
      getSaveStatusEl: () => saveStatus,
      getResumePromptEl: () => resumePrompt,
      getResumePromptTitleEl: () => resumePromptTitle,
      getResumePromptTextEl: () => resumePromptText,
      getResumePromptMetaEl: () => resumePromptMeta,
      getResumePromptSavedEl: () => resumePromptSaved,
      getResumePromptResumeBtnEl: () => resumePromptResumeBtn,
      getContinueBtnEl: () => continueBtn,
    },
  }));

  function sanitizeProgressTiles(arr, expectedLen){
    if (!Array.isArray(arr) || arr.length !== expectedLen) return null;
    const seen = new Set();
    const out = [];
    for (const raw of arr){
      const n = Math.floor(Number(raw));
      if (!Number.isFinite(n) || n < 0 || n >= expectedLen || seen.has(n)) return null;
      seen.add(n);
      out.push(n);
    }
    return out;
  }

  function sanitizeProgressLocked(arr, expectedLen){
    if (!Array.isArray(arr) || arr.length !== expectedLen) {
      return Array.from({ length: expectedLen }, () => false);
    }
    return arr.slice(0, expectedLen).map(v => !!v);
  }

  function sanitizePlayableProgressLocked(arr, tilesArr, completed){
    const expectedLen = Array.isArray(tilesArr) ? tilesArr.length : 0;
    const nextLocked = sanitizeProgressLocked(arr, expectedLen);
    if (completed || !Array.isArray(tilesArr) || tilesArr.length !== expectedLen) return nextLocked;
    const hasWrongLocked = nextLocked.some((isLocked, idx) => isLocked && tilesArr[idx] !== idx);
    const allLocked = expectedLen > 0 && nextLocked.every(Boolean);
    if (hasWrongLocked || allLocked) {
      return Array.from({ length: expectedLen }, () => false);
    }
    return nextLocked;
  }

  function resetToSolved(){
    const total = totalTiles();
    tiles = Array.from({ length: total }, (_, i) => i);
    locked = Array.from({ length: total }, () => true);
    selected = null;
    multiSel = [];
    srcRelOrder = [];
    clearPreview();
  }

  function collectProgressSnapshot(opts = {}){
    try{
      if (!AUTH_LOGGED_IN) return null;
      if (gameScreen.classList.contains("hidden")) return null;
      const total = totalTiles();
      const nextTiles = sanitizeProgressTiles(tiles, total);
      if (!nextTiles) return null;

      const solvedNow = isSolved();
      if (solvedNow && !opts.includeSolved) return null;

      const meta = currentPuzzleMeta();
      const elapsedNow = running
        ? Math.max(0, Math.floor(performance.now() - startTime))
        : Math.max(0, Math.floor(elapsedMs || 0));
      const moveCount = Math.max(0, Math.floor(Number(movesMade) || 0));
      const scoreValue = Math.max(0, Math.floor(Number(score) || 0));
      const completed = !!solvedNow;
      const rating = completed ? computePuzzleMedalFromRun({
        diffKey: meta.diffKey,
        totalTiles: total,
        movesMade: moveCount,
        elapsedMs: elapsedNow
      }) : null;

      return {
        ...meta,
        progressKey: buildProgressKeyFromMeta(meta),
        schemaVersion: 3,
        clientSessionId: progressClientSessionId,
        tiles: nextTiles,
        locked: sanitizeProgressLocked(locked, total),
        score: scoreValue,
        scoreValue: scoreValue,
        scorePct: rating ? Math.max(0, Number(rating.scorePct) || 0) : 0,
        streak: Math.max(0, Math.floor(Number(streak) || 0)),
        movesMade: moveCount,
        moves: moveCount,
        elapsedMs: elapsedNow,
        elapsedLabel: fmtTime(elapsedNow),
        hardMode: !!hardMode,
        completed,
        completedAt: completed && opts.completedAt ? String(opts.completedAt) : "",
        medal: rating ? String(rating.label || "") : "",
        medalKey: rating ? String(rating.key || "") : "",
        stars: rating ? Math.max(0, Math.floor(Number(rating.stars) || 0)) : 0,
        moveEffPct: rating ? Math.max(0, Number(rating.moveEffPct) || 0) : 0,
        speedEffPct: rating ? Math.max(0, Number(rating.speedEffPct) || 0) : 0
      };
    }catch(e){
      return null;
    }
  }

  function buildProgressFingerprint(progress){
    try{
      if (!progress || typeof progress !== "object") return "";
      const clone = JSON.parse(JSON.stringify(progress));
      delete clone.savedAt;
      delete clone.updatedAt;
      delete clone.progressUpdatedAt;
      delete clone.saveSeq;
      return JSON.stringify(clone);
    }catch(e){
      return "";
    }
  }

  function applyProgressSnapshot(progress){
    try{
      if (!progress || typeof progress !== "object") return false;
      if (String(progress.categoryId || "") !== String(CATEGORY_ID || "")) return false;
      const currentSrc = normalizeUnlockSrc(PUZZLES && PUZZLES[currentPuzzleIdx] && PUZZLES[currentPuzzleIdx].src);
      const savedSrc = normalizeUnlockSrc(progress.puzzleSrc || "");
      if (savedSrc && currentSrc) {
        if (savedSrc !== currentSrc) return false;
      } else if (Math.floor(Number(progress.puzzleIdx)) !== Math.floor(Number(currentPuzzleIdx))) {
        return false;
      }

      const targetDiff = String(progress.diffKey || diffKey || "easy");
      if (!Object.prototype.hasOwnProperty.call(DIFFICULTIES, targetDiff)) return false;
      if (sizeSel) sizeSel.value = targetDiff;
      setDifficulty(targetDiff);

      const total = totalTiles();
      const nextTiles = sanitizeProgressTiles(progress.tiles, total);
      if (!nextTiles) return false;
      const completedFromProgress = !!progress.completed;
      if (completedFromProgress && nextTiles.some((tile, idx) => tile !== idx)) {
        return false;
      }

      tiles = nextTiles.slice();
      locked = sanitizePlayableProgressLocked(progress.locked, nextTiles, completedFromProgress);
      movesMade = Math.max(0, Math.floor(Number(progress.movesMade) || 0));
      selected = null;
      multiSel = [];
      srcRelOrder = [];
      clearPreview();

      score = Math.max(0, Math.floor(Number(progress.score) || 0));
      streak = Math.max(0, Math.floor(Number(progress.streak) || 0));
      elapsedMs = Math.max(0, Math.floor(Number(progress.elapsedMs) || 0));
      if (typeof progress.hardMode === "boolean") hardMode = !!progress.hardMode;
      completedPuzzleState = completedFromProgress;
      updateCompletionRatingDisplay(completedPuzzleState ? computePuzzleMedalFromRun({
        diffKey: targetDiff,
        totalTiles: total,
        movesMade,
        elapsedMs
      }) : null);

      progressSaveSeq = Math.max(0, Math.floor(Number(progress.saveSeq) || 0));
      lastAcceptedProgressSeq = progressSaveSeq;
      lastProgressFingerprint = buildProgressFingerprint(progress);
      syncSaveStatusForAuth();

      hideAllLines = !!completedPuzzleState;
      flashWinUntil = 0;
      flashWinOn = true;
      flashWinLastToggle = 0;
      correctFx.clear();
      paused = false;
      pauseOverlay.classList.remove("show");
      modal.classList.remove("show");
      helpPanel.style.display = "none";

      stopTimer();
      if (!completedPuzzleState && (elapsedMs > 0 || movesMade > 0)) startTimer();

      updateStats();
      draw();
      try{
        if (assetStat) assetStat.textContent = completedPuzzleState
          ? `Assets: OK (${PUZZLES[currentPuzzleIdx]?.name ?? "Puzzle"}) • Completed`
          : `Assets: OK (${PUZZLES[currentPuzzleIdx]?.name ?? "Puzzle"})`;
      }catch(e){}
      return true;
    }catch(e){
      return false;
    }
  }
  function forceSolvedSnapshot(progress){
    try{
      if (!progress || typeof progress !== "object") return false;

      const targetDiff = String(progress.diffKey || diffKey || "easy");
      if (!Object.prototype.hasOwnProperty.call(DIFFICULTIES, targetDiff)) return false;
      if (sizeSel) sizeSel.value = targetDiff;
      setDifficulty(targetDiff);

      resetToSolved();

      // Preserve completed summary fields when available.
      movesMade = Math.max(0, Math.floor(Number(progress.movesMade) || Number(progress.moves) || 0));
      score = Math.max(0, Math.floor(Number(progress.score) || Number(progress.scoreValue) || Number(progress.score_pct) || 0));
      streak = Math.max(0, Math.floor(Number(progress.streak) || 0));
      elapsedMs = Math.max(0, Math.floor(Number(progress.elapsedMs) || Number(progress.elapsed_ms) || 0));
      if (!elapsedMs) {
        const label = String(progress.elapsedLabel || progress.elapsed_label || "");
        const m = label.match(/^(\d+):(\d+(?:\.\d+)?)$/);
        if (m) elapsedMs = Math.max(0, Math.floor((Number(m[1]) * 60 + Number(m[2])) * 1000));
      }

      completedPuzzleState = true;
      hideAllLines = true;
      flashWinUntil = 0;
      flashWinOn = true;
      flashWinLastToggle = 0;
      correctFx.clear();
      paused = false;
      pauseOverlay.classList.remove("show");
      modal.classList.remove("show");
      helpPanel.style.display = "none";
      stopTimer();

      updateCompletionRatingDisplay(computePuzzleMedalFromRun({
        diffKey: targetDiff,
        totalTiles: totalTiles(),
        movesMade,
        elapsedMs
      }));

      progressSaveSeq = Math.max(0, Math.floor(Number(progress.saveSeq) || 0));
      lastAcceptedProgressSeq = progressSaveSeq;
      lastProgressFingerprint = buildProgressFingerprint(progress);
      syncSaveStatusForAuth();

      updateStats();
      draw();
      try{
        if (assetStat) assetStat.textContent = `Assets: OK (${PUZZLES[currentPuzzleIdx]?.name ?? "Puzzle"}) • Completed`;
      }catch(e){}
      return true;
    }catch(e){
      return false;
    }
  }

const PLACE_COST_BASE = { easy: 30, medium: 45, hard: 60 };
  const PLACE_COST_STEP = { easy: 5, medium: 8, hard: 10 };
  const UNLOCK_COST_BASE = { easy: 100, medium: 140, hard: 180 };
  const UNLOCK_COST_STEP = { easy: 40, medium: 55, hard: 70 };
  const WIN_POINTS_BASE = { easy: 40, medium: 60, hard: 80 };
  const WIN_POINTS_TIME_FACTOR = 600;

  const BEST_KEY_PREFIX = "tilepuzzle_best_time_";
  const THEME_PREF_KEY = "tilepuzzle_theme_enabled";
  const THEME_ALPHA_KEY = "tilepuzzle_theme_alpha";
  const HARD_MODE_PREF_KEY = "tilepuzzle_hard_mode";
  const HARD_MODE_POINTS_MULT = 1.45;

  // ===== Daily challenge keys (shared with index.html) =====
  const DAILY_KEY_PREFIX = "tilepuzzle_daily_";
  const DAILY_DONE_PREFIX = DAILY_KEY_PREFIX + "done_";

  const CORRECT_FX_MS = 700;
  const CORRECT_FX_SPARKS = 10;
  const CORRECT_FX_GLOW = 0.55;

  const BASE_NEW_CORRECT = 10;
  const STREAK_BONUS_PER_LEVEL = 2;
  const TIME_BONUS_FACTOR = 800;

  // ===== Landing DOM =====
  const landingScreen = document.getElementById("landingScreen");
  const landingGrid = document.getElementById("landingGrid");
  const landingSearch = document.getElementById("landingSearch");
  const landingLast = document.getElementById("landingLast");
  const continueBtn = document.getElementById("continueBtn");
  const globalPointsPill = document.getElementById("globalPointsPill");

  // ===== Game DOM =====
  const gameScreen = document.getElementById("gameScreen");
  const backToCategoriesBtn = document.getElementById("backToCategoriesBtn");
  const categoryStat = document.getElementById("categoryStat");
  const hudCategory = document.getElementById("hudCategory");

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d", { alpha: false });

  const boardCard = document.getElementById("boardCard");
  const hud = document.getElementById("hud");

  const puzzleSel = document.getElementById("puzzleSel");
  const sizeSel = document.getElementById("sizeSel");
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const muteBtn = document.getElementById("muteBtn");
  const fsBtn = document.getElementById("fsBtn");
  
  const multiShiftBtn = document.getElementById("multiShiftBtn");
  
  const multiMoveBtn = document.getElementById("multiMoveBtn");
  let multiMoveArmed = false;
  let mgToastTimer = null;
  function mgShowToast(message, duration = 2500){
    try{
      const mgToast = document.getElementById("mgToast");
      if (!mgToast) return;
      if (typeof message === "string" && message) mgToast.textContent = message;
      mgToast.classList.add("show");
      if (mgToastTimer) clearTimeout(mgToastTimer);
      mgToastTimer = setTimeout(() => {
        try{ mgToast.classList.remove("show"); }catch(e){}
        try{ mgToast.textContent = "Tap destination tile…"; }catch(e){}
      }, Math.max(1200, Math.floor(Number(duration) || 2500)));
    }catch(e){}
  }
  function mgHideToast(){
    try{
      const mgToast = document.getElementById("mgToast");
      if (!mgToast) return;
      mgToast.classList.remove("show");
      if (mgToastTimer) clearTimeout(mgToastTimer);
      mgToastTimer = null;
    }catch(e){}
  }
  function mgCancel(){
    multiMoveArmed = false;
    mgHideToast();
    updateShiftUi();
  }

  function updateShiftUi(){
    try{
      const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      const n = (Array.isArray(multiSel) ? multiSel.length : 0);
      if (multiShiftBtn){
        multiShiftBtn.style.display = coarse ? "inline-flex" : "none";
      }
      if (multiMoveBtn){
        // show Move Group only when Shift is on and 2+ selected (tablet only)
        multiMoveBtn.style.display = (coarse && multiShiftEnabled && n >= 2) ? "inline-flex" : "none";
        multiMoveBtn.textContent = multiMoveArmed ? "Tap destination…" : "Move Group";
      }
    }catch(e){}
  }

  if (multiMoveBtn){
    multiMoveBtn.addEventListener("click", () => {
      if (!multiShiftEnabled) return;
      if (!Array.isArray(multiSel) || multiSel.length < 2) return;
      multiMoveArmed = !multiMoveArmed;
      if (multiMoveArmed) mgShowToast(); else mgHideToast();
      updateShiftUi();
    });
  }
let multiShiftEnabled = false;

  function setMultiShift(on){
    multiShiftEnabled = !!on;
    try{
      if (multiShiftBtn){
        multiShiftBtn.textContent = `Shift: ${multiShiftEnabled ? "On" : "Off"}`;
        multiShiftBtn.classList.toggle("pq-on", multiShiftEnabled);
      }
      // turning off clears selection
      if (!multiShiftEnabled && Array.isArray(multiSel)) multiSel.length = 0;
            try{ mgCancel(); }catch(e){}
clearPreview();
      try{ draw(); }catch(e){}
      try{ updateShiftUi(); }catch(e){}
    }catch(e){}
  }

  if (multiShiftBtn){
    multiShiftBtn.addEventListener("click", () => setMultiShift(!multiShiftEnabled));
    // Hide on non-touch devices
    try{
      const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      if (!coarse) multiShiftBtn.style.display = "none";
    }catch(e){}
  }
const helpBtn = document.getElementById("helpBtn");
  
  const dailySwapHintBtn = document.getElementById("dailySwapHintBtn");
  if (dailySwapHintBtn) dailySwapHintBtn.addEventListener("click", () => { useSwapHint(); });
const hardBtn = document.getElementById("hardBtn");

  const themeBtn = document.getElementById("themeBtn");
  const themeStrength = document.getElementById("themeStrength");

  const pointsStat = document.getElementById("pointsStat");
  const nextPuzzleBtn = document.getElementById("nextPuzzleBtn");

  const timerStat = document.getElementById("timerStat");
  const scoreStat = document.getElementById("scoreStat");
  const streakStat = document.getElementById("streakStat");
  const bestStat = document.getElementById("bestStat");
  const saveStatus = document.getElementById("saveStatus");
  const pausePill = document.getElementById("pausePill");

  const assetStat = document.getElementById("assetStat");
  const phonePointsHud = document.getElementById("phonePointsHud");

  const hintPlaceBtn = document.getElementById("hintPlaceBtn");
  
  // no place hint on Daily challenge (ui)
  try{ if (__PQ_IS_DAILY && hintPlaceBtn) hintPlaceBtn.style.display = "none"; }catch(e){}
const helpPanel = document.getElementById("helpPanel");

  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeBtn = document.getElementById("resumeBtn");
  const pauseHelpBtn = document.getElementById("pauseHelpBtn");

  const resumePrompt = document.getElementById("resumePrompt");
  const resumePromptTitle = document.getElementById("resumePromptTitle");
  const resumePromptText = document.getElementById("resumePromptText");
  const resumePromptMeta = document.getElementById("resumePromptMeta");
  const resumePromptSaved = document.getElementById("resumePromptSaved");
  const resumePromptResumeBtn = document.getElementById("resumePromptResumeBtn");
  const resumePromptStartOverBtn = document.getElementById("resumePromptStartOverBtn");

  const modal = document.getElementById("modal");
  const finishLine = document.getElementById("finishLine");
  const ratingLine = document.getElementById("ratingLine");
  const ratingStars = document.getElementById("ratingStars");
  const ratingMedal = document.getElementById("ratingMedal");
  const ratingMeta = document.getElementById("ratingMeta");
  const bestLine = document.getElementById("bestLine");
  const playAgainBtn = document.getElementById("playAgainBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const pointsLineEl = document.getElementById("pointsLine");
  const sharePromptLine = document.getElementById("sharePromptLine");
  const copyShareBtn = document.getElementById("copyShareBtn");
  const nativeShareBtn = document.getElementById("nativeShareBtn");
  const shareStatusEl = document.getElementById("shareStatus");
  const returnHookLine = document.getElementById("returnHookLine");
  const returnHookPrimary = document.getElementById("returnHookPrimary");
  const returnHookSecondary = document.getElementById("returnHookSecondary");

  // ===== State (category-dependent) =====
  let CATEGORY_ID = "animals";
  let CATEGORY_NAME = "Animals";
  let PUZZLES = [{ name:"Puzzle 1", src:"myimagesmall.jpg" }];

  // ===== Global points =====
  let points = (() => {
    const raw = lsGet(GLOBAL_POINTS_KEY);
    const n = raw == null ? 0 : Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  })();
  ({
    fetchServerPoints,
    applySyncedPoints,
    syncPointsFromServer,
    savePoints,
    saveCurrentPuzzle,
  } = window.SnapshiftGamePoints.create({
    getPoints: () => points,
    setPoints: (nextPoints) => { points = nextPoints; },
    updateStats: () => updateStats(),
    draw: () => draw(),
  }));
  
  
  // ===== PATCH: Daily hint (misplaced tiles) =====
  const DAILY_HINT_COST = 25;         // points cost per use
  const DAILY_HINT_COOLDOWN_MS = 15000; // 15s cooldown
  let dailyHintLastAt = 0;
  let hintActiveUntil = 0;
  const NORMAL_SWAP_HINT_COST = 0; // free on normal puzzles
  const DAILY_SWAP_HINT_COST = 60;      // points cost per use
  let swapHintActiveUntil = 0;
  let swapPerfectActiveUntil = 0;
  let misplacedPositions = null;
  let suggestSwapPair = null;
  let canUseDailySwapHint = null;
  let swapHintCost = null;
  let canUseSwapHint = null;
  let useSwapHint = null;
  let useDailySwapHint = null;
  let canUseDailyHint = null;
  let useDailyHint = null;
  

  let perfectPopTimer = null;
  function showPerfectSwapPop(){
    try{
      const el = document.getElementById("perfectSwapPop");
      if (!el) return;
      el.classList.remove("pqShow");
      // force reflow to restart animation
      void el.offsetWidth;
      el.classList.add("pqShow");
      if (perfectPopTimer) clearTimeout(perfectPopTimer);
      perfectPopTimer = setTimeout(() => { try{ el.classList.remove("pqShow"); }catch(e){} }, 2100);
    }catch(e){}
  }

  
  // ===== PATCH: Sound + vibration for perfect swap =====
  function pqHaptic(){
    try{
      if (navigator && typeof navigator.vibrate === "function"){
        navigator.vibrate([40, 30, 50]);
      }
    }catch(e){}
  }

  function pqChime(){
    // Small "success" chime using Web Audio (no external files)
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const now = ctx.currentTime;

      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();

      o1.type = "sine";
      o2.type = "triangle";

      o1.frequency.setValueAtTime(880, now);       // A5
      o1.frequency.exponentialRampToValueAtTime(1320, now + 0.10); // E6-ish
      o2.frequency.setValueAtTime(660, now);       // E5
      o2.frequency.exponentialRampToValueAtTime(990, now + 0.10);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);

      o1.connect(g); o2.connect(g);
      g.connect(ctx.destination);

      o1.start(now);
      o2.start(now);
      o1.stop(now + 0.22);
      o2.stop(now + 0.22);

      setTimeout(() => { try{ ctx.close(); }catch(e){} }, 400);
    }catch(e){}
  }
function showPerfectSwapPopMsg(msg, isPerfect){
    try{
      let el = document.getElementById("perfectSwapPop");
      if (!el){
        el = document.createElement("div");
        el.id = "perfectSwapPop";
        el.style.position = "fixed";
        el.style.left = "50%";
        el.style.top = "18%";
        el.style.transform = "translate(-50%, -50%)";
        el.style.zIndex = "2147483647";
        el.style.display = "none";
        el.style.padding = "14px 18px";
        el.style.borderRadius = "18px";
        el.style.background = "rgba(0,0,0,0.70)";
        el.style.border = "1px solid rgba(255,255,255,0.14)";
        el.style.fontWeight = "900";
        el.style.fontSize = "18px";
        el.style.letterSpacing = "0.2px";
        el.style.backdropFilter = "blur(10px)";
        el.style.webkitBackdropFilter = "blur(10px)";
        el.style.textAlign = "center";
        el.style.pointerEvents = "none";
        const span = document.createElement("span");
        span.id = "perfectSwapText";
        span.textContent = "Swap Hint";
        el.appendChild(span);
        document.body.appendChild(el);
      }
      const t = document.getElementById("perfectSwapText");
      if (t) t.textContent = msg || "Swap Hint";
      el.style.boxShadow = isPerfect
        ? "0 0 28px rgba(0,210,255,0.28), 0 0 2px rgba(255,255,255,0.18)"
        : "0 0 22px rgba(255,200,0,0.22), 0 0 2px rgba(255,255,255,0.14)";
      el.style.color = isPerfect ? "#eaf6ff" : "#fff6dd";

      if (isPerfect){
        pqHaptic();
        pqChime();
      }


      // show + animate without relying on external CSS/classes
      el.style.display = "block";
      el.style.opacity = "0";
      el.style.transition = "opacity 180ms ease";
      requestAnimationFrame(() => { el.style.opacity = "1"; });
      clearTimeout(window.__pqPerfectPopT);
      window.__pqPerfectPopT = setTimeout(() => {
        try{
          el.style.opacity = "0";
          setTimeout(() => { try{ el.style.display = "none"; }catch(e){} }, 220);
        }catch(e){}
      }, 1900);
    }catch(e){}
  }
let swapPair = null; // [i,j]


  async function spendPoints(delta){
    try{
      const r = await fetch("/api/points_set.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ delta })
      });
      const j = await r.json().catch(()=>null);
      if (j && j.ok && j.loggedIn) {
        points = Number(j.points)||0;
        try{ lsSet(GLOBAL_POINTS_KEY, String(points)); }catch(e){}
        return true;
      }
    }catch(e){}
    return false;
  }

  ({
    misplacedPositions,
    suggestSwapPair,
    canUseDailySwapHint,
    swapHintCost,
    canUseSwapHint,
    useSwapHint,
    useDailySwapHint,
    canUseDailyHint,
    useDailyHint,
  } = window.SnapshiftGameHints.create({
    getTiles: () => tiles,
    getPoints: () => points,
    getDailyHintLastAt: () => dailyHintLastAt,
    setDailyHintLastAt: (value) => { dailyHintLastAt = value; },
    getHintActiveUntil: () => hintActiveUntil,
    setHintActiveUntil: (value) => { hintActiveUntil = value; },
    getSwapHintActiveUntil: () => swapHintActiveUntil,
    setSwapHintActiveUntil: (value) => { swapHintActiveUntil = value; },
    getSwapPerfectActiveUntil: () => swapPerfectActiveUntil,
    setSwapPerfectActiveUntil: (value) => { swapPerfectActiveUntil = value; },
    getSwapPair: () => swapPair,
    setSwapPair: (value) => { swapPair = value; },
    getDailyHintCost: () => DAILY_HINT_COST,
    getDailyHintCooldownMs: () => DAILY_HINT_COOLDOWN_MS,
    getNormalSwapHintCost: () => NORMAL_SWAP_HINT_COST,
    getDailySwapHintCost: () => DAILY_SWAP_HINT_COST,
    isDailyRoute: () => __PQ_IS_DAILY,
    spendPoints: (delta) => spendPoints(delta),
    updateStats: () => updateStats(),
    draw: () => draw(),
    showPerfectSwapPopMsg: (msg, isPerfect) => showPerfectSwapPopMsg(msg, isPerfect),
    showPerfectSwapPop: () => showPerfectSwapPop(),
  }));
async function addServerPoints(delta, meta = null){
    // Server-authoritative increment (prevents overwriting totals when local points is stale)
    try{
      const payload = { delta: Math.trunc(Number(delta)||0) };
      if (meta && typeof meta === "object") {
        Object.keys(meta).forEach((key) => {
          if (meta[key] !== undefined) payload[key] = meta[key];
        });
      }
      const r = await fetch("/api/points_set.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(()=>null);
      if (j && j.ok && j.loggedIn) return Number(j.points)||0;
    }catch(e){}
    return null;
  }

  const POINT_MILESTONE_THRESHOLDS = [5000, 20000, 50000, 100000, 250000, 500000, 1000000];

  function formatPointMilestone(value){
    const n = Math.max(0, Math.floor(Number(value) || 0));
    try{ return n.toLocaleString("en-US"); }catch(e){ return String(n); }
  }

  function pointMilestoneStorageKey(threshold){
    try{
      const user = String(AUTH_USER_TAG || "anon").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "user";
      return "snapshift_points_milestone:" + user + ":" + Math.max(0, Math.floor(Number(threshold) || 0));
    }catch(e){
      return "";
    }
  }

  function hasSeenPointMilestone(threshold){
    try{
      const key = pointMilestoneStorageKey(threshold);
      return !!key && localStorage.getItem(key) === "1";
    }catch(e){
      return false;
    }
  }

  function markPointMilestoneSeen(threshold){
    try{
      const key = pointMilestoneStorageKey(threshold);
      if (key) localStorage.setItem(key, "1");
    }catch(e){}
  }

  function maybeShowPointsMilestone(beforePoints, afterPoints, meta = {}){
    try{
      const before = Math.max(0, Math.floor(Number(beforePoints)));
      const after = Math.max(0, Math.floor(Number(afterPoints)));
      if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) return;

      const crossed = POINT_MILESTONE_THRESHOLDS
        .filter((threshold) => before < threshold && after >= threshold)
        .filter((threshold) => !hasSeenPointMilestone(threshold));
      if (!crossed.length) return;

      crossed.forEach((threshold) => markPointMilestoneSeen(threshold));
      const threshold = crossed[crossed.length - 1];
      const label = formatPointMilestone(threshold);
      setTimeout(() => {
        try{ showAccomplishmentToast("Points Milestone", label + " Shift Points reached", "points", 4600); }catch(e){}
        try{ spawnPointsFloat(label + " POINTS", "points", { big: true }); }catch(e){}
        try{ playCoinCascade(Math.min(900, Math.max(220, Math.floor(threshold / 80))), { big: true, source: (meta && meta.source) || "points" }); }catch(e){}
      }, 320);
    }catch(e){}
  }

  function trifectaIdentityKey(meta = {}){
    try{
      const cat = String(meta.categoryId || CATEGORY_ID || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "unknown";
      const src = normalizeUnlockSrc(meta.puzzleSrc || "");
      const idx = Math.max(0, Math.floor(Number(meta.puzzleIdx ?? currentPuzzleIdx) || 0));
      const user = String(AUTH_USER_TAG || "anon").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "user";
      return src ? `snapshift_trifecta_toast:${user}:${cat}:src:${src}` : `snapshift_trifecta_toast:${user}:${cat}:idx:${idx}`;
    }catch(e){
      return "";
    }
  }

  function hasSeenTrifectaToast(meta = {}){
    try{
      const key = trifectaIdentityKey(meta);
      return !!key && localStorage.getItem(key) === "1";
    }catch(e){
      return false;
    }
  }

  function markTrifectaToastSeen(meta = {}){
    try{
      const key = trifectaIdentityKey(meta);
      if (key) localStorage.setItem(key, "1");
    }catch(e){}
  }

  async function fetchPuzzleTrifectaStatus(meta = {}){
    if (!AUTH_LOGGED_IN || !meta || meta.isDaily) return null;
    try{
      const qs = new URLSearchParams({
        category_id: String(meta.categoryId || CATEGORY_ID || ""),
        puzzle_idx: String(Math.max(0, Math.floor(Number(meta.puzzleIdx ?? currentPuzzleIdx) || 0))),
      });
      const src = normalizeUnlockSrc(meta.puzzleSrc || "");
      if (src) qs.set("puzzle_src", src);
      qs.set("_", String(Date.now()));
      const r = await fetch(`/api/puzzle_trifecta_status.php?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      return (j && j.ok && j.loggedIn) ? j : null;
    }catch(e){
      return null;
    }
  }

  let unlockedCount = 1;
  let currentPuzzleIdx = 0;

  function loadCategoryProgress(){
    const built = syncUnlockedStateFromCache();
    if (AUTH_LOGGED_IN && built.changed) {
      pushUnlockedToServer(unlockedCache).then((u)=>{
        if (u && typeof u === 'object') {
          unlockedCache = u;
          syncUnlockedStateFromCache();
          try{ rebuildPuzzleDropdown(); updateUnlockUI(); updateStats(); }catch(e){}
        }
      }).catch(()=>{});
    }

    currentPuzzleIdx = getFirstUnlockedIndex();
    if (!isPuzzleUnlockedIndex(currentPuzzleIdx)) currentPuzzleIdx = getFirstUnlockedIndex();
  }
  function saveUnlocked(){
    if (!unlockedCache || typeof unlockedCache !== 'object') unlockedCache = {};
    unlockedCache[CATEGORY_ID] = { version: 2, unlockedSrcs: Array.from(unlockedSrcSet), updatedAt: new Date().toISOString() };
    if (AUTH_LOGGED_IN) {
      pushUnlockedToServer(unlockedCache).then((u)=>{ if (u && typeof u === 'object') { unlockedCache = u; syncUnlockedStateFromCache(); } }).catch(()=>{});
    }
  }
  // ===== Difficulty =====
  const DIFFICULTIES = {
    easy: { label: "Easy", rows: 4, cols: 6 },
    medium: { label: "Medium", rows: 6, cols: 9 },
    hard: { label: "Hard", rows: 8, cols: 12 },
  };
  let ROWS = 4, COLS = 6, diffKey = "easy";
  let setDifficulty = null;
  let totalTiles = null;
  let indexToRC = null;
  let rcToIndex = null;
  let fmtTime = null;
  let bestKey = null;
  let getBestMs = null;
  let setBestMs = null;
  let isLockedPos = null;
  let isSolved = null;
  let countCorrect = null;
  let makeDerangement = null;
  ({
    setDifficulty,
    totalTiles,
    indexToRC,
    rcToIndex,
    fmtTime,
    bestKey,
    getBestMs,
    setBestMs,
    isLockedPos,
    isSolved,
    countCorrect,
    makeDerangement,
  } = window.SnapshiftGameBoardUtils.create({
    getDifficulties: () => DIFFICULTIES,
    getDiffKey: () => diffKey,
    setDiffKey: (value) => { diffKey = value; },
    getRows: () => ROWS,
    setRows: (value) => { ROWS = value; },
    getCols: () => COLS,
    setCols: (value) => { COLS = value; },
    getCategoryId: () => CATEGORY_ID,
    getCurrentPuzzleIdx: () => currentPuzzleIdx,
    getBestKeyPrefix: () => BEST_KEY_PREFIX,
    lsGet: (key) => lsGet(key),
    lsSet: (key, value) => lsSet(key, value),
    getLocked: () => locked,
    getTiles: () => tiles,
  }));

  // ===== Game state =====
  const img = new Image();
  let tiles = [];
  let locked = [];
  let movesMade = 0;
  let selected = null;

  // Group move
  let multiSel = [];
  let srcRelOrder = [];
  let previewDestIndex = null;
  let previewTargetIdxs = null;
  let previewValid = false;
  let lastPointerType = "mouse";
  let clearPreview = null;
  let clearSelection = null;
  let drawPreviewOutline = null;
  let computeRelFromSelection = null;
  let computeTargetsFromAnchor = null;
  let applyTrueMoveGroup = null;
  let toggleMultiSel = null;
  let computeGroupTargets = null;
  let setPreviewDestination = null;
  let applyGroupMove = null;

  // ===== Tablet Multi-Select (two-finger) =====
  // Two-finger tap toggles selection. Two-finger drag previews a group-move; release applies.
  const activePointers = new Map(); // pointerId -> {x,y, idx}
  let mtActive = false;
  let mtDidMove = false;
  let suppressNextClick = false;


  let score = 0;
  let streak = 0;

  let running = false;
  let startTime = 0;
  let elapsedMs = 0;
  let rafId = null;

  let paused = false;

  let hideAllLines = false;
  let flashWinUntil = 0;
  let flashWinOn = true;
  let flashWinLastToggle = 0;
  let updateStats = null;
  let draw = null;
  let submitDailyScoreIfNeeded = null;
  let computePuzzleMedalFromRun = null;
  let updateCompletionRatingDisplay = null;
  let finishGame = null;
  let completionShareUrl = null;
  let buildCompletionShareText = null;
  let setShareStatus = null;
  let copyCompletionShareText = null;
  let nativeShareCompletion = null;
  let updateCompletionShareUi = null;
  let updateReturnHookUi = null;
  let handlePointerDown = null;
  let handlePointerMove = null;
  let handlePointerLeave = null;
  let handlePointerUp = null;
  let handlePointerCancel = null;
  let handleCanvasClick = null;
  let resetBoardState = null;
  let loadPuzzleImage = null;
  let startNewGame = null;
  let syncLandscapeRequirement = null;
  let installLayoutRuntime = null;
  let renderLanding = null;
  let showLanding = null;
  let dailyPuzzleNameFromSrc = null;
  let openDailyRoute = null;
  let redirectLockedPuzzleRequest = null;
  let openCategory = null;
  let maybeCelebrateStreakMilestone = null;
  let maybeClaimStreakRewards = null;
  let installStreakEffects = null;

  let themeEnabled = lsGet(THEME_PREF_KEY) !== "0";
  let themeAlpha = (() => {
    const raw = lsGet(THEME_ALPHA_KEY);
    const n = raw == null ? 0.85 : Number(raw);
    if (!Number.isFinite(n)) return 0.85;
    return Math.max(0, Math.min(1, n));
  })();
  let applyThemeToDom = null;
  let applyAdminThemeTokens = null;
  let applyThemeFromJson = null;
  let handleImageLoad = null;
  let handleImageError = null;
  let ensureLocalStateMatchesUser = null;
  let boot = null;
  let startApp = null;

  let hardMode = lsGet(HARD_MODE_PREF_KEY) === "1";
  const correctFx = new Map();
  let resizeCanvasToFit = null;
  let tileIndexFromCanvas = null;
  let canvasToLocalCoords = null;
  let spawnCorrectFX = null;
  let maybeTriggerFX = null;
  let drawCorrectFX = null;
  ({
    clearPreview,
    clearSelection,
    drawPreviewOutline,
    computeRelFromSelection,
    computeTargetsFromAnchor,
    applyTrueMoveGroup,
    toggleMultiSel,
    computeGroupTargets,
    setPreviewDestination,
    applyGroupMove,
  } = window.SnapshiftGameBoardInteraction.create({
    getCtx: () => ctx,
    getRows: () => ROWS,
    getCols: () => COLS,
    indexToRC: (index) => indexToRC(index),
    rcToIndex: (r, c) => rcToIndex(r, c),
    getSelected: () => selected,
    setSelected: (value) => { selected = value; },
    getMultiSel: () => multiSel,
    setMultiSel: (value) => { multiSel = value; },
    getSrcRelOrder: () => srcRelOrder,
    setSrcRelOrder: (value) => { srcRelOrder = value; },
    getPreviewDestIndex: () => previewDestIndex,
    setPreviewDestIndex: (value) => { previewDestIndex = value; },
    getPreviewTargetIdxs: () => previewTargetIdxs,
    setPreviewTargetIdxs: (value) => { previewTargetIdxs = value; },
    getPreviewValid: () => previewValid,
    setPreviewValid: (value) => { previewValid = !!value; },
    getTiles: () => tiles,
    setTiles: (value) => { tiles = value; },
    getLocked: () => locked,
    setLocked: (value) => { locked = value; },
    getMovesMade: () => movesMade,
    setMovesMade: (value) => { movesMade = value; },
    setStreak: (value) => { streak = value; },
    isLockedPos: (posIndex) => isLockedPos(posIndex),
    countCorrect: () => countCorrect(),
    maybeTriggerFX: (oldTiles, newTiles, indicesToCheck) => maybeTriggerFX(oldTiles, newTiles, indicesToCheck),
    awardMovePoints: (newlyCorrect) => awardMovePoints(newlyCorrect),
    updateStats: () => updateStats(),
    draw: () => draw(),
    markProgressDirty: () => markProgressDirty(),
    getCompletedPuzzleState: () => completedPuzzleState,
    setCompletedPuzzleState: (value) => { completedPuzzleState = !!value; },
    isDailyRoute: () => __PQ_IS_DAILY,
    updateCompletionRatingDisplay: (value) => updateCompletionRatingDisplay(value),
    isSolved: () => isSolved(),
    finishGame: () => finishGame(),
    updateShiftUi: () => updateShiftUi(),
  }));
  ({
    resizeCanvasToFit,
    tileIndexFromCanvas,
    canvasToLocalCoords,
    spawnCorrectFX,
    maybeTriggerFX,
    drawCorrectFX,
  } = window.SnapshiftGameRenderHelpers.create({
    getCanvas: () => canvas,
    getCtx: () => ctx,
    getBoardCard: () => boardCard,
    getRows: () => ROWS,
    getCols: () => COLS,
    rcToIndex: (r, c) => rcToIndex(r, c),
    fxEnabledEffective: () => fxEnabledEffective(),
    isDailyRoute: () => __PQ_IS_DAILY,
    getCorrectFx: () => correctFx,
    getCorrectFxMs: () => CORRECT_FX_MS,
    getCorrectFxSparks: () => CORRECT_FX_SPARKS,
    getCorrectFxGlow: () => CORRECT_FX_GLOW,
  }));

  function pointsMultiplier(){ return hardMode ? HARD_MODE_POINTS_MULT : 1; }
  function fxEnabledEffective(){ return !hardMode && !__PQ_IS_DAILY; }

  ({
    applyThemeToDom,
    applyAdminThemeTokens,
    applyThemeFromJson,
  } = window.SnapshiftGameTheme.create({
    getThemeEnabled: () => themeEnabled,
    setThemeEnabled: (value) => { themeEnabled = !!value; },
    getThemeAlpha: () => themeAlpha,
    setThemeAlpha: (value) => { themeAlpha = value; },
    getThemePrefKey: () => THEME_PREF_KEY,
    getThemeAlphaKey: () => THEME_ALPHA_KEY,
    lsSet: (key, value) => lsSet(key, value),
    refs: {
      getThemeStrengthEl: () => themeStrength,
      getFrogImgEl: () => document.getElementById("frogImg"),
    },
  }));
  ({
    handleImageLoad,
    handleImageError,
    ensureLocalStateMatchesUser,
    boot,
    startApp,
  } = window.SnapshiftGameLifecycle.create({
    isGameScreenHidden: () => gameScreen.classList.contains("hidden"),
    getPendingResumeProgress: () => pendingResumeProgress,
    setPendingResumeProgress: (value) => { pendingResumeProgress = value; },
    getCategoryId: () => CATEGORY_ID,
    getCurrentPuzzleIdx: () => currentPuzzleIdx,
    getAuthLoggedIn: () => AUTH_LOGGED_IN,
    setAuthLoggedIn: (value) => { AUTH_LOGGED_IN = !!value; },
    getAuthUserTag: () => AUTH_USER_TAG,
    setAuthUserTag: (value) => { AUTH_USER_TAG = String(value || ""); },
    hasDifficulty: (value) => !!value && Object.prototype.hasOwnProperty.call(DIFFICULTIES, String(value)),
    setDifficultyControlValue: (value) => { if (sizeSel) sizeSel.value = String(value); },
    getDifficultyControlValue: () => sizeSel ? String(sizeSel.value || diffKey) : String(diffKey || "easy"),
    setDifficulty: (value) => setDifficulty(value),
    isDailyRoute: () => __PQ_IS_DAILY,
    currentPuzzleMeta: () => currentPuzzleMeta(),
    decodeMaybeTwice: (value) => decodeMaybeTwice(value),
    normalizeUnlockSrc: (value) => normalizeUnlockSrc(value),
    readDailyProgressBackup: (dayKey, routeSrc, opts) => readDailyProgressBackup(dayKey, routeSrc, opts),
    fetchDailyProgressForDay: (dayKey, opts) => fetchDailyProgressForDay(dayKey, opts),
    fetchCurrentPuzzleProgressFromServer: () => fetchCurrentPuzzleProgressFromServer(),
    fetchContinueStateFromServer: () => fetchContinueStateFromServer(),
    fetchLatestProgressFromServer: () => fetchLatestProgressFromServer(),
    applyProgressSnapshot: (progress) => applyProgressSnapshot(progress),
    forceSolvedSnapshot: (progress) => forceSolvedSnapshot(progress),
    askResumeProgress: (progress) => askResumeProgress(progress),
    buildProgressKeyFromMeta: (progress) => buildProgressKeyFromMeta(progress),
    clearProgressOnServer: (key, opts) => clearProgressOnServer(key, opts),
    setLastProgressFingerprint: (value) => { lastProgressFingerprint = String(value || ""); },
    setCompletedPuzzleState: (value) => { completedPuzzleState = !!value; },
    updateCompletionRatingDisplay: (value) => updateCompletionRatingDisplay(value),
    scrambleWithoutTimer: () => scrambleWithoutTimer(),
    updateStats: () => updateStats(),
    draw: () => draw(),
    resizeCanvasToFit: () => resizeCanvasToFit(),
    getCtx: () => ctx,
    getCanvas: () => canvas,
    setPoints: (value) => { points = Math.max(0, Math.floor(Number(value) || 0)); },
    fetchServerPoints: () => fetchServerPoints(),
    syncSaveStatusForAuth: () => syncSaveStatusForAuth(),
    setProgressSaveSeq: (value) => { progressSaveSeq = Math.max(0, Math.floor(Number(value) || 0)); },
    setLastAcceptedProgressSeq: (value) => { lastAcceptedProgressSeq = Math.max(0, Math.floor(Number(value) || 0)); },
    fetchUnlockedFromServer: () => fetchUnlockedFromServer(),
    setUnlockedCache: (value) => { unlockedCache = value; },
    applyThemeFromJson: () => applyThemeFromJson(),
    applyThemeToDom: () => applyThemeToDom(),
    parseRouteHash: () => parseRouteHash(),
    openDailyRoute: (route) => openDailyRoute(route),
    loadPuzzleCatalogFromIndex: () => loadPuzzleCatalogFromIndex(),
    clearRoutePreload: () => clearRoutePreload(),
    catFromPuzzleSrc: (src) => catFromPuzzleSrc(src),
    findPuzzleBySrcInCatalog: (src) => findPuzzleBySrcInCatalog(src),
    hasCategory: (catId) => !!catId && Object.prototype.hasOwnProperty.call(PUZZLE_CATALOG, catId),
    openCategory: (catId, opts) => openCategory(catId, opts),
    normalizeCatId: (value) => normalizeCatId(value),
    parseCatFromHash: () => parseCatFromHash(),
    showLanding: () => showLanding(),
    refreshLandingContinueButtonState: () => refreshLandingContinueButtonState(),
    syncPointsFromServer: () => syncPointsFromServer(),
    persistProgressNow: (opts) => persistProgressNow(opts),
    getCompletedPuzzleState: () => completedPuzzleState,
    isSolved: () => isSolved(),
    forcePersistCompletedProgress: () => forcePersistCompletedProgress(),
    isRunning: () => running,
  }));
  ({
    maybeCelebrateStreakMilestone,
    maybeClaimStreakRewards,
    installStreakEffects,
  } = window.SnapshiftGameStreaks.create({
    getPoints: () => points,
    setPoints: (value) => { points = Math.max(0, Math.floor(Number(value) || 0)); },
    savePoints: () => savePoints(),
    updateStats: () => updateStats(),
    draw: () => draw(),
    maybeShowPointsMilestone: (beforePoints, afterPoints, meta) => maybeShowPointsMilestone(beforePoints, afterPoints, meta),
    sumAwardedPoints: (awarded) => sumAwardedPoints(awarded),
    mgShowToast: (message, duration) => mgShowToast(message, duration),
    showAccomplishmentToast: (title, text, tone, duration) => showAccomplishmentToast(title, text, tone, duration),
    spawnPointsFloat: (text, tone, opts) => spawnPointsFloat(text, tone, opts),
    playCoinCascade: (amount, opts) => playCoinCascade(amount, opts),
  }));
  installStreakEffects();
  ({
    updateStats,
    draw,
  } = window.SnapshiftGameHudRender.create({
    fmtTime: (value) => fmtTime(value),
    getElapsedMs: () => elapsedMs,
    getScore: () => score,
    getStreak: () => streak,
    getBestMs: () => getBestMs(),
    getPaused: () => paused,
    getThemeEnabled: () => themeEnabled,
    getHardMode: () => hardMode,
    getImg: () => img,
    getPuzzles: () => PUZZLES,
    getCurrentPuzzleIdx: () => currentPuzzleIdx,
    getCompletedPuzzleState: () => completedPuzzleState,
    isSolved: () => isSolved(),
    getCategoryName: () => CATEGORY_NAME,
    placeCost: () => placeCost(),
    getPoints: () => points,
    updateUnlockUI: () => updateUnlockUI(),
    canUseSwapHint: () => canUseSwapHint(),
    swapHintCost: () => swapHintCost(),
    resizeCanvasToFit: () => resizeCanvasToFit(),
    getCanvas: () => canvas,
    getCtx: () => ctx,
    getRows: () => ROWS,
    getCols: () => COLS,
    getTiles: () => tiles,
    getHideAllLines: () => hideAllLines,
    getFlashWinUntil: () => flashWinUntil,
    getFlashWinOn: () => flashWinOn,
    isDailyRoute: () => __PQ_IS_DAILY,
    getHintActiveUntil: () => hintActiveUntil,
    getSwapHintActiveUntil: () => swapHintActiveUntil,
    getSwapPerfectActiveUntil: () => swapPerfectActiveUntil,
    getSwapPair: () => swapPair,
    getLocked: () => locked,
    getSelected: () => selected,
    getMultiSel: () => multiSel,
    indexToRC: (index) => indexToRC(index),
    drawCorrectFX: (i, dx, dy, tileW, tileH, now) => drawCorrectFX(i, dx, dy, tileW, tileH, now),
    drawPreviewOutline: (tileW, tileH) => drawPreviewOutline(tileW, tileH),
    refs: {
      getTimerStatEl: () => timerStat,
      getScoreStatEl: () => scoreStat,
      getStreakStatEl: () => streakStat,
      getBestStatEl: () => bestStat,
      getPausePillEl: () => pausePill,
      getFsBtnEl: () => fsBtn,
      getPauseBtnEl: () => pauseBtn,
      getThemeBtnEl: () => themeBtn,
      getHardBtnEl: () => hardBtn,
      getAssetStatEl: () => assetStat,
      getCategoryStatEl: () => categoryStat,
      getHudCategoryEl: () => hudCategory,
      getHintPlaceBtnEl: () => hintPlaceBtn,
      getGlobalPointsPillEl: () => globalPointsPill,
      getDailySwapHintBtnEl: () => dailySwapHintBtn,
    },
  }));
  ({
    submitDailyScoreIfNeeded,
    computePuzzleMedalFromRun,
    updateCompletionRatingDisplay,
    finishGame,
    completionShareUrl,
    buildCompletionShareText,
    setShareStatus,
    copyCompletionShareText,
    nativeShareCompletion,
    updateCompletionShareUi,
    updateReturnHookUi,
  } = window.SnapshiftGameCompletion.create({
    getDiffKey: () => diffKey,
    parseRouteHash: () => parseRouteHash(),
    applyDailyUiLocks: () => applyDailyUiLocks(),
    getMovesMade: () => movesMade,
    calcMoveEfficiency: (moves) => calcMoveEfficiency(moves),
    maybeCelebrateStreakMilestone: (current, lastCompleted, submittedDay) => maybeCelebrateStreakMilestone(current, lastCompleted, submittedDay),
    maybeClaimStreakRewards: (current, lastCompleted, submittedDay) => maybeClaimStreakRewards(current, lastCompleted, submittedDay),
    getElapsedMs: () => elapsedMs,
    getScore: () => score,
    setScore: (value) => { score = Math.max(0, Math.floor(Number(value) || 0)); },
    setPaused: (value) => setPaused(value),
    stopTimer: () => stopTimer(),
    getTimeBonusFactor: () => TIME_BONUS_FACTOR,
    pointsMultiplier: () => pointsMultiplier(),
    calcWinPoints: () => calcWinPoints(),
    getPoints: () => points,
    setPoints: (value) => { points = Math.max(0, Math.floor(Number(value) || 0)); },
    currentPuzzleMeta: () => currentPuzzleMeta(),
    getDifficultyLabel: (key) => (DIFFICULTIES[key] && DIFFICULTIES[key].label) ? DIFFICULTIES[key].label : String(key || "easy"),
    addServerPoints: (amount, meta) => addServerPoints(amount, meta),
    maybeShowPointsMilestone: (beforePoints, afterPoints, meta) => maybeShowPointsMilestone(beforePoints, afterPoints, meta),
    updateStats: () => updateStats(),
    draw: () => draw(),
    savePoints: () => savePoints(),
    setCompletedPuzzleState: (value) => { completedPuzzleState = !!value; },
    setHideAllLines: (value) => { hideAllLines = !!value; },
    clearCorrectFx: () => correctFx.clear(),
    clearSelection: () => clearSelection(),
    collectProgressSnapshot: (opts) => collectProgressSnapshot(opts),
    writeDailyProgressBackup: (snapshot) => writeDailyProgressBackup(snapshot),
    persistCompletedProgressNow: (completedAtIso) => persistProgressNow({
      force: true,
      includeSolved: true,
      completed: true,
      completedAt: completedAtIso,
    }),
    forcePersistCompletedProgress: () => forcePersistCompletedProgress(),
    fetchPuzzleTrifectaStatus: (meta) => fetchPuzzleTrifectaStatus(meta),
    hasSeenTrifectaToast: (meta) => hasSeenTrifectaToast(meta),
    markTrifectaToastSeen: (meta) => markTrifectaToastSeen(meta),
    getBestMs: () => getBestMs(),
    setBestMs: (value) => setBestMs(value),
    getDifficultyDefinition: (key) => DIFFICULTIES[key] || { label: String(key || "easy") },
    totalTiles: () => totalTiles(),
    fmtTime: (value) => fmtTime(value),
    getCategoryName: () => CATEGORY_NAME,
    getRows: () => ROWS,
    getCols: () => COLS,
    isDailyRoute: () => __PQ_IS_DAILY,
    showAccomplishmentToast: (title, text, tone, duration) => showAccomplishmentToast(title, text, tone, duration),
    triggerDailyCompletionPulse: () => triggerDailyCompletionPulse(),
    spawnPointsFloat: (text, tone, opts) => spawnPointsFloat(text, tone, opts),
    playCoinCascade: (amount, opts) => playCoinCascade(amount, opts),
    playMedalFanfare: (tone, opts) => playMedalFanfare(tone, opts),
    startCompletionFlash: (onDone) => startCompletionFlash(onDone),
    getPuzzles: () => PUZZLES,
    getCurrentPuzzleIdx: () => currentPuzzleIdx,
    refs: {
      getRatingLineEl: () => ratingLine,
      getRatingStarsEl: () => ratingStars,
      getRatingMedalEl: () => ratingMedal,
      getRatingMetaEl: () => ratingMeta,
      getFinishLineEl: () => finishLine,
      getBestLineEl: () => bestLine,
      getPointsLineEl: () => pointsLineEl,
      getSharePromptLineEl: () => sharePromptLine,
      getShareStatusEl: () => shareStatusEl,
      getNativeShareBtnEl: () => nativeShareBtn,
      getReturnHookLineEl: () => returnHookLine,
      getReturnHookPrimaryEl: () => returnHookPrimary,
      getReturnHookSecondaryEl: () => returnHookSecondary,
      getModalEl: () => modal,
    },
  }));
  ({
    handlePointerDown,
    handlePointerMove,
    handlePointerLeave,
    handlePointerUp,
    handlePointerCancel,
    handleClick: handleCanvasClick,
  } = window.SnapshiftGameInput.create({
    getCanvas: () => canvas,
    canvasToLocalCoords: (evt) => canvasToLocalCoords(evt),
    tileIndexFromCanvas: (x, y) => tileIndexFromCanvas(x, y),
    getActivePointers: () => activePointers,
    getLastPointerType: () => lastPointerType,
    setLastPointerType: (value) => { lastPointerType = value; },
    getMultiShiftEnabled: () => multiShiftEnabled,
    getMultiMoveArmed: () => multiMoveArmed,
    getMultiSel: () => multiSel,
    getLocked: () => locked,
    toggleMultiSel: (idx) => toggleMultiSel(idx),
    applyGroupMove: (idx) => applyGroupMove(idx),
    setMultiShift: (on) => setMultiShift(on),
    updateShiftUi: () => updateShiftUi(),
    mgCancel: () => mgCancel(),
    setSuppressNextClick: (value) => { suppressNextClick = !!value; },
    getSuppressNextClick: () => suppressNextClick,
    setMtActive: (value) => { mtActive = !!value; },
    getMtActive: () => mtActive,
    setMtDidMove: (value) => { mtDidMove = !!value; },
    getMtDidMove: () => mtDidMove,
    setPreviewDestination: (idx) => setPreviewDestination(idx),
    getPreviewDestIndex: () => previewDestIndex,
    getPreviewValid: () => previewValid,
    clearPreview: () => clearPreview(),
    draw: () => draw(),
    getPaused: () => paused,
    getImg: () => img,
    isModalOpen: () => modal.classList.contains("show"),
    isRunning: () => running,
    getElapsedMs: () => elapsedMs,
    startTimer: () => startTimer(),
    getSelected: () => selected,
    setSelected: (value) => { selected = value; },
    getTiles: () => tiles,
    setLocked: (value) => { locked = value; },
    getMovesMade: () => movesMade,
    setMovesMade: (value) => { movesMade = Math.max(0, Math.floor(Number(value) || 0)); },
    countCorrect: () => countCorrect(),
    maybeTriggerFX: (oldTiles, newTiles, indices) => maybeTriggerFX(oldTiles, newTiles, indices),
    awardMovePoints: (count) => awardMovePoints(count),
    setStreak: (value) => { streak = Math.max(0, Math.floor(Number(value) || 0)); },
    updateStats: () => updateStats(),
    markProgressDirty: () => markProgressDirty(),
    getCompletedPuzzleState: () => completedPuzzleState,
    setCompletedPuzzleState: (value) => { completedPuzzleState = !!value; },
    updateCompletionRatingDisplay: (value) => updateCompletionRatingDisplay(value),
    isSolved: () => isSolved(),
    finishGame: () => finishGame(),
  }));
  ({
    resetBoardState,
    scrambleWithoutTimer,
    startNewGame,
    loadPuzzleImage,
  } = window.SnapshiftGameSession.create({
    totalTiles: () => totalTiles(),
    setTiles: (value) => { tiles = value; },
    setLocked: (value) => { locked = value; },
    clearSelection: () => clearSelection(),
    setScore: (value) => { score = Math.max(0, Math.floor(Number(value) || 0)); },
    setStreak: (value) => { streak = Math.max(0, Math.floor(Number(value) || 0)); },
    setMovesMade: (value) => { movesMade = Math.max(0, Math.floor(Number(value) || 0)); },
    setHideAllLines: (value) => { hideAllLines = !!value; },
    setFlashWinUntil: (value) => { flashWinUntil = Math.max(0, Number(value) || 0); },
    setFlashWinOn: (value) => { flashWinOn = !!value; },
    setFlashWinLastToggle: (value) => { flashWinLastToggle = Math.max(0, Number(value) || 0); },
    clearCorrectFx: () => correctFx.clear(),
    setPausedState: (value) => { paused = !!value; },
    hidePauseOverlay: () => pauseOverlay.classList.remove("show"),
    stopTimer: () => stopTimer(),
    setElapsedMs: (value) => { elapsedMs = Math.max(0, Number(value) || 0); },
    hideHelpPanel: () => { helpPanel.style.display = "none"; },
    setCompletedPuzzleState: (value) => { completedPuzzleState = !!value; },
    updateCompletionRatingDisplay: (value) => updateCompletionRatingDisplay(value),
    resizeCanvasToFit: () => resizeCanvasToFit(),
    updateStats: () => updateStats(),
    draw: () => draw(),
    makeDerangement: (count) => makeDerangement(count),
    markProgressDirty: () => markProgressDirty(),
    clearProgressOnServer: (key, opts) => clearProgressOnServer(key, opts),
    buildProgressKeyFromMeta: (progress) => buildProgressKeyFromMeta(progress),
    interceptScrambleRequest: () => {
      if (completedPuzzleState) {
        try{ updateStats(); draw(); }catch(e){}
        return true;
      }
      return false;
    },
    isDailyRoute: () => __PQ_IS_DAILY,
    startTimer: () => startTimer(),
    persistProgressNow: (opts) => persistProgressNow(opts),
    getPuzzles: () => PUZZLES,
    setCurrentPuzzleIdx: (value) => { currentPuzzleIdx = Math.max(0, Math.floor(Number(value) || 0)); },
    isPuzzleUnlockedIndex: (idx) => isPuzzleUnlockedIndex(idx),
    saveCurrentPuzzle: () => saveCurrentPuzzle(),
    rebuildPuzzleDropdown: () => rebuildPuzzleDropdown(),
    setPuzzleSelectValue: (value) => { puzzleSel.value = String(value || "0"); },
    setImageSrc: (value) => { img.src = value; },
    setAssetLoadingText: (name) => { if (assetStat) assetStat.textContent = `Assets: loading (${name})…`; },
    updateUnlockUI: () => updateUnlockUI(),
  }));
  const compactSidebarMap = [
    ['backToCategoriesBtn','Home','Home'],
    ['startBtn','Shuffle','Shuffle'],
    ['pauseBtn','Pause','Pause'],
    ['fsBtn','Full-screen','Full-screen'],
    ['muteBtn','Mute','Mute'],
    ['multiShiftBtn','Shift','Shift Mode'],
    ['multiMoveBtn','Move','Move Group'],
    ['dailySwapHintBtn','Swap Hint','Swap Hint'],
    ['hardBtn','Easy Mode','Easy Mode'],
    ['helpBtn','Help','Help'],
    ['nextPuzzleBtn','Next','Next Puzzle'],
    ['themeBtn','Theme','Theme Background']
  ];
  const coarsePhoneMq = window.matchMedia('(pointer: coarse) and (max-width: 820px)');
  const portraitMq = window.matchMedia('(orientation: portrait)');
  ({
    applyCompactSidebar,
    syncLandscapeRequirement,
    installLayoutRuntime,
  } = window.SnapshiftGameLayout.create({
    getCompactMap: () => compactSidebarMap,
    getCoarsePhoneMq: () => coarsePhoneMq,
    getPortraitMq: () => portraitMq,
    getGameScreenEl: () => document.getElementById('gameScreen'),
    getCanvasWrapEl: () => document.querySelector('#gameScreen .canvasWrap'),
    getCanvasEl: () => document.getElementById('board'),
    getRows: () => ROWS,
    getCols: () => COLS,
    getUiMuted: () => pqUiMuted,
    updateMuteButton: () => updateMuteButton(),
    draw: () => draw(),
  }));
  ({
    renderLanding,
    showLanding,
    dailyPuzzleNameFromSrc,
    openDailyRoute,
    redirectLockedPuzzleRequest,
    openCategory,
  } = window.SnapshiftGameNavigation.create({
    lsGet: (key) => lsGet(key),
    getLastCatKey: () => LAST_CAT_KEY,
    getPoints: () => points,
    getCategories: () => CATEGORIES,
    getPuzzleCatalog: () => PUZZLE_CATALOG,
    openCategory: (catId, opts) => openCategory(catId, opts),
    persistProgressNow: (opts) => persistProgressNow(opts),
    stopTimer: () => stopTimer(),
    setPausedState: (value) => { paused = !!value; },
    closeResumePrompt: (value) => closeResumePrompt(value),
    clearSelection: () => clearSelection(),
    clearRoutePreload: () => clearRoutePreload(),
    decodeMaybeTwice: (value) => decodeMaybeTwice(value),
    setCategoryId: (value) => { CATEGORY_ID = String(value || ""); },
    getCategoryId: () => CATEGORY_ID,
    setCategoryName: (value) => { CATEGORY_NAME = String(value || ""); },
    setPuzzles: (value) => { PUZZLES = value; },
    getPuzzles: () => PUZZLES,
    setCurrentPuzzleIdx: (value) => { currentPuzzleIdx = Math.max(0, Math.floor(Number(value) || 0)); },
    getCurrentPuzzleIdx: () => currentPuzzleIdx,
    setUnlockedCount: (value) => { unlockedCount = Math.max(0, Math.floor(Number(value) || 0)); },
    loadCategoryProgress: () => loadCategoryProgress(),
    applyDailyUiLocks: () => applyDailyUiLocks(),
    setDifficulty: (value) => setDifficulty(value),
    rebuildPuzzleDropdown: () => rebuildPuzzleDropdown(),
    loadPuzzleImage: (idx) => loadPuzzleImage(idx),
    updateStats: () => updateStats(),
    draw: () => draw(),
    normalizeCatId: (value) => normalizeCatId(value),
    firstNonEmptyList: (indexData) => firstNonEmptyList(indexData),
    getPuzzleIndexMeta: () => PUZZLE_INDEX_META,
    safeDecodePathVariants: (src) => safeDecodePathVariants(src),
    isPuzzleUnlockedIndex: (idx) => isPuzzleUnlockedIndex(idx),
    saveCurrentPuzzle: () => saveCurrentPuzzle(),
    getFirstUnlockedIndex: () => getFirstUnlockedIndex(),
    getDifficultyControlValue: () => sizeSel ? String(sizeSel.value || diffKey) : String(diffKey || "easy"),
    refs: {
      getLandingGridEl: () => landingGrid,
      getLandingSearchEl: () => landingSearch,
      getLandingLastEl: () => landingLast,
      getGlobalPointsPillEl: () => globalPointsPill,
      getPauseOverlayEl: () => pauseOverlay,
      getModalEl: () => modal,
      getHelpPanelEl: () => helpPanel,
      getLandingScreenEl: () => landingScreen,
      getGameScreenEl: () => gameScreen,
    },
  }));
  installLayoutRuntime();


  function stopTimer() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function tickLoop() {
    if (!running) return;
    elapsedMs = performance.now() - startTime;
    updateStats();
    draw();
    rafId = requestAnimationFrame(tickLoop);
  }
  function startTimer() {
    running = true;
    startTime = performance.now() - elapsedMs;
    if (rafId) cancelAnimationFrame(rafId);
    tickLoop();
  }

  function placeCost(){
    const base = PLACE_COST_BASE[diffKey] ?? 40;
    const step = PLACE_COST_STEP[diffKey] ?? 8;
    return Math.max(0, Math.floor(base + step * currentPuzzleIdx));
  }

  function unlockCostFor(nextIdx){
    const base = UNLOCK_COST_BASE[diffKey] ?? 100;
    const step = UNLOCK_COST_STEP[diffKey] ?? 40;
    return Math.max(0, Math.floor(base + step * nextIdx));
  }

  function calcWinPoints(){
    const base = WIN_POINTS_BASE[diffKey] ?? 40;
    const timeSec = Math.max(0.1, elapsedMs / 1000);
    const timeBonus = Math.max(0, Math.floor(WIN_POINTS_TIME_FACTOR / timeSec));
    const raw = base + timeBonus;
    return Math.floor(raw * pointsMultiplier());
  }

  function awardMovePoints(newlyCorrect){
    if (newlyCorrect <= 0) return 0;
    streak += 1;
    const streakBonus = streak * STREAK_BONUS_PER_LEVEL;
    const raw = newlyCorrect * (BASE_NEW_CORRECT + streakBonus) + (newlyCorrect >= 2 ? newlyCorrect * 5 : 0);
    const boosted = Math.floor(raw * pointsMultiplier());
    score += boosted;

    if (boosted > 0){
      if (newlyCorrect >= 2){
        showAccomplishmentToast('Nice swap', `+${boosted} score • ${newlyCorrect} tiles locked in`, 'points', 1500);
        spawnPointsFloat(`+${boosted}`, 'points', { big:true });
        playCoinCascade(boosted, { big:true });
      } else if (streak === 3 || streak === 5 || streak === 10 || (streak > 10 && streak % 5 === 0)){
        showAccomplishmentToast(`Streak x${streak}`, `+${boosted} score • keep the momentum going`, 'streak', 1500);
        spawnPointsFloat(`+${boosted}`, 'streak', { big:true });
        playCoinCascade(boosted, { big:true });
      } else {
        playCoinCascade(boosted, { big:false });
      }
    }
    return boosted;
  }

  function startCompletionFlash(onDone) {
    hideAllLines = true;
    const now = performance.now();
    flashWinUntil = 0;
    flashWinOn = true;
    flashWinLastToggle = now;
    clearSelection();
    correctFx.clear();
    draw();
    if (typeof onDone === "function") setTimeout(onDone, 120);
  }

  function setPaused(nextPaused) {
    if (modal.classList.contains("show")) return;
    paused = !!nextPaused;

    if (paused) {
      if (running) {
        elapsedMs = performance.now() - startTime;
        stopTimer();
      }
      pauseOverlay.classList.add("show");
      helpPanel.style.display = "none";
      clearPreview();
    } else {
      pauseOverlay.classList.remove("show");
      if (elapsedMs > 0 || running) startTimer();
    }

    updateStats();
    draw();
    clearRoutePreload();
  }

  function rebuildPuzzleDropdown(){
    const allowed = unlockedPlayableIndices.length ? unlockedPlayableIndices.slice() : [0];
    const keep = isPuzzleUnlockedIndex(currentPuzzleIdx) ? String(currentPuzzleIdx) : String(getFirstUnlockedIndex());
    puzzleSel.innerHTML = "";
    allowed.forEach((i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${i + 1}. ${PUZZLES[i].name}`;
      puzzleSel.appendChild(opt);
    });
    puzzleSel.value = keep;
    puzzleSel.disabled = allowed.length <= 1;
  }

  function updateUnlockUI(){
    if (pointsStat) pointsStat.textContent = `Points: ${points}`;
    if (phonePointsHud) phonePointsHud.textContent = `Points: ${points}`;

    const nextIdx = currentPuzzleIdx + 1;
    const firstLockedIdx = nextUnlockIdx;

    if (nextIdx >= PUZZLES.length) {
      nextPuzzleBtn.textContent = "Next Puzzle (None)";
      nextPuzzleBtn.disabled = true;
      return;
    }

    const isNextUnlocked = isPuzzleUnlockedIndex(nextIdx);
    if (isNextUnlocked) {
      nextPuzzleBtn.textContent = `Play Next Puzzle: ${PUZZLES[nextIdx].name}`;
      nextPuzzleBtn.disabled = false;
      return;
    }

    if (nextIdx === firstLockedIdx) {
      const cost = unlockCostFor(nextIdx);
      const can = points >= cost;
      nextPuzzleBtn.textContent = `Unlock Next Puzzle (cost: ${cost})`;
      nextPuzzleBtn.disabled = !can;
      return;
    }

    nextPuzzleBtn.textContent = `Next Puzzle Locked`;
    nextPuzzleBtn.disabled = true;
  }

function calcMoveEfficiency(moves){
  const mv = Math.max(0, Math.floor(Number(moves) || 0));
  if (!mv) return null;
  return Math.max(1, Math.min(100, Math.round((96 / mv) * 100)));
}



  // ===== Landing =====
  function parseCatFromHash(){
    const m = (location.hash || "").match(/cat=([a-z0-9_-]+)/i);
    return m ? m[1].toLowerCase() : null;
  }

  function parseRouteHash(){
    let cat = "", src = "", puzzle = "", daily = "";
    try{
      const qs = new URLSearchParams(String(location.search || "").replace(/^\?/, ""));
      cat = String(qs.get("cat") || "").toLowerCase();
      src = String(qs.get("src") || "");
      puzzle = String(qs.get("puzzle") || "");
      daily = String(qs.get("daily") || "");
    }catch(e){}

    if (!cat || !src || !puzzle || !daily) {
      try{
        const raw = String(location.hash || "").replace(/^#/, "");
        const hp = new URLSearchParams(raw);
        if (!cat) cat = String(hp.get("cat") || "").toLowerCase();
        if (!src) src = String(hp.get("src") || "");
        if (!puzzle) puzzle = String(hp.get("puzzle") || "");
        if (!daily) daily = String(hp.get("daily") || "");
      }catch(e){}
    }

    return { cat, src, puzzle, daily };
  }

  // Daily run detection (hash daily=... or active marker set by index)
  function isDailyRun(){
    try{
      const href = String(location.href||"");
      const h = String(location.hash||"");
      const s = String(location.search||"");
      // Accept daily marker in either hash or querystring
      if (href.includes("daily=") || h.includes("daily=") || s.includes("daily=")) return true;
      // Also support route parser (hash-based)
      try{
        const r = parseRouteHash();
        if (r && r.daily) return true;
      }catch(e){}
    }catch(e){}
    return false;
  }

  function applyDailyUiLocks(){
    if (!isDailyRun()) return;
    try{ document.body && document.body.setAttribute('data-daily','1'); }catch(e){}

    // Force hard difficulty only
    try{ diffKey = "hard"; }catch(e){}
    try{
      if (typeof sizeSel !== "undefined" && sizeSel){
        sizeSel.innerHTML = '<option value="hard">Hard (8×12)</option>';
        sizeSel.value = "hard";
        sizeSel.disabled = true;
      } else {
        const sel = document.getElementById("sizeSel");
        if (sel){
          sel.innerHTML = '<option value="hard">Hard (8×12)</option>';
          sel.value = "hard";
          sel.disabled = true;
        }
      }
    }catch(e){}

    // Hide hard-mode toggle UI (no on/off switch)
    try{
      const hm = document.getElementById("hardBtn") || document.getElementById("hardModeToggle") || document.getElementById("hardModeChk") || document.getElementById("hardMode");
      if (hm) {
        const wrap = hm.closest(".row") || hm.closest(".pillRow");
        if (wrap) wrap.style.display = "none";
        else hm.style.display = "none";
        hm.disabled = true;
      }
    }catch(e){}

    // Hide unlock-next-puzzle UI
    try{
      const un = document.getElementById("nextPuzzleBtn") || document.getElementById("unlockNextBtn") || document.getElementById("unlockNext") || document.getElementById("unlockBox") || document.getElementById("unlockRow");
      if (un) {
        const wrap = un.closest(".row") || un.closest(".pillRow") || un.closest(".unlockRow") || un.closest(".unlockBox");
        if (wrap) wrap.style.display = "none";
        else un.style.display = "none";
        un.disabled = true;
      }
    }catch(e){}
  }

  function decodeMaybeTwice(value){
    let v = String(value || "");
    try { v = decodeURIComponent(v); } catch {}
    if (/%[0-9A-Fa-f]{2}/.test(v)) {
      try { v = decodeURIComponent(v); } catch {}
    }
    return v;
  }

  function clearRoutePreload(){
    try{
      document.documentElement.classList.remove("pq-preload-route", "pq-preload-daily");
    }catch(e){}
  }

  function normalizePuzzleSrcPath(src){
    let v = decodeMaybeTwice(src).trim();
    if (!v) return "";
    try{
      const u = new URL(v, location.href);
      if (u.origin === location.origin) v = u.pathname + u.search + u.hash;
    }catch(e){}
    v = v.split("#")[0].split("?")[0];
    v = v.replace(/\\/g, "/").replace(/^\/+/, "");
    return v;
  }

  function normalizeCatId(raw){
    const v = String(raw || "").toLowerCase();
    if (!v) return "";
    if (Object.prototype.hasOwnProperty.call(PUZZLE_CATALOG, v)) return v;
    if (v === "city") return "cities";
    if (v === "cities") return "cities";
    if (v === "landscape") return "landscapes";
    if (v === "landscapes") return "landscapes";
    if (v === "puzzles_of_the_day") return "";
    return v;
  }

  function catFromPuzzleSrc(src){
    const m = normalizePuzzleSrcPath(src).match(/^puzzles\/([^/]+)\//i);
    if (!m) return "";
    return normalizeCatId(m[1]);
  }

  function safeDecodePathVariants(src){
    const out = new Set();
    const s0 = normalizePuzzleSrcPath(src) || String(src || "");
    if (!s0) return [];

    // Add raw, plus<->space normalized, and URI encoded/decoded variants.
    const seeds = new Set([s0, s0.replace(/\+/g, " "), s0.replace(/ /g, "+")]);

    for (const s of seeds){
      if (!s) continue;
      out.add(s);
      try { out.add(decodeURIComponent(s)); } catch {}
      try { out.add(decodeURIComponent(decodeURIComponent(s))); } catch {}
      try { out.add(encodeURI(s)); } catch {}

      // Also normalize +<->space after decoding
      for (const v of Array.from(out)){
        if (typeof v === "string"){
          out.add(v.replace(/\+/g, " "));
          out.add(v.replace(/ /g, "+"));
        }
      }
    }

    return Array.from(out).filter(Boolean);
  }

  function findPuzzleBySrcInCatalog(srcRaw){
    const srcDecoded = decodeMaybeTwice(srcRaw);
    const targetVariants = new Set(safeDecodePathVariants(srcDecoded));
    for (const [catId, list] of Object.entries(PUZZLE_CATALOG || {})) {
      const arr = Array.isArray(list) ? list : [];
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i] || {};
        const puzzleVariants = safeDecodePathVariants(p.src || "");
        if (puzzleVariants.some(v => targetVariants.has(v))) {
          return { catId, idx: i, item: p, srcDecoded };
        }
      }
    }
    return null;
  }

  // ===== UI Wiring =====
  landingSearch.addEventListener("input", renderLanding);
  continueBtn.addEventListener("click", async () => {
    const prevMain = continueBtn.querySelector(".continueMain") ? continueBtn.querySelector(".continueMain").textContent : "Continue Last";
    const prevSub = continueBtn.querySelector(".continueSub") ? continueBtn.querySelector(".continueSub").textContent : "";
    const prevTitle = continueBtn.title || "Open your last puzzle or category";
    continueBtn.disabled = true;
    setLandingContinueButtonDisplay("Opening…", prevSub, prevTitle);
    try{
      if (AUTH_LOGGED_IN) {
        try{
          const latest = await fetchLatestProgressFromServer();
          if (latest && latest.categoryId) {
            pendingResumeProgress = latest;
            if (sizeSel && latest.diffKey && Object.prototype.hasOwnProperty.call(DIFFICULTIES, latest.diffKey)) {
              sizeSel.value = String(latest.diffKey);
              setDifficulty(String(latest.diffKey));
            }
            openCategory(String(latest.categoryId), {
              src: String(latest.puzzleSrc || ""),
              puzzle: String(latest.puzzleName || "")
            });
            return;
          }
        }catch(e){}
      }
      const last = lsGet(LAST_CAT_KEY) || CATEGORIES[0].id;
      openCategory(last);
    } finally {
      continueBtn.disabled = false;
      setLandingContinueButtonDisplay(prevMain, prevSub, prevTitle);
      refreshLandingContinueButtonState().catch(()=>{});
    }
  });

  backToCategoriesBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const qp = new URLSearchParams();
    if (CATEGORY_ID) qp.set("cat", CATEGORY_ID);
    window.location.href = `index.html#${qp.toString()}`;
  });

  helpBtn.addEventListener("click", () => {
    const isShown = helpPanel.style.display !== "none";
    helpPanel.style.display = isShown ? "none" : "block";
  });

  hardBtn.addEventListener("click", () => {
    hardMode = !hardMode;
    lsSet(HARD_MODE_PREF_KEY, hardMode ? "1" : "0");
    if (hardMode) {
      correctFx.clear();
      helpPanel.style.display = "none";
      clearSelection();
      clearPreview();
    }
    updateStats();
    draw();
    markProgressDirty();
  });

  themeBtn.addEventListener("click", () => {
    themeEnabled = !themeEnabled;
    lsSet(THEME_PREF_KEY, themeEnabled ? "1" : "0");
    applyThemeToDom();
    updateStats();
  });

  themeStrength.addEventListener("input", () => {
    themeAlpha = Math.max(0, Math.min(1, Number(themeStrength.value) / 100));
    lsSet(THEME_ALPHA_KEY, String(themeAlpha));
    applyThemeToDom();
    updateStats();
  });

  hintPlaceBtn.addEventListener("click", () => {
    if (__PQ_IS_DAILY) return; // disabled on Daily Challenge

    if (__PQ_IS_DAILY) return; // no place hint on Daily challenge

    if (hardMode || paused || isSolved()) return;

    const cost = placeCost();
    if (points < cost) return;

    const wrong = [];
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== i && !locked[i]) wrong.push(i);
    }
    if (!wrong.length) return;

    points -= cost;
    // Persist point spend as a DELTA on the server (prevents overwriting and keeps totals consistent)
    (async () => {
      const newTotal = await addServerPoints(-cost);
      if (typeof newTotal === "number") {
        points = newTotal;
        try { updateStats(); draw(); } catch(e) {}
        try { savePoints(); } catch(e) {}
      }
    })();

    savePoints();const targetPos = wrong[Math.floor(Math.random() * wrong.length)];
    const tileIdThatShouldBeHere = targetPos;
    const currentPos = tiles.indexOf(tileIdThatShouldBeHere);
    if (currentPos === -1) { updateStats(); return; }
    if (locked[targetPos] || locked[currentPos]) { updateStats(); return; }

    const oldTiles = tiles.slice();
    const correctBefore = countCorrect();

    [tiles[targetPos], tiles[currentPos]] = [tiles[currentPos], tiles[targetPos]];
    locked[targetPos] = true;

    if (selected === targetPos || selected === currentPos) selected = null;
    multiSel = multiSel.filter(i => !locked[i]);
    srcRelOrder = multiSel.length ? computeRelFromSelection(multiSel) : [];
    clearPreview();

    const correctAfter = countCorrect();
    const newlyCorrect = Math.max(0, correctAfter - correctBefore);

    maybeTriggerFX(oldTiles, tiles, [targetPos, currentPos]);

    if (newlyCorrect > 0) {
      streak += 1;
      const raw = newlyCorrect * (BASE_NEW_CORRECT + streak * STREAK_BONUS_PER_LEVEL) + 3;
      score += Math.floor(raw * pointsMultiplier());
    }

    updateStats();
    draw();
    markProgressDirty();
    if (isSolved()) finishGame();
  });

  pauseBtn.addEventListener("click", () => setPaused(!paused));
  if (muteBtn) muteBtn.addEventListener("click", () => setUiMuted(!pqUiMuted));
  resumeBtn.addEventListener("click", () => setPaused(false));
  pauseHelpBtn.addEventListener("click", () => { helpPanel.style.display = "block"; });
  resumePromptResumeBtn.addEventListener("click", () => closeResumePrompt("resume"));
  resumePromptStartOverBtn.addEventListener("click", () => closeResumePrompt("startover"));

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  }
  fsBtn.addEventListener("click", toggleFullscreen);

  document.addEventListener("fullscreenchange", () => {
    const isFs = !!document.fullscreenElement;
    document.body.classList.toggle("is-fullscreen", isFs);
    fsBtn.textContent = isFs ? "Minimize" : "Full-screen";
    fsBtn.dataset.short = isFs ? "Minimize" : "Full-screen";
    fsBtn.title = isFs ? "Minimize" : "Full-screen";
    fsBtn.setAttribute("aria-label", isFs ? "Minimize" : "Full-screen");
    helpPanel.style.display = "none";
    updateStats();
    setTimeout(() => { resizeCanvasToFit(); draw(); }, 0);
  });

  let difficultyChangeSeq = 0;
  sizeSel.addEventListener("change", async () => {
    const changeSeq = ++difficultyChangeSeq;
    const selectedDiff = String(sizeSel.value || diffKey || "easy");
    try{ persistProgressNow({ force:true }); }catch(e){}
    setDifficulty(selectedDiff);
    hideAllLines = true;
    completedPuzzleState = false;
    updateCompletionRatingDisplay(null);
    tiles = Array.from({ length: totalTiles() }, (_, i) => i);
    locked = Array.from({ length: totalTiles() }, () => false);
    selected = null;
    multiSel = [];
    srcRelOrder = [];
    clearPreview();
    stopTimer();
    elapsedMs = 0;
    updateStats();
    draw();
    let restored = false;
    try{
      const saved = AUTH_LOGGED_IN ? await fetchCurrentPuzzleProgressFromServer() : null;
      if (changeSeq !== difficultyChangeSeq || String(diffKey || "") !== selectedDiff) return;
      if (saved && saved.completed) {
        restored = forceSolvedSnapshot(saved);
      } else if (saved) {
        restored = applyProgressSnapshot(saved);
      }
    }catch(e){}
    if (changeSeq !== difficultyChangeSeq || String(diffKey || "") !== selectedDiff) return;
    if (!restored) {
      scrambleWithoutTimer();
      markProgressDirty();
    }
    updateUnlockUI();
  });

  startBtn.addEventListener("click", () => { setPaused(false); startNewGame(); markProgressDirty(); });

  puzzleSel.addEventListener("change", () => {
    const idx = Math.max(0, Math.min(PUZZLES.length - 1, Number(puzzleSel.value)));
    loadPuzzleImage(idx);
  });

  nextPuzzleBtn.addEventListener("click", () => {
    const nextIdx = currentPuzzleIdx + 1;
    if (nextIdx >= PUZZLES.length) return;

    if (isPuzzleUnlockedIndex(nextIdx)) { loadPuzzleImage(nextIdx); return; }
    if (nextIdx !== nextUnlockIdx) return;

    const cost = unlockCostFor(nextIdx);
    if (points < cost) return;

    points -= cost;
    (async () => {
      const newTotal = await addServerPoints(-cost);
      if (typeof newTotal === "number") {
        points = newTotal;
        try { updateStats(); draw(); } catch(e) {}
        try { savePoints(); } catch(e) {}
      }
    })();

    const srcId = normalizeUnlockSrc(PUZZLES[nextIdx] && PUZZLES[nextIdx].src);
    if (srcId) unlockedSrcSet.add(srcId);
    syncUnlockedStateFromCache();
    saveUnlocked();

    rebuildPuzzleDropdown();
    loadPuzzleImage(nextIdx);
    updateStats();
  });

  playAgainBtn.addEventListener("click", () => { modal.classList.remove("show"); startNewGame(); });
  closeModalBtn.addEventListener("click", () => modal.classList.remove("show"));
  if (copyShareBtn) copyShareBtn.addEventListener("click", () => { copyCompletionShareText(); });
  if (nativeShareBtn) nativeShareBtn.addEventListener("click", () => { nativeShareCompletion(); });

  document.addEventListener("keydown", (e) => {
    if (!gameScreen.classList.contains("hidden") && modal.classList.contains("show")) return;
    if (!gameScreen.classList.contains("hidden") && resumePrompt.classList.contains("show")) return;

    if (e.code === "Space" && !gameScreen.classList.contains("hidden")) {
      e.preventDefault();
      setPaused(!paused);
      return;
    }
    if (e.key === "Escape" && !gameScreen.classList.contains("hidden")) {
      if (paused) setPaused(false);
      else { clearSelection(); draw(); }
    }
  });

  pauseOverlay.addEventListener("click", (e) => { if (e.target === pauseOverlay) setPaused(false); });

  window.addEventListener("resize", () => { if (!gameScreen.classList.contains("hidden")) { resizeCanvasToFit(); draw(); } });
  window.addEventListener("orientationchange", () => { setTimeout(() => { if (!gameScreen.classList.contains("hidden")) { resizeCanvasToFit(); draw(); } }, 250); });

  // ===== Input =====
  canvas.addEventListener("pointerdown", (e) => { handlePointerDown(e); });
  canvas.addEventListener("pointermove", (evt) => { handlePointerMove(evt); });
  canvas.addEventListener("pointerleave", () => { handlePointerLeave(); });
  canvas.addEventListener("pointerup", (e) => { handlePointerUp(e); });
  canvas.addEventListener("pointercancel", (e) => { handlePointerCancel(e); });
  canvas.addEventListener("click", (evt) => { handleCanvasClick(evt); });

  // ===== Image loading =====
  img.onload = () => { handleImageLoad().catch(()=>{}); };
  img.onerror = () => { handleImageError(); };

  // ===== Theme init =====
  if (lsGet(THEME_PREF_KEY) === null) lsSet(THEME_PREF_KEY, "1");


  startApp().catch(()=>{});
})();

  function showFsHint(){
    try{
      const hint = document.getElementById("fsHint");
      if (!hint) return;
      hint.classList.add("show");
      try{
        const fsBtn = document.getElementById("fsBtn");
        if (fsBtn) fsBtn.classList.add("pq-pulse");
        setTimeout(() => { try{ fsBtn && fsBtn.classList.remove("pq-pulse"); }catch(e){} }, 5200);
      }catch(e){}
      setTimeout(() => { try{ hint.classList.remove("show"); }catch(e){} }, 5000);
    }catch(e){}
  }

  (function(){
    // Run regardless of login state, even if other async init fails
    const trigger = () => setTimeout(showFsHint, 300);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", trigger, { once:true });
    } else {
      trigger();
    }
  })();
