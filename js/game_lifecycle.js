(function(global){
  function createGameLifecycleHelpers(env){
    async function handleImageLoad(){
      if (env.isGameScreenHidden()) return;

      let restored = false;
      let offeredProgress = null;

      const pending = env.getPendingResumeProgress();
      if (pending && String(pending.categoryId || "") === String(env.getCategoryId() || "") && Math.floor(Number(pending.puzzleIdx)) === Math.floor(Number(env.getCurrentPuzzleIdx()))) {
        offeredProgress = pending;
      }
      env.setPendingResumeProgress(null);

      if (!offeredProgress && env.getAuthLoggedIn()) {
        try{
          if (env.isDailyRoute()) {
            const dailyMeta = env.currentPuzzleMeta();
            const dailyDay = String(dailyMeta.dayKey || "").trim();
            const dailySrc = String(dailyMeta.puzzleSrc || "").trim();
            if (dailyDay) {
              const saved = await env.fetchDailyProgressForDay(dailyDay, { routeSrc: dailySrc });
              if (saved) offeredProgress = saved;
            }
          } else {
            const saved = await env.fetchCurrentPuzzleProgressFromServer();
            if (saved) offeredProgress = saved;
          }
        }catch(e){}
      }

      if (offeredProgress && env.getAuthLoggedIn()) {
        const progressIsDaily = !!(offeredProgress.isDaily || String(offeredProgress.categoryId || "") === "daily");
        if (env.hasDifficulty(String(offeredProgress.diffKey || ""))) {
          env.setDifficultyControlValue(String(offeredProgress.diffKey));
          env.setDifficulty(String(offeredProgress.diffKey));
        }

        if (progressIsDaily) {
          const dailyMeta = env.currentPuzzleMeta();
          const routeDay = String(dailyMeta.dayKey || "").trim();
          const routeSrc = env.decodeMaybeTwice(String(dailyMeta.puzzleSrc || "")).trim();
          const savedDay = String(offeredProgress.dayKey || "").trim();
          const savedSrc = env.decodeMaybeTwice(String(offeredProgress.puzzleSrc || "")).trim();
          const savedKey = String(offeredProgress.progressKey || "").trim();
          const sameDay = !!routeDay && (savedDay === routeDay || savedKey.startsWith(`daily:${routeDay}:`));
          const sameSrc = !routeSrc || !savedSrc || savedSrc === routeSrc;

          if (sameDay && sameSrc) {
            if (offeredProgress.completed) {
              restored = env.forceSolvedSnapshot(offeredProgress);
              if (!restored) restored = env.applyProgressSnapshot(offeredProgress);
            } else {
              restored = env.applyProgressSnapshot(offeredProgress);
            }
          } else {
            restored = false;
          }
        } else if (offeredProgress.completed) {
          restored = env.forceSolvedSnapshot(offeredProgress);
          if (!restored) restored = env.applyProgressSnapshot(offeredProgress);
        } else {
          const resumeChoice = await env.askResumeProgress(offeredProgress);
          if (resumeChoice === "resume") {
            restored = env.applyProgressSnapshot(offeredProgress);
          } else if (resumeChoice === "startover") {
            const staleKey = String(offeredProgress.progressKey || env.buildProgressKeyFromMeta(offeredProgress));
            try{ await env.clearProgressOnServer(staleKey); }catch(e){}
            env.setLastProgressFingerprint("");
          }
        }
      }

      if (!restored) {
        env.setCompletedPuzzleState(false);
        env.updateCompletionRatingDisplay(null);
        env.setDifficulty(env.getDifficultyControlValue());
        env.scrambleWithoutTimer();
      }
      env.updateStats();
      env.draw();
    }

    function handleImageError(){
      env.resizeCanvasToFit();
      const ctx = env.getCtx();
      const canvas = env.getCanvas();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ff7c9a";
      ctx.font = "18px system-ui";
      ctx.fillText("Could not load puzzle image", 20, 40);
      ctx.fillStyle = "#e8eef7";
      ctx.fillText("Check puzzles/index.json paths and image files", 20, 70);
      env.updateStats();
    }

    async function ensureLocalStateMatchesUser(){
      try{
        const r = await fetch("/api/me.php", { cache:"no-store" });
        const me = await r.json();
        const loggedIn = !!(me && me.loggedIn);
        const nextUserTag = loggedIn ? String(me.userTag || me.username || "") : "";
        const prevUserTag = String(env.getAuthUserTag() || "");
        const userChanged = String(prevUserTag) !== String(nextUserTag);

        env.setAuthLoggedIn(loggedIn);
        env.setAuthUserTag(nextUserTag);

        if (userChanged){
          env.setCompletedPuzzleState(false);
          env.updateCompletionRatingDisplay(null);
          env.setLastProgressFingerprint("");
          env.setProgressSaveSeq(0);
          env.setLastAcceptedProgressSeq(0);
          env.setPendingResumeProgress(null);
        }

        if (!loggedIn) {
          env.setPoints(0);
        } else {
          const sp = await env.fetchServerPoints();
          env.setPoints(typeof sp === "number" ? sp : 0);
        }

        try{ env.updateStats(); }catch(e){}
        env.syncSaveStatusForAuth();
      } catch (e) {
        env.syncSaveStatusForAuth();
      }
    }

    async function boot(){
      const route = env.parseRouteHash();

      if (route && route.src && route.daily) {
        try{
          try{
            if (env.getAuthLoggedIn() && route.daily) {
              const savedDaily = await env.fetchDailyProgressForDay(String(route.daily || ""), {
                routeSrc: env.decodeMaybeTwice(String(route.src || ""))
              });
              if (savedDaily && typeof savedDaily === "object") {
                env.setPendingResumeProgress(savedDaily);
              }
            }
          }catch(e){}
          if (env.openDailyRoute(route)) {
            try{ env.loadPuzzleCatalogFromIndex().catch(() => {}); }catch(e){}
            return;
          }
        }catch(e){
          env.clearRoutePreload();
        }
      }

      await env.loadPuzzleCatalogFromIndex();

      try{
        if (route && route.src) {
          const inferred = env.catFromPuzzleSrc(route.src);
          if (inferred) route.cat = inferred;
        }
      }catch(e){}

      if (!route.src && !route.cat && !route.puzzle && !route.daily && env.getAuthLoggedIn()) {
        try{
          const latest = await env.fetchLatestProgressFromServer();
          if (latest && latest.categoryId) {
            env.setPendingResumeProgress(latest);
            if (env.hasDifficulty(String(latest.diffKey || ""))) {
              env.setDifficultyControlValue(String(latest.diffKey));
              env.setDifficulty(String(latest.diffKey));
            }
            env.openCategory(String(latest.categoryId), {
              src: String(latest.puzzleSrc || ""),
              puzzle: String(latest.puzzleName || "")
            });
            return;
          }
        }catch(e){}
      }

      if (route.src) {
        const match = env.findPuzzleBySrcInCatalog(route.src);
        if (match && match.catId) {
          env.openCategory(match.catId, {
            src: match.item && match.item.src ? match.item.src : env.decodeMaybeTwice(route.src),
            puzzle: route.puzzle || (match.item && match.item.name) || ""
          });
          return;
        }

        const inferredCat = env.catFromPuzzleSrc(route.src);
        if (inferredCat && env.hasCategory(inferredCat)) {
          env.openCategory(inferredCat, { src: env.decodeMaybeTwice(route.src), puzzle: route.puzzle || "" });
          return;
        }
      }

      const catFromHash = env.normalizeCatId(route.cat || env.parseCatFromHash());
      if (catFromHash && env.hasCategory(catFromHash)) {
        env.openCategory(catFromHash);
        return;
      }

      env.showLanding();
      await env.refreshLandingContinueButtonState();
    }

    async function startApp(){
      await ensureLocalStateMatchesUser();
      try {
        const u = await env.fetchUnlockedFromServer();
        if (u) env.setUnlockedCache(u);
      } catch(e) {}
      await env.applyThemeFromJson();
      env.applyThemeToDom();
      await boot();

      window.addEventListener("focus", () => {
        try { env.syncPointsFromServer(); } catch(e){}
        try { env.persistProgressNow({ force:true }); } catch(e){}
        try { env.refreshLandingContinueButtonState().catch(()=>{}); } catch(e){}
      });

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          try { env.syncPointsFromServer(); } catch(e){}
          try { env.refreshLandingContinueButtonState().catch(()=>{}); } catch(e){}
        } else {
          try { env.persistProgressNow({ force:true, keepalive:true }); } catch(e){}
        }
      });

      window.addEventListener("beforeunload", () => {
        try {
          if (env.isSolved()) env.forcePersistCompletedProgress();
          else env.persistProgressNow({ force:true, keepalive:true });
        } catch(e){}
      });

      window.addEventListener("pagehide", () => {
        try {
          if (env.isSolved()) env.forcePersistCompletedProgress();
          else env.persistProgressNow({ force:true, keepalive:true });
        } catch(e){}
      });

      setInterval(() => {
        try{
          if (env.getAuthLoggedIn() && !document.hidden && !env.isGameScreenHidden() && env.isRunning()) {
            env.persistProgressNow({ force:true }).catch(()=>{});
          }
        }catch(e){}
      }, 5000);

      setTimeout(() => { try { env.syncPointsFromServer(); } catch(e){} }, 400);
      setTimeout(() => { try { env.syncPointsFromServer(); } catch(e){} }, 1200);
      setTimeout(() => { try { env.syncPointsFromServer(); } catch(e){} }, 2500);
    }

    return {
      handleImageLoad,
      handleImageError,
      ensureLocalStateMatchesUser,
      boot,
      startApp,
    };
  }

  global.SnapshiftGameLifecycle = {
    create: createGameLifecycleHelpers,
  };
})(window);
