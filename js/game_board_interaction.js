(function(global){
  function createGameBoardInteractionHelpers(env){
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
      }catch(e){}

      try{ if (env.updateStats) env.updateStats(); }catch(e){}
      try{ if (env.draw) env.draw(); }catch(e){}
      return false;
    }

    function clearPreview(){
      env.setPreviewDestIndex(null);
      env.setPreviewTargetIdxs(null);
      env.setPreviewValid(false);
    }

    function clearSelection(){
      env.setSelected(null);
      env.setMultiSel([]);
      env.setSrcRelOrder([]);
      clearPreview();
    }

    function drawPreviewOutline(tileW, tileH){
      const multiSel = env.getMultiSel();
      const previewDestIndex = env.getPreviewDestIndex();
      const previewTargetIdxs = env.getPreviewTargetIdxs();
      if (!multiSel.length || previewDestIndex == null || !previewTargetIdxs) return;

      const ctx = env.getCtx();
      ctx.save();
      ctx.setLineDash([
        Math.max(4, Math.floor(Math.min(tileW, tileH) * 0.18)),
        Math.max(4, Math.floor(Math.min(tileW, tileH) * 0.12))
      ]);

      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = env.getPreviewValid() ? "#E8EEF7" : "#ff7c9a";
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(tileW, tileH) * 0.03));

      for (const idx of previewTargetIdxs) {
        const d = env.indexToRC(idx);
        const dx = d.c * tileW;
        const dy = d.r * tileH;
        ctx.strokeRect(dx + 3, dy + 3, tileW - 6, tileH - 6);
      }
      ctx.restore();
    }

    function computeRelFromSelection(sel){
      let minR = Infinity, minC = Infinity;
      const coords = sel.map(i => env.indexToRC(i));
      for (const p of coords){
        if (p.r < minR) minR = p.r;
        if (p.c < minC) minC = p.c;
      }
      const rel = coords.map((p, k) => ({ idx: sel[k], dr: p.r - minR, dc: p.c - minC }));
      rel.sort((a, b) => (a.dr - b.dr) || (a.dc - b.dc));
      return rel;
    }

    function computeTargetsFromAnchor(anchorIndex, relSorted){
      const anchor = env.indexToRC(anchorIndex);
      const targets = [];
      for (const r of relSorted) {
        const rr = anchor.r + r.dr;
        const cc = anchor.c + r.dc;
        if (rr < 0 || cc < 0 || rr >= env.getRows() || cc >= env.getCols()) return null;
        targets.push(env.rcToIndex(rr, cc));
      }
      return targets;
    }

    function applyTrueMoveGroup(oldTiles, sourceOrdered, targetOrdered){
      const setS = new Set(sourceOrdered);
      const setT = new Set(targetOrdered);

      const holes = sourceOrdered.filter(s => !setT.has(s));
      const displaced = targetOrdered.filter(t => !setS.has(t));
      if (holes.length !== displaced.length) return null;

      const newTiles = oldTiles.slice();
      for (let k = 0; k < sourceOrdered.length; k++) {
        newTiles[targetOrdered[k]] = oldTiles[sourceOrdered[k]];
      }
      for (let i = 0; i < holes.length; i++) {
        newTiles[holes[i]] = oldTiles[displaced[i]];
      }
      return newTiles;
    }

    function toggleMultiSel(i){
      if (completionBlocksInput()) return;
      if (env.isLockedPos(i)) return;

      const selected = env.getSelected();
      const multiSel = env.getMultiSel().slice();
      if (selected !== null && multiSel.length === 0) {
        multiSel.push(selected);
        env.setSelected(null);
      }
      const idx = multiSel.indexOf(i);
      if (idx >= 0) multiSel.splice(idx, 1);
      else multiSel.push(i);

      env.setMultiSel(multiSel);
      env.setSrcRelOrder(multiSel.length ? computeRelFromSelection(multiSel) : []);
      clearPreview();
      try{ env.updateShiftUi(); }catch(e){}
    }

    function computeGroupTargets(anchorIndex){
      const multiSel = env.getMultiSel();
      if (!multiSel.length) return { valid:false, targetIdxs:null, sourceIdxs:null };

      for (const s of multiSel) if (env.isLockedPos(s)) return { valid:false, targetIdxs:null, sourceIdxs:null };

      const srcRelOrder = env.getSrcRelOrder();
      const relSorted = srcRelOrder.length ? srcRelOrder : computeRelFromSelection(multiSel);
      const targetIdxs = computeTargetsFromAnchor(anchorIndex, relSorted);
      if (!targetIdxs) return { valid:false, targetIdxs:null, sourceIdxs:null };

      for (const t of targetIdxs) if (env.isLockedPos(t)) return { valid:false, targetIdxs:null, sourceIdxs:null };

      const sourceIdxs = relSorted.map(r => r.idx);
      return { valid:true, targetIdxs, sourceIdxs };
    }

    function setPreviewDestination(anchorIndex){
      if (completionBlocksInput()) { clearPreview(); return; }
      if (!env.getMultiSel().length) { clearPreview(); return; }
      env.setPreviewDestIndex(anchorIndex);
      const result = computeGroupTargets(anchorIndex);
      env.setPreviewValid(result.valid);
      env.setPreviewTargetIdxs(result.targetIdxs);
    }

    function applyGroupMove(anchorIndex){
      if (completionBlocksInput()) return;
      const result = computeGroupTargets(anchorIndex);
      if (!result.valid || !result.targetIdxs || !result.sourceIdxs) {
        setPreviewDestination(anchorIndex);
        env.draw();
        return;
      }

      const correctBefore = env.countCorrect();
      const oldTiles = env.getTiles().slice();
      const newTiles = applyTrueMoveGroup(oldTiles, result.sourceIdxs, result.targetIdxs);
      if (!newTiles) {
        clearPreview();
        env.draw();
        return;
      }

      const affected = new Set([...result.sourceIdxs, ...result.targetIdxs]);
      env.maybeTriggerFX(oldTiles, newTiles, affected);
      env.setTiles(newTiles);
      env.setMovesMade(env.getMovesMade() + 1);

      const correctAfter = env.countCorrect();
      const newlyCorrect = Math.max(0, correctAfter - correctBefore);
      if (newlyCorrect > 0) env.awardMovePoints(newlyCorrect);
      else env.setStreak(0);

      clearSelection();
      env.updateStats();
      env.draw();
      env.markProgressDirty();
      if (env.isSolved()) env.finishGame();
    }

    return {
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
    };
  }

  global.SnapshiftGameBoardInteraction = {
    create: createGameBoardInteractionHelpers,
  };
})(window);
