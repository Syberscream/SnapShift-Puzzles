(function(global){
  function createGameSessionHelpers(env){
    function resetBoardState(options){
      var opts = options || {};
      env.setTiles(Array.from({ length: env.totalTiles() }, function(_, i){ return i; }));
      env.setLocked(Array.from({ length: env.totalTiles() }, function(){ return false; }));

      env.clearSelection();

      env.setScore(0);
      env.setStreak(0);
      env.setMovesMade(0);

      env.setHideAllLines(false);
      env.setFlashWinUntil(0);
      env.setFlashWinOn(true);
      env.setFlashWinLastToggle(0);

      env.clearCorrectFx();

      env.setPausedState(false);
      env.hidePauseOverlay();
      env.stopTimer();
      env.setElapsedMs(0);
      env.hideHelpPanel();

      if (opts.clearCompletion) {
        env.setCompletedPuzzleState(false);
        env.updateCompletionRatingDisplay(null);
      }

      if (opts.resize !== false) env.resizeCanvasToFit();
      if (opts.redraw !== false) {
        env.updateStats();
        env.draw();
      }
    }

    function scrambleWithoutTimer(){
      try{
        // Lifecycle remains the source of truth for whether a late scramble
        // should be intercepted for a validated completed reopen.
        if (env.interceptScrambleRequest && env.interceptScrambleRequest()) {
          return;
        }
      }catch(e){}

      resetBoardState({ clearCompletion: true });
      env.setTiles(env.makeDerangement(env.totalTiles()));
      env.stopTimer();
      env.setElapsedMs(0);
      env.updateStats();
      env.draw();
      env.markProgressDirty();
    }

    function startNewGame(){
      env.setCompletedPuzzleState(false);
      env.updateCompletionRatingDisplay(null);
      try{ env.clearProgressOnServer(env.buildProgressKeyFromMeta(), { silent: true }).catch(function(){}); }catch(e){}
      resetBoardState({ clearCompletion: true });
      env.setTiles(env.makeDerangement(env.totalTiles()));
      env.setElapsedMs(0);
      env.startTimer();
      env.updateStats();
      env.draw();
      env.markProgressDirty();
    }

    function loadPuzzleImage(idx){
      try{ env.persistProgressNow({ force: true }); }catch(e){}
      var current = Math.max(0, Math.min(env.getPuzzles().length - 1, idx));
      env.setCurrentPuzzleIdx(current);
      if (!env.isPuzzleUnlockedIndex(current)) return false;
      env.saveCurrentPuzzle();

      env.rebuildPuzzleDropdown();
      env.setPuzzleSelectValue(String(current));

      var puzzles = env.getPuzzles();
      env.setImageSrc(puzzles[current].src);
      env.setAssetLoadingText(puzzles[current].name);

      resetBoardState({ clearCompletion: true, redraw: false });
      env.setHideAllLines(true);
      if (env.isDailyRoute && env.isDailyRoute()) {
        env.setTiles([]);
        env.setLocked([]);
      }
      env.updateStats();
      env.draw();
      env.updateUnlockUI();
      return true;
    }

    return {
      resetBoardState: resetBoardState,
      scrambleWithoutTimer: scrambleWithoutTimer,
      startNewGame: startNewGame,
      loadPuzzleImage: loadPuzzleImage,
    };
  }

  global.SnapshiftGameSession = {
    create: createGameSessionHelpers,
  };
})(window);
