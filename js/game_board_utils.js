(function(global){
  function createGameBoardUtils(env){
    function setDifficulty(key){
      const difficulties = env.getDifficulties();
      const picked = difficulties[key] || difficulties.easy;
      env.setDiffKey(key);
      env.setRows(picked.rows);
      env.setCols(picked.cols);
    }

    function totalTiles(){
      return env.getRows() * env.getCols();
    }

    function indexToRC(index){
      return { r: Math.floor(index / env.getCols()), c: index % env.getCols() };
    }

    function rcToIndex(r, c){
      return r * env.getCols() + c;
    }

    function fmtTime(ms){
      const total = Math.max(0, ms);
      const minutes = Math.floor(total / 60000);
      const seconds = Math.floor((total % 60000) / 1000);
      const tenths = Math.floor((total % 1000) / 100);
      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
    }

    function bestKey(){
      return `${env.getCategoryId()}_${env.getDiffKey()}_${env.getRows()}x${env.getCols()}_p${env.getCurrentPuzzleIdx()}`;
    }

    function getBestMs(){
      const value = env.lsGet(env.getBestKeyPrefix() + bestKey());
      return value ? Number(value) : null;
    }

    function setBestMs(ms){
      env.lsSet(env.getBestKeyPrefix() + bestKey(), String(ms));
    }

    function isLockedPos(posIndex){
      const locked = env.getLocked();
      return !!locked[posIndex];
    }

    function isSolved(){
      const tiles = env.getTiles();
      if (!Array.isArray(tiles) || tiles.length !== totalTiles()) return false;
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] !== i) return false;
      }
      return true;
    }

    function countCorrect(){
      const tiles = env.getTiles();
      if (!Array.isArray(tiles) || tiles.length !== totalTiles()) return 0;
      let count = 0;
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] === i) count++;
      }
      return count;
    }

    function makeDerangement(n){
      if (n <= 1) return Array.from({ length:n }, (_, i) => i);
      const out = Array.from({ length:n }, (_, i) => i);

      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
        if (out[i] === i) [out[i], out[j]] = [out[j], out[i]];
      }
      if (out[0] === 0) {
        const j = 1 + Math.floor(Math.random() * (n - 1));
        [out[0], out[j]] = [out[j], out[0]];
      }
      for (let i = 0; i < n; i++) {
        if (out[i] === i) {
          const j = (i + 1) % n;
          [out[i], out[j]] = [out[j], out[i]];
        }
      }
      for (let i = 0; i < n; i++) {
        if (out[i] === i) {
          const rotated = out.slice();
          for (let k = 0; k < n; k++) out[k] = rotated[(k + 1) % n];
          break;
        }
      }
      return out;
    }

    return {
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
    };
  }

  global.SnapshiftGameBoardUtils = {
    create: createGameBoardUtils,
  };
})(window);
