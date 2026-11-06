(function(global){
  function createGameCompletionHelpers(env){
    let completionInFlight = false;
    let forcedToastTimer = null;

    function forceAccomplishmentToast(title, body, kind, duration){
      try{ env.showAccomplishmentToast(title, body, kind, duration); }catch(e){}
      try{
        const toast = env.refs.getAccomplishmentToastEl ? env.refs.getAccomplishmentToastEl() : null;
        if (!toast) return;
        toast.dataset.kind = String(kind || "points").toLowerCase();
        toast.innerHTML = `<span class="accomplishmentToastTitle">${title}</span><span class="accomplishmentToastBody">${body}</span>`;
        toast.classList.add("show");
        if (forcedToastTimer) clearTimeout(forcedToastTimer);
        forcedToastTimer = setTimeout(() => {
          try{ toast.classList.remove("show"); }catch(e){}
        }, Math.max(1600, Math.floor(Number(duration) || 4200)));
      }catch(e){}
    }

    function getDifficultyShape(diff){
      const key = String(diff || env.getDiffKey() || "easy").toLowerCase();
      if (key === "hard") return { rows: 8, cols: 12 };
      if (key === "medium") return { rows: 6, cols: 9 };
      return { rows: 4, cols: 6 };
    }

    async function submitDailyScoreIfNeeded(timeMs){
      let dayKey = "";
      try{
        const route = env.parseRouteHash();
        env.applyDailyUiLocks();
        if (route && route.daily) dayKey = String(route.daily || "");
      }catch(e){}
      if (!dayKey) return;

      try{
        const payload = {
          day: dayKey,
          time_ms: Math.max(0, Math.floor(Number(timeMs) || 0)),
          moves: Math.max(0, Math.floor(Number(env.getMovesMade()) || 0)),
          acc: env.calcMoveEfficiency(env.getMovesMade()),
        };
        const r = await fetch("/api/leaderboard_submit.php", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        try{ await r.json(); }catch(e){}
        try{
          const hr = await fetch("/api/daily_history.php?days=14", { cache: "no-store", credentials: "include" });
          const hj = await hr.json();
          if (hj && hj.ok && hj.loggedIn) {
            const currentStreak = Number(hj.current_streak || 0);
            const lastCompleted = String(hj.last_completed || "");
            env.maybeCelebrateStreakMilestone(currentStreak, lastCompleted, String(dayKey || ""));
            await env.maybeClaimStreakRewards(currentStreak, lastCompleted, String(dayKey || ""));
          }
        }catch(e){}
      }catch(e){}
    }

    function computePuzzleMedalFromRun(opts){
      const options = opts || {};
      const diff = String(options.diffKey || env.getDiffKey() || "easy").toLowerCase();
      const shape = getDifficultyShape(diff);
      const total = Math.max(1, Number(options.totalTiles) || (shape.rows * shape.cols));
      const moves = Math.max(total, Math.floor(Number(options.movesMade) || total));
      const elapsed = Math.max(1000, Math.floor(Number(options.elapsedMs) || 0) || (total * 7000));
      const parPerTileMs = diff === "hard" ? 8000 : (diff === "medium" ? 6800 : 5600);
      const moveEff = Math.min(1, total / moves);
      const speedEff = Math.min(1, (total * parPerTileMs) / elapsed);
      const score = Math.max(0, Math.min(1, (moveEff * 0.72) + (speedEff * 0.28)));
      let stars = 1;
      let label = "Bronze";
      let key = "bronze";
      if (score >= 0.90) {
        stars = 3;
        label = "Gold";
        key = "gold";
      } else if (score >= 0.76) {
        stars = 2;
        label = "Silver";
        key = "silver";
      }
      return {
        stars: stars,
        label: label,
        key: key,
        scorePct: Math.round(score * 100),
        moveEffPct: Math.round(moveEff * 100),
        speedEffPct: Math.round(speedEff * 100),
        starsText: "\u2605".repeat(stars) + "\u2606".repeat(Math.max(0, 3 - stars)),
      };
    }

    function updateCompletionRatingDisplay(rating){
      const refs = env.refs;
      const ratingLine = refs.getRatingLineEl();
      const ratingStars = refs.getRatingStarsEl();
      const ratingMedal = refs.getRatingMedalEl();
      const ratingMeta = refs.getRatingMetaEl();
      if (!ratingLine || !ratingStars || !ratingMedal || !ratingMeta) return;
      if (!rating) {
        ratingLine.hidden = true;
        ratingLine.classList.remove("isGold", "isSilver", "isBronze");
        return;
      }
      ratingLine.hidden = false;
      ratingLine.classList.remove("isGold", "isSilver", "isBronze");
      ratingLine.classList.add("is" + rating.label);
      ratingStars.textContent = rating.starsText;
      ratingMedal.textContent = rating.label + " Medal";
      ratingMeta.textContent = rating.scorePct + "% overall - " + rating.moveEffPct + "% move efficiency - " + rating.speedEffPct + "% speed";
    }

    function completionShareUrl(){
      try{
        const href = String(location.href || "").trim();
        return href || "/";
      }catch(e){
        return "/";
      }
    }

    function buildCompletionShareText(rating){
      const puzzles = env.getPuzzles();
      const puzzleName = String((puzzles && puzzles[env.getCurrentPuzzleIdx()] && puzzles[env.getCurrentPuzzleIdx()].name) || "this puzzle").trim();
      const categoryName = String(env.getCategoryName() || "Snapshift").trim();
      const medalText = rating && rating.label ? (rating.label + " Medal") : "a finish";
      const timeText = env.fmtTime(env.getElapsedMs());
      const url = completionShareUrl();

      if (env.isDailyRoute()) {
        return "I solved today's Snapshift Daily Challenge in " + timeText + " with " + env.getScore() + " score and earned the " + medalText + ". " + url;
      }
      return 'I solved "' + puzzleName + '" on Snapshift in ' + timeText + " with " + env.getScore() + " score (" + categoryName + ") and earned the " + medalText + ". " + url;
    }

    function setShareStatus(msg){
      const el = env.refs.getShareStatusEl();
      if (!el) return;
      el.textContent = msg || "";
    }

    async function copyCompletionShareText(){
      const promptEl = env.refs.getSharePromptLineEl();
      const text = String((promptEl && promptEl.textContent) || "").trim();
      if (!text) return false;

      try{
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          setShareStatus("Result copied. Challenge a friend.");
          return true;
        }
      }catch(e){}

      try{
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) {
          setShareStatus("Result copied. Challenge a friend.");
          return true;
        }
      }catch(e){}

      setShareStatus("Copy failed on this browser.");
      return false;
    }

    async function nativeShareCompletion(){
      const promptEl = env.refs.getSharePromptLineEl();
      const text = String((promptEl && promptEl.textContent) || "").trim();
      if (!text || !navigator.share) return false;
      try{
        await navigator.share({
          title: env.isDailyRoute() ? "Snapshift Daily Challenge" : "Snapshift Puzzle Result",
          text: text,
          url: completionShareUrl(),
        });
        setShareStatus("Shared successfully.");
        return true;
      }catch(e){
        if (String((e && e.name) || "") !== "AbortError") setShareStatus("Share cancelled or unavailable.");
        return false;
      }
    }

    function updateCompletionShareUi(rating){
      const promptEl = env.refs.getSharePromptLineEl();
      const nativeShareBtn = env.refs.getNativeShareBtnEl();
      if (promptEl) promptEl.textContent = buildCompletionShareText(rating);
      setShareStatus("");
      if (nativeShareBtn) nativeShareBtn.hidden = !(navigator && typeof navigator.share === "function");
    }

    function updateReturnHookUi(){
      const returnHookLine = env.refs.getReturnHookLineEl();
      const returnHookPrimary = env.refs.getReturnHookPrimaryEl();
      const returnHookSecondary = env.refs.getReturnHookSecondaryEl();
      if (!returnHookLine || !returnHookPrimary || !returnHookSecondary) return;
      if (env.isDailyRoute()) {
        returnHookLine.textContent = "Nice run. Check the Daily Leaderboard, then come back tomorrow to keep your streak alive.";
        returnHookPrimary.textContent = "Daily Leaderboard";
        returnHookPrimary.setAttribute("href", "/?lb=daily");
        returnHookSecondary.textContent = "Daily Archive";
        returnHookSecondary.setAttribute("href", "/daily-archive.html");
        return;
      }
      returnHookLine.textContent = "Want another run? Jump into today's Daily Challenge now, then come back tomorrow to keep your streak alive.";
      returnHookPrimary.textContent = "Play Today's Challenge";
      returnHookPrimary.setAttribute("href", "/");
      returnHookSecondary.textContent = "Daily Archive";
      returnHookSecondary.setAttribute("href", "/daily-archive.html");
    }

    function isTrifectaComplete(status){
      return !!(status && status.trifecta && status.trifecta.completed);
    }

    function maybeShowTrifectaToast(beforeStatus, afterStatus, puzzleMeta){
      try{
        if (!puzzleMeta || puzzleMeta.isDaily) return;
        if (!beforeStatus || !afterStatus) return;
        if (isTrifectaComplete(beforeStatus) || !isTrifectaComplete(afterStatus)) return;
        if (env.hasSeenTrifectaToast && env.hasSeenTrifectaToast(puzzleMeta)) return;

        if (env.markTrifectaToastSeen) env.markTrifectaToastSeen(puzzleMeta);
        const puzzleName = String(puzzleMeta.puzzleName || "Puzzle").trim() || "Puzzle";
        setTimeout(() => {
          forceAccomplishmentToast("Trifecta Complete", puzzleName + " finished on Easy, Medium, and Hard", "trifecta", 5200);
          try{ env.playMedalFanfare("gold", { daily:false }); }catch(e){}
          try{ env.spawnPointsFloat("TRIFECTA", "gold", { big:true }); }catch(e){}
        }, 760);
      }catch(e){}
    }

    async function finishGame(){
      if (completionInFlight) return;
      completionInFlight = true;

      let elapsedMs = 0;
      let earned = 0;
      let diffKey = "easy";
      let pointsBeforeCompletion = Math.max(0, Math.floor(Number(env.getPoints()) || 0));
      let puzzleMeta = {
        isDaily: false,
        categoryId: "",
        categoryName: "",
        puzzleIdx: 0,
        puzzleName: "",
        puzzleSrc: "",
        diffKey: "easy",
        dayKey: "",
        rows: env.getRows ? env.getRows() : 0,
        cols: env.getCols ? env.getCols() : 0,
      };
      const completedAtIso = new Date().toISOString();

      try{
        env.setPaused(false);
        env.stopTimer();

        elapsedMs = Math.max(0, Math.floor(Number(env.getElapsedMs()) || 0));
        diffKey = String(env.getDiffKey() || "easy");
        const timeSec = Math.max(0.1, elapsedMs / 1000);
        const timeBonus = Math.max(0, Math.floor(env.getTimeBonusFactor() / timeSec));
        env.setScore(env.getScore() + Math.floor(timeBonus * env.pointsMultiplier()));

        earned = Math.max(0, Math.floor(Number(env.calcWinPoints()) || 0));
        pointsBeforeCompletion = Math.max(0, Math.floor(Number(env.getPoints()) || 0));
        env.setPoints(pointsBeforeCompletion + earned);
        try{ puzzleMeta = Object.assign(puzzleMeta, env.currentPuzzleMeta() || {}); }catch(e){}

        try{ env.savePoints(); }catch(e){}
        env.setCompletedPuzzleState(true);
        try{ env.setHideAllLines(true); }catch(e){}
        try{ env.clearCorrectFx(); }catch(e){}
        try{ env.clearSelection(); }catch(e){}
        try{ env.updateStats(); }catch(e){}
        try{ env.draw(); }catch(e){}
      }catch(e){
        completionInFlight = false;
        return;
      }

      const diffLabel = env.getDifficultyLabel(diffKey);
      const finishText = (puzzleMeta.isDaily ? "Daily puzzle" : "Puzzle completion") + " - " +
        (puzzleMeta.categoryName || puzzleMeta.categoryId || "Puzzle") + " - " +
        (puzzleMeta.puzzleName || ("Puzzle " + (Number(puzzleMeta.puzzleIdx || 0) + 1))) + " - " +
        diffLabel;
      const completionEventKey = [
        puzzleMeta.isDaily ? "daily" : "puzzle",
        String(puzzleMeta.categoryId || ""),
        String(puzzleMeta.puzzleIdx || 0),
        String(puzzleMeta.puzzleSrc || ""),
        String(puzzleMeta.diffKey || ""),
        String(Math.floor(elapsedMs || 0)),
        String(Math.floor(env.getMovesMade() || 0)),
        completedAtIso,
      ].join("|");

      let best = null;
      let isNewBest = false;
      try{
        best = env.getBestMs();
        if (best == null || elapsedMs < best) {
          env.setBestMs(Math.floor(elapsedMs));
          isNewBest = true;
        }
      }catch(e){}

      const rating = computePuzzleMedalFromRun({
        diffKey: diffKey,
        totalTiles: env.totalTiles(),
        movesMade: env.getMovesMade(),
        elapsedMs: elapsedMs,
      });

      try{ updateCompletionRatingDisplay(rating); }catch(e){}
      try{ env.updateStats(); }catch(e){}
      try{ env.draw(); }catch(e){}

      try{
        const difficulty = env.getDifficultyDefinition(diffKey);
        const finishLine = env.refs.getFinishLineEl();
        const bestLine = env.refs.getBestLineEl();
        const pointsLineEl = env.refs.getPointsLineEl();
        if (finishLine) finishLine.textContent = "Time: " + env.fmtTime(elapsedMs) + " - Score: " + env.getScore() + " (mult: x" + env.pointsMultiplier().toFixed(2) + ")";
        if (bestLine) {
          bestLine.textContent = isNewBest
            ? "New best for " + env.getCategoryName() + " - " + difficulty.label + " (" + env.getRows() + "x" + env.getCols() + "): " + env.fmtTime(elapsedMs)
            : "Best for " + env.getCategoryName() + " - " + difficulty.label + " (" + env.getRows() + "x" + env.getCols() + "): " + (best == null ? "-" : env.fmtTime(best));
        }
        if (pointsLineEl) pointsLineEl.textContent = "+" + earned + " Points earned - You now have " + env.getPoints() + " Points";
      }catch(e){}

      try{
        if (env.isDailyRoute()) {
          forceAccomplishmentToast("Daily " + rating.label + " Medal", "Daily complete - +" + earned + " points - " + rating.scorePct + "% overall", "daily", 4200);
          env.triggerDailyCompletionPulse();
          env.spawnPointsFloat("+" + earned, "daily", { big: true });
        } else {
          const medalKey = String(rating.key || rating.label || "points").toLowerCase();
          forceAccomplishmentToast(rating.label + " Medal", "+" + earned + " points - " + rating.scorePct + "% overall", medalKey, 4200);
          env.spawnPointsFloat("+" + earned, medalKey, { big: true });
        }
      }catch(e){}

      try{ env.playCoinCascade(earned, { big: true, medal: rating.label }); }catch(e){}
      try{ env.playMedalFanfare(String(rating.key || rating.label || "gold").toLowerCase(), { daily: env.isDailyRoute() }); }catch(e){}

      try{ updateCompletionShareUi(rating); }catch(e){}
      try{ updateReturnHookUi(); }catch(e){}
      try{
        setTimeout(() => {
          try{
            const modal = env.refs.getModalEl();
            if (modal) modal.classList.add("show");
          }catch(e){}
        }, 120);
      }catch(e){}
      (async () => {
        let trifectaBefore = null;
        try{
          if (!puzzleMeta.isDaily && env.fetchPuzzleTrifectaStatus) {
            trifectaBefore = await env.fetchPuzzleTrifectaStatus(puzzleMeta);
          }
        }catch(e){ trifectaBefore = null; }

        try{
          const finalSnapshot = env.collectProgressSnapshot({ includeSolved: true, completed: true, completedAt: completedAtIso });
          if (finalSnapshot && finalSnapshot.isDaily) env.writeDailyProgressBackup(finalSnapshot);
        }catch(e){}

        try{
          let saved = false;
          if (env.persistCompletedProgressNow) {
            saved = !!(await env.persistCompletedProgressNow(completedAtIso));
          }
          if (!saved && env.forcePersistCompletedProgress) env.forcePersistCompletedProgress();
        }catch(e){
          try{ if (env.forcePersistCompletedProgress) env.forcePersistCompletedProgress(); }catch(_){}
        }
        try{
          if (!puzzleMeta.isDaily && env.fetchPuzzleTrifectaStatus) {
            const trifectaAfter = await env.fetchPuzzleTrifectaStatus(puzzleMeta);
            maybeShowTrifectaToast(trifectaBefore, trifectaAfter, puzzleMeta);
          }
        }catch(e){}
        try{ await submitDailyScoreIfNeeded(elapsedMs); }catch(e){}

        try{
          const newTotal = await env.addServerPoints(earned, {
            entry_type: puzzleMeta.isDaily ? "daily_puzzle_completion" : "puzzle_completion",
            finish_text: finishText,
            event_key: completionEventKey,
            category_id: String(puzzleMeta.categoryId || ""),
            category_name: String(puzzleMeta.categoryName || ""),
            puzzle_idx: Math.max(0, Math.floor(Number(puzzleMeta.puzzleIdx) || 0)),
            puzzle_name: String(puzzleMeta.puzzleName || ""),
            puzzle_src: String(puzzleMeta.puzzleSrc || ""),
            diff_key: String(puzzleMeta.diffKey || diffKey || "easy"),
            day_key: puzzleMeta.isDaily ? String(puzzleMeta.dayKey || "") : "",
            meta: {
              rows: Math.max(1, Math.floor(Number(puzzleMeta.rows) || 1)),
              cols: Math.max(1, Math.floor(Number(puzzleMeta.cols) || 1)),
              elapsed_ms: Math.max(0, Math.floor(Number(elapsedMs) || 0)),
              moves_made: Math.max(0, Math.floor(Number(env.getMovesMade()) || 0)),
              earned_points: Math.max(0, Math.floor(Number(earned) || 0)),
              completed_at: completedAtIso,
              is_daily: !!puzzleMeta.isDaily,
            },
          });
          if (typeof newTotal === "number") {
            env.setPoints(newTotal);
            try { env.updateStats(); env.draw(); } catch(e){}
            try { env.savePoints(); } catch(e){}
            try{ if (env.maybeShowPointsMilestone) env.maybeShowPointsMilestone(pointsBeforeCompletion, newTotal, { source: "completion" }); }catch(e){}
          }
        }catch(e){}
        completionInFlight = false;
      })();
    }

    return {
      submitDailyScoreIfNeeded: submitDailyScoreIfNeeded,
      computePuzzleMedalFromRun: computePuzzleMedalFromRun,
      updateCompletionRatingDisplay: updateCompletionRatingDisplay,
      finishGame: finishGame,
      completionShareUrl: completionShareUrl,
      buildCompletionShareText: buildCompletionShareText,
      setShareStatus: setShareStatus,
      copyCompletionShareText: copyCompletionShareText,
      nativeShareCompletion: nativeShareCompletion,
      updateCompletionShareUi: updateCompletionShareUi,
      updateReturnHookUi: updateReturnHookUi,
    };
  }

  global.SnapshiftGameCompletion = {
    create: createGameCompletionHelpers,
  };
})(window);
