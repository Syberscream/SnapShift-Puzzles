(function(global){
  function createHudRenderHelpers(env){
    function updateHintPlaceButton(){
      const btn = env.refs.getHintPlaceBtnEl();
      if (!btn) return;

      if (env.getHardMode() || env.isDailyRoute()) {
        btn.style.display = "none";
        btn.disabled = true;
        return;
      }

      const cost = env.placeCost();
      const solved = env.isSolved();
      btn.style.display = "";
      btn.textContent = `Swap Cost: ${cost}`;
      btn.disabled = env.getPaused() || solved || env.getPoints() < cost;
    }

    function updateSwapHintButton(){
      const btn = env.refs.getDailySwapHintBtnEl();
      if (!btn) return;

      btn.style.display = "";
      const chk = env.canUseSwapHint();
      const cost = env.swapHintCost();
      if (chk.ok){
        btn.disabled = false;
        btn.textContent = cost > 0 ? `Swap Hint (-${cost})` : "Swap Hint";
        return;
      }

      btn.disabled = true;
      if (chk.reason === "cooldown"){
        const s = Math.ceil((chk.waitMs || 0) / 1000);
        btn.textContent = `Swap in ${s}s`;
      } else if (chk.reason === "points"){
        btn.textContent = `Need ${chk.cost} pts`;
      } else if (chk.reason === "solved"){
        btn.textContent = cost > 0 ? `Swap Hint (-${cost})` : "Swap Hint";
      } else {
        btn.textContent = "Swap Hint";
      }
    }

    function drawLoadingState(){
      const canvas = env.getCanvas();
      const ctx = env.getCtx();
      ctx.fillStyle = "#1c2442";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(123, 196, 255, 0.12)";
      ctx.fillRect(20, 20, Math.max(160, canvas.width - 40), Math.max(120, canvas.height - 40));

      ctx.fillStyle = "#e8eef7";
      ctx.font = "600 18px system-ui";
      ctx.fillText("Loading puzzle...", 28, 46);
      ctx.font = "14px system-ui";
      ctx.fillStyle = "rgba(232, 238, 247, 0.78)";
      ctx.fillText("Preparing board and image", 28, 70);
    }

    function drawGridOutline(dx, dy, tileW, tileH){
      const ctx = env.getCtx();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#9bb0cc";
      ctx.lineWidth = Math.max(1, Math.floor(Math.min(tileW, tileH) * 0.01));
      ctx.strokeRect(dx + 0.5, dy + 0.5, tileW - 1, tileH - 1);
      ctx.globalAlpha = 1;
    }

    function drawCorrectOutline(i, dx, dy, tileW, tileH, flashing){
      if (env.getHideAllLines() || env.getHardMode()) return;
      const shouldShowGreen = (env.getTiles()[i] === i) && (!flashing || env.getFlashWinOn());
      if (!env.isDailyRoute() && shouldShowGreen) {
        const ctx = env.getCtx();
        ctx.strokeStyle = "#7CFFB2";
        ctx.lineWidth = Math.max(1, Math.floor(Math.min(tileW, tileH) * 0.02));
        ctx.strokeRect(dx + 2, dy + 2, tileW - 4, tileH - 4);
      }
    }

    function drawDailyHintOutline(i, dx, dy, tileW, tileH){
      if (!env.isDailyRoute()) return;
      if (env.getHintActiveUntil() <= Date.now()) return;
      if (env.getTiles()[i] === i) return;
      const ctx = env.getCtx();
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "rgba(0,153,255,0.95)";
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(tileW, tileH) * 0.03));
      ctx.strokeRect(dx + 3, dy + 3, tileW - 6, tileH - 6);
      ctx.restore();
    }

    function drawSwapHintOutline(i, dx, dy, tileW, tileH){
      const pair = env.getSwapPair();
      if (env.getSwapHintActiveUntil() <= Date.now() || !pair || (i !== pair[0] && i !== pair[1])) return;
      const ctx = env.getCtx();
      ctx.save();
      ctx.globalAlpha = 0.95;
      const isPerfect = env.getSwapPerfectActiveUntil() > Date.now();
      ctx.strokeStyle = isPerfect ? "rgba(0,210,255,0.95)" : "rgba(255,200,0,0.95)";
      if (isPerfect){
        ctx.shadowColor = "rgba(0,210,255,0.75)";
        ctx.shadowBlur = Math.max(10, Math.floor(Math.min(tileW, tileH) * 0.18));
      }
      ctx.lineWidth = Math.max(3, Math.floor(Math.min(tileW, tileH) * 0.035));
      ctx.strokeRect(dx + 4, dy + 4, tileW - 8, tileH - 8);
      if (isPerfect){
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = Math.max(2, Math.floor(Math.min(tileW, tileH) * 0.02));
        ctx.strokeRect(dx + 8, dy + 8, tileW - 16, tileH - 16);
      }
      ctx.restore();
    }

    function drawLockedOverlay(i, dx, dy, tileW, tileH){
      if (env.getHideAllLines() || !env.getLocked()[i]) return;
      const ctx = env.getCtx();
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(dx, dy, tileW, tileH);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ffd37c";
      ctx.font = `${Math.max(12, Math.floor(Math.min(tileW, tileH) * 0.18))}px system-ui`;
      ctx.fillText("\uD83D\uDD12", dx + 6, dy + 18);
      ctx.restore();
    }

    function drawSelectionOutline(i, dx, dy, tileW, tileH, flashing){
      if (flashing || env.getHideAllLines()) return;
      const selected = env.getSelected();
      const multiSel = env.getMultiSel();
      const isSelectedDraw = selected === i || multiSel.indexOf(i) !== -1;
      if (!isSelectedDraw) return;
      const ctx = env.getCtx();
      ctx.strokeStyle = "#7CC4FF";
      ctx.lineWidth = Math.max(3, Math.floor(Math.min(tileW, tileH) * 0.05));
      ctx.strokeRect(dx + 2, dy + 2, tileW - 4, tileH - 4);
    }

    function updateStats(){
      const refs = env.refs;
      const timerStat = refs.getTimerStatEl();
      const scoreStat = refs.getScoreStatEl();
      const streakStat = refs.getStreakStatEl();
      const bestStat = refs.getBestStatEl();
      const pausePill = refs.getPausePillEl();
      const fsBtn = refs.getFsBtnEl();
      const pauseBtn = refs.getPauseBtnEl();
      const themeBtn = refs.getThemeBtnEl();
      const hardBtn = refs.getHardBtnEl();
      const assetStat = refs.getAssetStatEl();
      const categoryStat = refs.getCategoryStatEl();
      const hudCategory = refs.getHudCategoryEl();
      const globalPointsPill = refs.getGlobalPointsPillEl();

      if (timerStat) timerStat.textContent = `Time: ${env.fmtTime(env.getElapsedMs())}`;
      if (scoreStat) scoreStat.textContent = `Score: ${env.getScore()}`;
      if (streakStat) streakStat.textContent = `Streak: ${env.getStreak()}`;

      const best = env.getBestMs();
      if (bestStat) bestStat.textContent = `Best: ${best == null ? "-" : env.fmtTime(best)}`;

      if (pausePill) pausePill.classList.toggle("show", env.getPaused());
      if (fsBtn) fsBtn.textContent = document.fullscreenElement ? "Minimize" : "Full-screen";
      if (pauseBtn) pauseBtn.textContent = env.getPaused() ? "Resume" : "Pause";
      if (themeBtn) themeBtn.textContent = `Theme Background: ${env.getThemeEnabled() ? "On" : "Off"}`;

      if (hardBtn) {
        const hardText = env.getHardMode() ? "Hard Mode" : "Easy Mode";
        hardBtn.textContent = hardText;
        hardBtn.dataset.short = hardText;
        hardBtn.title = hardText;
        hardBtn.setAttribute("aria-label", hardText);
      }

      const img = env.getImg();
      const puzzles = env.getPuzzles();
      const currentPuzzleIdx = env.getCurrentPuzzleIdx();
      const puzzleName = puzzles[currentPuzzleIdx] && puzzles[currentPuzzleIdx].name ? puzzles[currentPuzzleIdx].name : "Puzzle";
      const baseOk = img.complete && img.naturalWidth > 0;
      if (assetStat) {
        assetStat.textContent = `Assets: ${baseOk ? "OK" : "..."} (${puzzleName})${env.getCompletedPuzzleState() && env.isSolved() ? " • Completed" : ""}`;
      }

      if (categoryStat) categoryStat.textContent = `Category: ${env.getCategoryName()}`;
      if (hudCategory) hudCategory.textContent = `Category: ${env.getCategoryName()}`;

      updateHintPlaceButton();
      env.updateUnlockUI();
      if (globalPointsPill) globalPointsPill.textContent = `Points: ${env.getPoints()}`;

      try{
        updateSwapHintButton();
      }catch(e){}
    }

    function draw(){
      env.resizeCanvasToFit();
      const canvas = env.getCanvas();
      const ctx = env.getCtx();
      const img = env.getImg();

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!img.complete || img.naturalWidth === 0) {
        drawLoadingState();
        return;
      }

      const rows = env.getRows();
      const cols = env.getCols();
      const tileW = canvas.width / cols;
      const tileH = canvas.height / rows;
      const now = performance.now();
      const flashing = now < env.getFlashWinUntil();
      const srcW = img.width / cols;
      const srcH = img.height / rows;
      const tiles = env.getTiles();
      const completionLocked = !!(env.getCompletedPuzzleState() || env.isSolved());

      for (let i = 0; i < tiles.length; i++) {
        const tileId = tiles[i];
        const dest = env.indexToRC(i);
        const dx = dest.c * tileW;
        const dy = dest.r * tileH;
        const src = env.indexToRC(tileId);
        const sx = src.c * srcW;
        const sy = src.r * srcH;

        ctx.drawImage(img, sx, sy, srcW, srcH, dx, dy, tileW, tileH);

        if (!completionLocked && !env.getHideAllLines()) drawGridOutline(dx, dy, tileW, tileH);
        if (!completionLocked) {
          drawCorrectOutline(i, dx, dy, tileW, tileH, flashing);
          drawDailyHintOutline(i, dx, dy, tileW, tileH);
          drawSwapHintOutline(i, dx, dy, tileW, tileH);
          drawLockedOverlay(i, dx, dy, tileW, tileH);
          drawSelectionOutline(i, dx, dy, tileW, tileH, flashing);
        }

        if (!completionLocked && !env.getHideAllLines() && !flashing) {
          env.drawCorrectFX(i, dx, dy, tileW, tileH, now);
        }
      }

      if (!completionLocked && !flashing && !env.getHideAllLines()) {
        env.drawPreviewOutline(tileW, tileH);
      }
    }

    return {
      updateStats,
      draw,
    };
  }

  global.SnapshiftGameHudRender = {
    create: createHudRenderHelpers,
  };
})(window);
