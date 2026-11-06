(function(global){
  function createGamePointsHelpers(env){
    const getPoints = typeof env.getPoints === "function" ? env.getPoints : function(){ return 0; };
    const setPoints = typeof env.setPoints === "function" ? env.setPoints : function(){};
    const updateStats = typeof env.updateStats === "function" ? env.updateStats : function(){};
    const draw = typeof env.draw === "function" ? env.draw : function(){};

    async function fetchServerPoints(){
      try{
        const r = await fetch("/api/points_get.php", { credentials:"include", cache:"no-store" });
        const j = await r.json().catch(() => null);
        if (j && j.ok && j.loggedIn) return Number(j.points) || 0;
        return 0;
      }catch(e){
        return null;
      }
    }

    function savePoints(){
      // Compatibility no-op: points are server-authoritative in game.
      return;
    }

    function saveCurrentPuzzle(){
      // Compatibility no-op: unfinished puzzle progress now uses the server save path.
      return;
    }

    function applySyncedPoints(nextPoints, opts){
      const config = opts && typeof opts === "object" ? opts : {};
      if (typeof nextPoints !== "number") return null;
      setPoints(nextPoints);
      const shouldDraw = config.draw !== false;
      try{ savePoints(); }catch(e){}
      try{ updateStats(); }catch(e){}
      if (shouldDraw) {
        try{ draw(); }catch(e){}
      }
      return getPoints();
    }

    async function syncPointsFromServer(opts){
      const nextPoints = await fetchServerPoints();
      if (nextPoints === null) return null;
      return applySyncedPoints(nextPoints, opts);
    }

    return {
      fetchServerPoints,
      applySyncedPoints,
      syncPointsFromServer,
      savePoints,
      saveCurrentPuzzle,
    };
  }

  global.SnapshiftGamePoints = {
    create: createGamePointsHelpers,
  };
})(window);
