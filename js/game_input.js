(function(global){
  function createGameInputHelpers(env){
    function completionBlocksInput(){
      if (env.isSolved && env.isSolved()) return true;
      const completed = !!(env.getCompletedPuzzleState && env.getCompletedPuzzleState());
      if (!completed) return false;

      if (env.setCompletedPuzzleState) env.setCompletedPuzzleState(false);
      if (env.updateCompletionRatingDisplay) env.updateCompletionRatingDisplay(null);

      try{
        const tiles = env.getTiles ? env.getTiles() : [];
        const locked = env.getLocked ? env.getLocked() : [];
        if (env.setLocked && Array.isArray(tiles) && Array.isArray(locked) && tiles.length === locked.length) {
          const allLocked = locked.length > 0 && locked.every(Boolean);
          const wrongLocked = locked.some((value, idx) => !!value && tiles[idx] !== idx);
          if (allLocked || wrongLocked) env.setLocked(Array.from({ length: locked.length }, () => false));
        }
      }catch(err){}

      try{ if (env.updateStats) env.updateStats(); }catch(err){}
      try{ if (env.draw) env.draw(); }catch(err){}
      return false;
    }

    function handlePointerDown(e){
      if (completionBlocksInput()) return;
      env.setLastPointerType(e.pointerType || env.getLastPointerType());

      if ((e.pointerType || "") !== "touch") return;

      try { env.getCanvas().setPointerCapture(e.pointerId); } catch(err) {}
      const pt = env.canvasToLocalCoords(e);
      const idx = env.tileIndexFromCanvas(pt.x, pt.y);
      env.getActivePointers().set(e.pointerId, { x: pt.x, y: pt.y, idx: idx });

      if (env.getMultiShiftEnabled() && env.getActivePointers().size === 1) {
        if (env.getMultiMoveArmed()) {
          if (idx != null && env.getMultiSel().length >= 2) {
            try{ env.applyGroupMove(idx); }catch(err){}
            try{ env.setMultiShift(false); }catch(err){}
            try{
              if (Array.isArray(env.getMultiSel())) env.getMultiSel().length = 0;
            }catch(err){}
            try{ env.updateShiftUi(); }catch(err){}
          }
          env.mgCancel();
          return;
        }

        env.setSuppressNextClick(true);
        if (idx != null && !env.getLocked()[idx]) env.toggleMultiSel(idx);
        try{ env.updateShiftUi(); }catch(err){}
        return;
      }

      if (env.getActivePointers().size === 2) {
        env.setMtActive(true);
        env.setMtDidMove(false);
        env.setSuppressNextClick(true);

        const arr = Array.from(env.getActivePointers().values());
        const a = arr[0].idx;
        const b = arr[1].idx;
        if (a != null && !env.getLocked()[a]) env.toggleMultiSel(a);
        if (b != null && !env.getLocked()[b]) env.toggleMultiSel(b);

        const cx = (arr[0].x + arr[1].x) / 2;
        const cy = (arr[0].y + arr[1].y) / 2;
        const centerIdx = env.tileIndexFromCanvas(cx, cy);
        if (centerIdx != null) env.setPreviewDestination(centerIdx);
        env.draw();
      }
    }

    function handlePointerMove(evt){
      if (completionBlocksInput()) return;
      if ((evt.pointerType || "") === "touch" && env.getMtActive() && env.getActivePointers().size >= 2) {
        try { evt.preventDefault(); } catch(err) {}
        const pt = env.canvasToLocalCoords(evt);
        const cur = env.getActivePointers().get(evt.pointerId);
        if (cur) {
          cur.x = pt.x;
          cur.y = pt.y;
          cur.idx = env.tileIndexFromCanvas(pt.x, pt.y);
        }
        const arr = Array.from(env.getActivePointers().values());
        const cx = (arr[0].x + arr[1].x) / 2;
        const cy = (arr[0].y + arr[1].y) / 2;
        const centerIdx = env.tileIndexFromCanvas(cx, cy);
        if (centerIdx != null) {
          if (env.getPreviewDestIndex() !== centerIdx) {
            env.setPreviewDestination(centerIdx);
            env.draw();
          }
          env.setMtDidMove(true);
        }
        return;
      }

      if (env.getPaused()) return;
      if (!env.getMultiSel().length) return;
      env.setLastPointerType(evt.pointerType || env.getLastPointerType());
      if (env.getLastPointerType() !== "mouse") return;

      const pt = env.canvasToLocalCoords(evt);
      const idx = env.tileIndexFromCanvas(pt.x, pt.y);
      if (idx == null) return;
      if (env.getPreviewDestIndex() !== idx) {
        env.setPreviewDestination(idx);
        env.draw();
      }
    }

    function handlePointerLeave(){
      if (completionBlocksInput()) return;
      if (env.getPaused()) return;
      if (env.getLastPointerType() === "mouse") {
        env.clearPreview();
        env.draw();
      }
    }

    function finishTouchSequence(e, applyMove){
      try { env.getCanvas().releasePointerCapture(e.pointerId); } catch(err) {}
      env.getActivePointers().delete(e.pointerId);
      if (completionBlocksInput()) {
        env.setMtActive(false);
        env.setMtDidMove(false);
        env.clearPreview();
        env.draw();
        return;
      }
      if (env.getMtActive() && env.getActivePointers().size < 2) {
        if (applyMove && !env.getPaused() && env.getMultiSel().length && env.getMtDidMove() && env.getPreviewDestIndex() != null && env.getPreviewValid()) {
          env.applyGroupMove(env.getPreviewDestIndex());
        } else {
          env.clearPreview();
          env.draw();
        }
        env.setMtActive(false);
        env.setMtDidMove(false);
      }
    }

    function handlePointerUp(e){
      if ((e.pointerType || "") === "touch") finishTouchSequence(e, true);
    }

    function handlePointerCancel(e){
      if ((e.pointerType || "") === "touch") finishTouchSequence(e, false);
    }

    function handleClick(evt){
      if (env.getSuppressNextClick()) {
        env.setSuppressNextClick(false);
        return;
      }

      const img = env.getImg();
      if (!img.complete || img.naturalWidth === 0) return;
      if (completionBlocksInput()) return;
      if (env.isModalOpen()) return;
      if (env.getPaused()) return;

      const pt = env.canvasToLocalCoords(evt);
      const idx = env.tileIndexFromCanvas(pt.x, pt.y);
      if (idx == null) return;
      if (env.getLocked()[idx]) return;

      if (!env.isRunning() && env.getElapsedMs() === 0) env.startTimer();

      if (evt.shiftKey) {
        env.toggleMultiSel(idx);
        env.draw();
        return;
      }

      if (env.getMultiSel().length >= 1) {
        if (env.getLastPointerType() !== "mouse") {
          if (env.getPreviewDestIndex() !== idx || !env.getPreviewValid()) {
            env.setPreviewDestination(idx);
            env.draw();
            return;
          }
          env.applyGroupMove(idx);
          return;
        }
        env.applyGroupMove(idx);
        return;
      }

      if (env.getSelected() == null) {
        env.setSelected(idx);
        env.draw();
        return;
      }
      if (env.getSelected() === idx) {
        env.setSelected(null);
        env.draw();
        return;
      }
      if (env.getLocked()[env.getSelected()] || env.getLocked()[idx]) {
        env.setSelected(null);
        env.draw();
        return;
      }

      const selected = env.getSelected();
      const tiles = env.getTiles();
      const oldTiles = tiles.slice();
      const correctBefore = env.countCorrect();

      const temp = tiles[selected];
      tiles[selected] = tiles[idx];
      tiles[idx] = temp;
      env.setMovesMade(env.getMovesMade() + 1);
      env.maybeTriggerFX(oldTiles, tiles, new Set([selected, idx]));
      env.setSelected(null);

      const correctAfter = env.countCorrect();
      const newlyCorrect = Math.max(0, correctAfter - correctBefore);
      if (newlyCorrect > 0) env.awardMovePoints(newlyCorrect);
      else env.setStreak(0);

      env.updateStats();
      env.draw();
      env.markProgressDirty();
      if (env.isSolved()) env.finishGame();
    }

    return {
      handlePointerDown,
      handlePointerMove,
      handlePointerLeave,
      handlePointerUp,
      handlePointerCancel,
      handleClick,
    };
  }

  global.SnapshiftGameInput = {
    create: createGameInputHelpers,
  };
})(window);
