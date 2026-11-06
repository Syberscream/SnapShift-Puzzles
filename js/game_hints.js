(function(global){
  function createGameHintsHelpers(env){
    function misplacedPositions(){
      const tiles = env.getTiles();
      const out = [];
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] !== i) out.push(i);
      }
      return out;
    }

    function suggestSwapPair(){
      const tiles = env.getTiles();
      for (let i = 0; i < tiles.length; i++) {
        const ti = tiles[i];
        if (ti !== i) {
          const j = ti;
          if (j >= 0 && j < tiles.length && j !== i && tiles[j] === i) {
            return [i, j];
          }
        }
      }
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] !== i) {
          const j = tiles.indexOf(i);
          if (j >= 0 && j < tiles.length && i !== j) {
            return [i, j];
          }
        }
      }
      return null;
    }

    function canUseDailySwapHint(){
      if (!env.isDailyRoute()) return { ok:false, reason:"not_daily" };
      const now = Date.now();
      const wait = (env.getDailyHintLastAt() + env.getDailyHintCooldownMs()) - now;
      if (wait > 0) return { ok:false, reason:"cooldown", waitMs:wait };
      if (env.getPoints() < env.getDailySwapHintCost()) return { ok:false, reason:"points" };
      const pair = suggestSwapPair();
      if (!pair) return { ok:false, reason:"solved" };
      return { ok:true, pair };
    }

    function swapHintCost(){
      return env.isDailyRoute() ? env.getDailySwapHintCost() : env.getNormalSwapHintCost();
    }

    function canUseSwapHint(){
      const now = Date.now();
      const wait = (env.getDailyHintLastAt() + env.getDailyHintCooldownMs()) - now;
      if (wait > 0) return { ok:false, reason:"cooldown", waitMs:wait };
      const pair = suggestSwapPair();
      if (!pair) return { ok:false, reason:"solved" };
      const cost = swapHintCost();
      if (cost > 0 && env.getPoints() < cost) return { ok:false, reason:"points", cost };
      return { ok:true, pair, cost };
    }

    async function useSwapHint(){
      const chk = canUseSwapHint();
      if (!chk.ok){
        env.updateStats();
        return;
      }
      env.setDailyHintLastAt(Date.now());
      if (chk.cost > 0){
        const ok = await env.spendPoints(-chk.cost);
        if (!ok) return;
      }
      env.setSwapPair(chk.pair);
      env.setSwapHintActiveUntil(Date.now() + 6500);
      try{
        const tiles = env.getTiles();
        const pair = env.getSwapPair();
        const i = pair[0], j = pair[1];
        if (tiles && tiles[i] === j && tiles[j] === i){
          env.setSwapPerfectActiveUntil(Date.now() + 6500);
          try{ env.showPerfectSwapPopMsg("✨ Perfect Swap!", true); }catch(e){}
          env.showPerfectSwapPop();
        }
      }catch(e){}
      env.updateStats();
    }

    async function useDailySwapHint(){
      const chk = canUseDailySwapHint();
      if (!chk.ok){
        env.updateStats();
        return;
      }
      try{ env.showPerfectSwapPopMsg("Swap Hint", false); }catch(e){}
      const ok = await env.spendPoints(-env.getDailySwapHintCost());
      if (!ok) return;
      env.setDailyHintLastAt(Date.now());
      env.setSwapPair(chk.pair);
      env.setSwapHintActiveUntil(env.getDailyHintLastAt() + 2600);
      env.updateStats();
      env.draw();
      setTimeout(() => { try{ env.draw(); }catch(e){} }, 2700);
    }

    function canUseDailyHint(){
      if (!env.isDailyRoute()) return { ok:false, reason:"not_daily" };
      const now = Date.now();
      const wait = (env.getDailyHintLastAt() + env.getDailyHintCooldownMs()) - now;
      if (wait > 0) return { ok:false, reason:"cooldown", waitMs:wait };
      if (env.getPoints() < env.getDailyHintCost()) return { ok:false, reason:"points" };
      return { ok:true };
    }

    async function useDailyHint(){
      const chk = canUseDailyHint();
      if (!chk.ok){
        env.updateStats();
        return;
      }
      const ok = await env.spendPoints(-env.getDailyHintCost());
      if (!ok) return;
      env.setDailyHintLastAt(Date.now());
      env.setHintActiveUntil(env.getDailyHintLastAt() + 2200);
      env.updateStats();
      env.draw();
      setTimeout(() => { try{ env.draw(); }catch(e){} }, 2300);
    }

    return {
      misplacedPositions,
      suggestSwapPair,
      canUseDailySwapHint,
      swapHintCost,
      canUseSwapHint,
      useSwapHint,
      useDailySwapHint,
      canUseDailyHint,
      useDailyHint,
    };
  }

  global.SnapshiftGameHints = {
    create: createGameHintsHelpers,
  };
})(window);
