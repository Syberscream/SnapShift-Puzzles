(function(global){
  function createGameProgressHelpers(env){
    const refs = env.refs || {};

    function getSaveStatusEl(){ return refs.getSaveStatusEl ? refs.getSaveStatusEl() : null; }
    function getResumePromptEl(){ return refs.getResumePromptEl ? refs.getResumePromptEl() : null; }
    function getResumePromptTitleEl(){ return refs.getResumePromptTitleEl ? refs.getResumePromptTitleEl() : null; }
    function getResumePromptTextEl(){ return refs.getResumePromptTextEl ? refs.getResumePromptTextEl() : null; }
    function getResumePromptMetaEl(){ return refs.getResumePromptMetaEl ? refs.getResumePromptMetaEl() : null; }
    function getResumePromptSavedEl(){ return refs.getResumePromptSavedEl ? refs.getResumePromptSavedEl() : null; }
    function getResumePromptResumeBtnEl(){ return refs.getResumePromptResumeBtnEl ? refs.getResumePromptResumeBtnEl() : null; }
    function getContinueBtnEl(){ return refs.getContinueBtnEl ? refs.getContinueBtnEl() : null; }

    function setSaveStatus(state, text){
      try{
        const saveStatus = getSaveStatusEl();
        if (!saveStatus) return;
        saveStatus.dataset.state = String(state || "idle");
        saveStatus.classList.remove("ok", "warn", "bad");
        if (state === "saved") saveStatus.classList.add("ok");
        else if (state === "saving") saveStatus.classList.add("warn");
        else if (state === "error") saveStatus.classList.add("bad");
        saveStatus.textContent = String(text || "");
      }catch(e){}
    }

    function scheduleSaveStatusIdle(){
      try{
        const timer = env.getSaveStatusTimer();
        if (timer) clearTimeout(timer);
      }catch(e){}
      env.setSaveStatusTimer(setTimeout(() => {
        if (!env.getAuthLoggedIn()) {
          setSaveStatus("idle", "Sign in to save progress");
        } else if (env.getCompletedPuzzleState()) {
          setSaveStatus("saved", "Puzzle completed");
        } else if (env.getLastAcceptedProgressSeq() > 0) {
          setSaveStatus("saved", "All changes saved");
        } else {
          setSaveStatus("idle", "Progress autosaves");
        }
      }, 2200));
    }

    function syncSaveStatusForAuth(){
      try{
        const timer = env.getSaveStatusTimer();
        if (timer) clearTimeout(timer);
      }catch(e){}
      if (!env.getAuthLoggedIn()) {
        setSaveStatus("idle", "Sign in to save progress");
        return;
      }
      if (env.getProgressSaveBusy() || env.getProgressSaveQueued()) {
        setSaveStatus("saving", "Saving…");
        return;
      }
      if (env.getCompletedPuzzleState()) {
        setSaveStatus("saved", "Puzzle completed");
        return;
      }
      if (env.getLastAcceptedProgressSeq() > 0) {
        setSaveStatus("saved", "All changes saved");
        return;
      }
      setSaveStatus("idle", "Progress autosaves");
    }

    function getSaveSucceededText(){
      try{
        return "Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }catch(e){
        return "Saved";
      }
    }

    function getSaveFailedText(){
      return navigator.onLine === false ? "Offline — save pending" : "Save failed — retrying";
    }

    function getDifficultyLabel(diff){
      const key = String(diff || env.getDiffKey() || "easy");
      const difficulties = env.getDifficulties();
      const entry = difficulties && typeof difficulties === "object" ? difficulties[key] : null;
      if (entry && entry.rows && entry.cols) return `${entry.rows}x${entry.cols}`;
      if (key === "medium") return "Medium";
      if (key === "hard") return "Hard";
      return "Easy";
    }

    function formatSavedAtLabel(value){
      try{
        if (!value) return "";
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return "";
        return "Last saved " + dt.toLocaleString();
      }catch(e){
        return "";
      }
    }

    function closeResumePrompt(choice){
      const resolve = env.getResumePromptResolve();
      env.setResumePromptResolve(null);
      const resumePrompt = getResumePromptEl();
      if (resumePrompt) {
        resumePrompt.classList.remove("show");
        resumePrompt.setAttribute("aria-hidden", "true");
      }
      if (resolve) {
        try{ resolve(choice == null ? null : choice); }catch(e){}
      }
    }

    function askResumeProgress(progress){
      closeResumePrompt(null);
      return new Promise((resolve) => {
        env.setResumePromptResolve(resolve);

        const puzzles = env.getPuzzles();
        const currentPuzzleIdx = env.getCurrentPuzzleIdx();
        const puzzleName = String((progress && progress.puzzleName) || (puzzles[currentPuzzleIdx] && puzzles[currentPuzzleIdx].name) || "this puzzle");
        const diffLabel = getDifficultyLabel(progress && progress.diffKey);
        const elapsedLabel = env.formatElapsed(Math.max(0, Math.floor(Number(progress && progress.elapsedMs) || 0)));
        const moveCount = Math.max(0, Math.floor(Number(progress && progress.movesMade) || 0));

        const titleEl = getResumePromptTitleEl();
        const textEl = getResumePromptTextEl();
        const metaEl = getResumePromptMetaEl();
        const savedEl = getResumePromptSavedEl();
        const resumePrompt = getResumePromptEl();
        const resumeBtn = getResumePromptResumeBtnEl();

        if (titleEl) titleEl.textContent = `Resume ${puzzleName}?`;
        if (textEl) textEl.textContent = "We found unfinished progress for this account.";
        if (metaEl) metaEl.textContent = `${diffLabel} • ${elapsedLabel} • ${moveCount} moves`;
        if (savedEl) savedEl.textContent = formatSavedAtLabel(progress && progress.savedAt);

        if (resumePrompt) {
          resumePrompt.classList.add("show");
          resumePrompt.setAttribute("aria-hidden", "false");
        }
        try{ if (resumeBtn && resumeBtn.focus) resumeBtn.focus(); }catch(e){}
      });
    }

    function getCurrentDailyDayKey(meta){
      const input = meta && typeof meta === "object" ? meta : {};
      try{
        const explicit = String(input.dayKey || "").trim();
        if (explicit) return explicit;
      }catch(e){}
      try{
        const route = env.parseRouteHash();
        const routeDay = String((route && route.daily) || "").trim();
        if (routeDay) return routeDay;
      }catch(e){}
      return "";
    }

    function buildProgressKeyFromMeta(meta){
      const input = meta && typeof meta === "object" ? meta : {};
      const categoryId = String(input.categoryId || env.getCategoryId() || "").trim().toLowerCase();
      const puzzleIdx = Math.max(0, Math.floor(Number(input.puzzleIdx != null ? input.puzzleIdx : env.getCurrentPuzzleIdx()) || 0));
      const diffKey = String(input.diffKey || env.getDiffKey() || "easy");
      const isDailyMeta = !!(input.isDaily || categoryId === "daily" || env.isDailyRoute() || env.isDailyRun());
      const dayKey = getCurrentDailyDayKey(input);
      if (isDailyMeta && dayKey) return `daily:${dayKey}:${diffKey}`;
      const puzzles = env.getPuzzles();
      const srcId = env.normalizeUnlockSrc(input.puzzleSrc || (puzzles[env.getCurrentPuzzleIdx()] && puzzles[env.getCurrentPuzzleIdx()].src) || "");
      if (srcId) return `puzzle:${categoryId}:src:${srcId}:${diffKey}`;
      return `puzzle:${categoryId}:${puzzleIdx}:${diffKey}`;
    }

    function currentPuzzleMeta(){
      const puzzles = env.getPuzzles();
      const currentPuzzleIdx = env.getCurrentPuzzleIdx();
      const puzzle = Array.isArray(puzzles) && puzzles[currentPuzzleIdx] ? puzzles[currentPuzzleIdx] : {};
      const isDailyMeta = !!(String(env.getCategoryId() || "") === "daily" || env.isDailyRoute() || env.isDailyRun());
      return {
        categoryId: String(env.getCategoryId() || ""),
        categoryName: String(env.getCategoryName() || ""),
        puzzleIdx: Math.max(0, Math.floor(Number(currentPuzzleIdx) || 0)),
        puzzleName: String((puzzle && puzzle.name) || ""),
        puzzleSrc: String((puzzle && puzzle.src) || ""),
        diffKey: String(env.getDiffKey() || "easy"),
        rows: Math.max(1, Math.floor(Number(env.getRows()) || 1)),
        cols: Math.max(1, Math.floor(Number(env.getCols()) || 1)),
        isDaily: isDailyMeta,
        dayKey: isDailyMeta ? getCurrentDailyDayKey() : "",
      };
    }

    function getDailyProgressBackupKey(dayKey){
      const dk = String(dayKey || "").trim();
      return dk ? ("pq_daily_progress_" + dk) : "";
    }

    function writeDailyProgressBackup(progress){
      try{
        const dk = String((progress && progress.dayKey) || "").trim();
        const key = getDailyProgressBackupKey(dk);
        if (!key) return;
        if (progress && typeof progress === "object") {
          localStorage.setItem(key, JSON.stringify(progress));
        } else {
          localStorage.removeItem(key);
        }
      }catch(e){}
    }

    function readDailyProgressBackup(dayKey, routeSrc, opts){
      const safeOpts = opts && typeof opts === "object" ? opts : {};
      try{
        const key = getDailyProgressBackupKey(dayKey);
        if (!key) return null;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== "object") return null;
        if (!safeOpts.allowCompleted && saved.completed) return null;
        const savedDay = String(saved.dayKey || "").trim();
        if (savedDay && String(dayKey || "").trim() && savedDay !== String(dayKey || "").trim()) return null;
        const savedSrc = String(saved.puzzleSrc || "").trim();
        const wantedSrc = String(routeSrc || "").trim();
        if (wantedSrc && savedSrc && savedSrc !== wantedSrc && env.decodeMaybeTwice(savedSrc) !== env.decodeMaybeTwice(wantedSrc)) return null;
        return saved;
      }catch(e){
        return null;
      }
    }

    function clearDailyProgressBackup(dayKey){
      try{
        const key = getDailyProgressBackupKey(dayKey);
        if (key) localStorage.removeItem(key);
      }catch(e){}
    }

    async function fetchStateFromServer(queryString){
      try{
        const url = "/api/state_get.php" + (queryString ? ("?" + queryString) : "");
        const r = await fetch(url, { credentials:"include", cache:"no-store" });
        const j = await r.json().catch(() => null);
        if (j && j.ok && j.loggedIn) return j;
      }catch(e){}
      return null;
    }

    async function fetchProgressFromServer(queryString){
      const j = await fetchStateFromServer(queryString);
      if (j && j.progress && typeof j.progress === "object") return j.progress;
      return null;
    }

    async function fetchLatestProgressFromServer(){
      return fetchProgressFromServer("");
    }

    function activeDailyDayKey(){
      try{
        const timeZone = String(global.SNAPSHIFT_DAILY_RESET_TZ || "America/Vancouver");
        const dtf = new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          hour12: false,
        });
        const parts = {};
        dtf.formatToParts(new Date()).forEach((part) => {
          if (part && part.type !== "literal") parts[part.type] = part.value;
        });
        let y = Number(parts.year || 0);
        let m = Number(parts.month || 1);
        let d = Number(parts.day || 1);
        const hour = Number(parts.hour || 0);
        if (hour < 17) {
          const dt = new Date(Date.UTC(y, m - 1, d));
          dt.setUTCDate(dt.getUTCDate() - 1);
          y = dt.getUTCFullYear();
          m = dt.getUTCMonth() + 1;
          d = dt.getUTCDate();
        }
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }catch(e){
        return "";
      }
    }

    function isArchiveDailyDay(dayKey){
      const dk = String(dayKey || "").trim();
      const active = activeDailyDayKey();
      return /^\d{4}-\d{2}-\d{2}$/.test(dk) && /^\d{4}-\d{2}-\d{2}$/.test(active) && dk < active;
    }

    function getContinueDifficultyShort(diff){
      const key = String(diff || "easy").toLowerCase();
      if (key === "hard") return "Hard";
      if (key === "medium") return "Medium";
      return "Easy";
    }

    function formatSavedAgo(value){
      try{
        if (!value) return "";
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return "";
        const diffMs = Date.now() - dt.getTime();
        const mins = Math.max(0, Math.round(diffMs / 60000));
        if (mins < 1) return "saved just now";
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

    function ensureLandingContinueButtonLayout(){
      const continueBtn = getContinueBtnEl();
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

    function setLandingContinueButtonDisplay(mainText, subText, titleText){
      const continueBtn = getContinueBtnEl();
      if (!continueBtn) return;
      const nodes = ensureLandingContinueButtonLayout();
      if (!nodes) return;
      nodes.main.textContent = String(mainText || "Continue Last");
      nodes.sub.textContent = String(subText || "");
      continueBtn.classList.toggle("hasMeta", !!subText);
      continueBtn.title = String(titleText || (subText || mainText || "Continue Last"));
    }

    async function refreshLandingContinueButtonState(){
      const continueBtn = getContinueBtnEl();
      if (!continueBtn) return;
      try{
        if (env.getAuthLoggedIn()){
          const latest = await fetchLatestProgressFromServer();
          if (latest && latest.categoryId){
            const puzzleName = String(latest.puzzleName || "Saved puzzle").trim();
            const diffLabel = getContinueDifficultyShort(latest.diffKey);
            const whenLabel = formatSavedAgo(latest.updatedAt || latest.savedAt);
            const main = latest.isDaily ? "Resume Daily" : `Continue ${diffLabel}`;
            const sub = [puzzleName, whenLabel].filter(Boolean).join(" · ");
            setLandingContinueButtonDisplay(main, sub, puzzleName || "Continue your unfinished puzzle");
            return;
          }
        }
      }catch(e){}

      let hintName = "";
      try{
        const raw = env.lsGet(env.getLastPuzzleHintKey());
        if (raw){
          const hint = JSON.parse(raw);
          hintName = String(hint && hint.name ? hint.name : "").trim();
        }
      }catch(e){}
      setLandingContinueButtonDisplay("Continue Last", hintName, hintName || "Open your last puzzle or category");
    }

    async function fetchDailyProgressForDay(dayKey, opts){
      const safeOpts = opts && typeof opts === "object" ? opts : {};
      const dk = String(dayKey || "").trim();
      const routeSrc = String(safeOpts.routeSrc || "").trim();
      if (!dk) return null;

      try{
        const completedBackup = readDailyProgressBackup(dk, routeSrc, { allowCompleted: true });
        if (completedBackup && completedBackup.completed) return completedBackup;
      }catch(e){}

      const keySet = new Set();
      const orderedKeys = [];
      const addKey = (key) => {
        const k = String(key || "").trim();
        if (!k || keySet.has(k)) return;
        keySet.add(k);
        orderedKeys.push(k);
      };

      ["hard", "medium", "easy"].forEach((diff) => {
        addKey(`daily:${dk}:${diff}`);
        addKey(`daily:${dk}:daily:0:${diff}`);
        addKey(`daily:${dk}:unknown:0:${diff}`);
      });

      let matchedIncomplete = null;
      for (const key of orderedKeys){
        try{
          const saved = await fetchProgressFromServer("progress_key=" + encodeURIComponent(key));
          if (!saved || typeof saved !== "object") continue;

          const savedSrc = String(saved.puzzleSrc || "").trim();
          const savedDay = String(saved.dayKey || "").trim();
          const savedKey = String(saved.progressKey || "").trim();
          const looksDaily = !!(saved.isDaily || String(saved.categoryId || "") === "daily" || savedKey.startsWith(`daily:${dk}:`));
          const sameDay = savedDay === dk || savedKey.startsWith(`daily:${dk}:`);
          const sameSrc = !routeSrc || !savedSrc || savedSrc === routeSrc || env.decodeMaybeTwice(savedSrc) === env.decodeMaybeTwice(routeSrc);

          if (looksDaily && sameDay && sameSrc) {
            if (saved.completed) return saved;
            if (!matchedIncomplete) matchedIncomplete = saved;
          }
        }catch(e){}
      }

      try{
        const meta = currentPuzzleMeta();
        const qs = new URLSearchParams({
          day: dk,
          category_id: "daily",
          diff_key: String((meta && meta.diffKey) || env.getDiffKey() || "hard"),
        });
        if (routeSrc) qs.set("puzzle_src", routeSrc);
        const state = await fetchStateFromServer(qs.toString());
        if (state && state.dailyDone && isArchiveDailyDay(dk)) {
          const puzzleSrc = routeSrc || String((meta && meta.puzzleSrc) || "");
          const doneMeta = state.dailyDoneMeta && typeof state.dailyDoneMeta === "object" ? state.dailyDoneMeta : {};
          const doneMoves = Math.max(0, Math.floor(Number(doneMeta.moves) || 0));
          const doneElapsed = Math.max(0, Math.floor(Number(doneMeta.time_ms) || 0));
          return {
            progressKey: `daily:${dk}:${String((meta && meta.diffKey) || env.getDiffKey() || "hard")}`,
            categoryId: "daily",
            categoryName: String((meta && meta.categoryName) || "Daily Challenge"),
            puzzleIdx: Math.max(0, Math.floor(Number(meta && meta.puzzleIdx) || 0)),
            puzzleName: String((meta && meta.puzzleName) || "Daily Puzzle"),
            puzzleSrc,
            diffKey: String((meta && meta.diffKey) || env.getDiffKey() || "hard"),
            rows: Math.max(1, Math.floor(Number(meta && meta.rows) || 8)),
            cols: Math.max(1, Math.floor(Number(meta && meta.cols) || 12)),
            isDaily: true,
            dayKey: dk,
            completed: true,
            completedAt: "",
            movesMade: doneMoves,
            moves: doneMoves,
            elapsedMs: doneElapsed,
            elapsedLabel: doneElapsed > 0 && env.formatElapsed ? env.formatElapsed(doneElapsed) : "",
            score: 0,
            scoreValue: 0,
            medal: "",
            medalKey: "",
            stars: 0,
            restoredFromDailyDone: true,
          };
        }
      }catch(e){}

      return matchedIncomplete;
    }

    async function fetchCurrentPuzzleProgressFromServer(){
      const meta = currentPuzzleMeta();
      const isDailyMeta = !!(meta && (meta.isDaily || String(meta.categoryId || "") === "daily"));
      if (isDailyMeta) {
        const savedDaily = await fetchDailyProgressForDay(String(meta.dayKey || getCurrentDailyDayKey(meta) || ""), { routeSrc: String(meta.puzzleSrc || "") });
        if (savedDaily && typeof savedDaily === "object") return savedDaily;
      }
      const srcId = env.normalizeUnlockSrc(meta.puzzleSrc || "");
      if (srcId) {
        const qs = new URLSearchParams({
          category_id: String(meta.categoryId || env.getCategoryId() || ""),
          puzzle_src: srcId,
          diff_key: String(meta.diffKey || env.getDiffKey() || "easy"),
        });
        return fetchProgressFromServer(qs.toString());
      }
      const key = buildProgressKeyFromMeta();
      return fetchProgressFromServer("progress_key=" + encodeURIComponent(key));
    }

    async function restoreCompletedProgress(progress){
      let saved = progress && typeof progress === "object" ? progress : null;
      if (!(saved && saved.completed)) {
        try{ saved = await fetchCurrentPuzzleProgressFromServer(); }catch(e){ saved = null; }
      }
      if (!(saved && saved.completed)) return false;

      let restored = false;
      try{
        if (env.forceSolvedSnapshot) restored = !!env.forceSolvedSnapshot(saved);
        if (!restored && env.applyProgressSnapshot) restored = !!env.applyProgressSnapshot(saved);
      }catch(e){
        restored = false;
      }
      if (restored) {
        env.setCompletedPuzzleState(true);
        env.setLastProgressFingerprint(env.buildProgressFingerprint(saved));
        syncSaveStatusForAuth();
      }
      return restored;
    }

    async function clearProgressOnServer(progressKey, opts){
      const config = opts && typeof opts === "object" ? opts : {};
      if (!env.getAuthLoggedIn() || !progressKey) return false;
      try{
        await fetch("/api/state_set.php", {
          method: "POST",
          credentials: "include",
          keepalive: !!config.keepalive,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ progressKey, clearProgress: true }),
        });
        env.setCompletedPuzzleState(false);
        env.updateCompletionRatingDisplay(null);
        env.setLastProgressFingerprint("");
        env.setProgressSaveSeq(0);
        env.setLastAcceptedProgressSeq(0);
        try{
          const dk = getCurrentDailyDayKey();
          if (String(progressKey || "").startsWith("daily:") || dk) clearDailyProgressBackup(dk);
        }catch(e){}
        if (!config.silent) {
          setSaveStatus("saved", "Progress cleared");
          scheduleSaveStatusIdle();
        } else {
          syncSaveStatusForAuth();
        }
        return true;
      }catch(e){
        return false;
      }
    }

    async function persistProgressNow(opts){
      const config = opts && typeof opts === "object" ? opts : {};
      if (!env.getAuthLoggedIn()) {
        syncSaveStatusForAuth();
        return false;
      }

      if (env.getProgressSaveBusy()) {
        env.setProgressSaveQueued(true);
        env.setProgressSaveQueuedForce(env.getProgressSaveQueuedForce() || !!config.force);
        if (config.includeSolved || config.completed) {
          const deadline = Date.now() + 4500;
          while (env.getProgressSaveBusy() && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 60));
          }
          if (!env.getProgressSaveBusy()) {
            return persistProgressNow(config);
          }
        }
        return false;
      }

      env.setProgressSaveBusy(true);
      setSaveStatus("saving", "Saving…");
      try{
        const snapshot = env.collectProgressSnapshot(config);
        if (!snapshot) {
          if (config.clearWhenEmpty) return clearProgressOnServer(buildProgressKeyFromMeta(), config);
          syncSaveStatusForAuth();
          return false;
        }

        const fingerprint = env.buildProgressFingerprint(snapshot);
        if (!config.force && fingerprint && fingerprint === env.getLastProgressFingerprint()) {
          setSaveStatus("saved", snapshot.completed ? "Puzzle completed" : "All changes saved");
          scheduleSaveStatusIdle();
          return true;
        }

        const nextSeq = Math.max(env.getProgressSaveSeq(), env.getLastAcceptedProgressSeq()) + 1;
        snapshot.saveSeq = nextSeq;
        snapshot.savedAt = new Date().toISOString();

        const r = await fetch("/api/state_set.php", {
          method: "POST",
          credentials: "include",
          keepalive: !!config.keepalive,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ progressKey: snapshot.progressKey, progress: snapshot }),
        });
        const j = await r.json().catch(() => null);
        if (j && j.ok) {
          const acceptedSeq = Math.max(nextSeq, Math.floor(Number(j.progressSeq) || 0));
          env.setProgressSaveSeq(acceptedSeq);
          env.setLastAcceptedProgressSeq(acceptedSeq);
          if (!j.staleSaveIgnored) {
            env.setCompletedPuzzleState(!!snapshot.completed);
            env.setLastProgressFingerprint(fingerprint);
            try{ if (snapshot.isDaily) writeDailyProgressBackup(snapshot); }catch(e){}
            setSaveStatus("saved", snapshot.completed ? "Puzzle completed" : getSaveSucceededText());
            scheduleSaveStatusIdle();
            return true;
          }
          if (!snapshot.completed && j.completed) {
            await restoreCompletedProgress(j.progress);
            setSaveStatus("saved", "Puzzle completed");
          } else {
            setSaveStatus("saved", "Newer save already kept");
          }
          scheduleSaveStatusIdle();
        }
      }catch(e){
        setSaveStatus("error", getSaveFailedText());
        scheduleSaveStatusIdle();
      }finally{
        env.setProgressSaveBusy(false);
        if (env.getProgressSaveQueued()) {
          const queuedForce = env.getProgressSaveQueuedForce();
          env.setProgressSaveQueued(false);
          env.setProgressSaveQueuedForce(false);
          setTimeout(() => { persistProgressNow({ force: queuedForce }).catch(() => {}); }, 0);
        }
      }
      return false;
    }

    function forcePersistCompletedProgress(){
      if (!env.getAuthLoggedIn()) return;
      if (env.isSolved && !env.isSolved()) {
        env.setCompletedPuzzleState(false);
        env.updateCompletionRatingDisplay(null);
        syncSaveStatusForAuth();
        return;
      }
      const completedAtIso = new Date().toISOString();
      const runSave = (keepalive) => {
        try{
          return persistProgressNow({
            force: true,
            keepalive: !!keepalive,
            includeSolved: true,
            completed: true,
            completedAt: completedAtIso,
          }).catch(() => false);
        }catch(e){
          return Promise.resolve(false);
        }
      };
      runSave(false);
      setTimeout(() => { runSave(true); }, 700);
      setTimeout(() => { runSave(true); }, 1800);
    }

    function scheduleProgressSave(force){
      const shouldForce = !!force;
      if (env.getAuthLoggedIn()) setSaveStatus("saving", "Saving…");
      try{
        const timer = env.getProgressSaveTimer();
        if (timer) clearTimeout(timer);
      }catch(e){}
      env.setProgressSaveTimer(setTimeout(() => { persistProgressNow({ force: shouldForce }).catch(() => {}); }, shouldForce ? 150 : 1200));
    }

    function markProgressDirty(){
      scheduleProgressSave(false);
    }

    return {
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
      fetchStateFromServer,
      fetchProgressFromServer,
      fetchLatestProgressFromServer,
      refreshLandingContinueButtonState,
      fetchDailyProgressForDay,
      fetchCurrentPuzzleProgressFromServer,
      clearProgressOnServer,
      persistProgressNow,
      forcePersistCompletedProgress,
      scheduleProgressSave,
      markProgressDirty,
    };
  }

  global.SnapshiftGameProgress = {
    create: createGameProgressHelpers,
  };
})(window);
