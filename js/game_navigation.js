(function(global){
  function createGameNavigationHelpers(env){
    function renderLanding(){
      var refs = env.refs;
      var landingGrid = refs.getLandingGridEl();
      var landingSearch = refs.getLandingSearchEl();
      var landingLast = refs.getLandingLastEl();
      var globalPointsPill = refs.getGlobalPointsPillEl();
      if (!landingGrid || !landingSearch || !landingLast || !globalPointsPill) return;

      landingGrid.innerHTML = "";
      var q = String(landingSearch.value || "").trim().toLowerCase();
      var last = env.lsGet(env.getLastCatKey());
      landingLast.textContent = "Last: " + (last || "-");
      globalPointsPill.textContent = "Points: " + env.getPoints();

      env.getCategories().forEach(function(c){
        if (q && !(c.name.toLowerCase().includes(q) || c.id.includes(q) || c.desc.toLowerCase().includes(q))) return;

        var puzzles = env.getPuzzleCatalog()[c.id] || [];
        var el = document.createElement("div");
        el.className = "catCard";
        el.innerHTML =
          '<div class="catTile">' +
            '<img src="' + c.tile + '" alt="' + c.name + '">' +
          "</div>" +
          '<div class="catMeta">' +
            '<span class="metaTag">' + puzzles.length + " puzzles</span>" +
            (last === c.id ? '<span class="metaTag">last played</span>' : "") +
          "</div>";

        var imgEl = el.querySelector("img");
        if (imgEl) {
          imgEl.addEventListener("error", function(){
            var tile = el.querySelector(".catTile");
            if (!tile) return;
            tile.innerHTML =
              '<div style="' +
                "width:100%;height:100%;" +
                "display:flex;align-items:center;justify-content:center;" +
                "font-weight:950;font-size:16px;" +
                "letter-spacing:.2px;" +
                "background: rgba(0,0,0,.25);" +
                "color:#e8eef7;" +
              '">' + c.name + "</div>";
          });
        }

        el.addEventListener("click", function(){ env.openCategory(c.id); });
        landingGrid.appendChild(el);
      });
    }

    function showLanding(){
      var refs = env.refs;
      try{ env.persistProgressNow({ force: true }); }catch(e){}
      env.stopTimer();
      env.setPausedState(false);
      env.closeResumePrompt(null);
      refs.getPauseOverlayEl().classList.remove("show");
      refs.getModalEl().classList.remove("show");
      refs.getHelpPanelEl().style.display = "none";
      env.clearSelection();

      refs.getLandingScreenEl().classList.remove("hidden");
      refs.getGameScreenEl().classList.add("hidden");
      renderLanding();
      env.clearRoutePreload();
    }

    function dailyPuzzleNameFromSrc(src){
      try{
        var clean = String(src || "").split("?")[0].split("#")[0];
        var file = clean.split("/").pop() || "";
        var decoded = env.decodeMaybeTwice(file);
        return decoded.replace(/\.[^.]+$/, "") || "Daily Puzzle";
      }catch(e){}
      return "Daily Puzzle";
    }

    function openDailyRoute(route){
      var routeObj = route || {};
      var routeSrc = routeObj.src ? env.decodeMaybeTwice(String(routeObj.src)) : "";
      var routePuzzle = routeObj.puzzle ? String(routeObj.puzzle) : "";
      if (!routeSrc) return false;

      env.setCategoryId("daily");
      env.setCategoryName("Daily Challenge");
      env.setPuzzles([{
        name: routePuzzle || dailyPuzzleNameFromSrc(routeSrc),
        src: routeSrc
      }]);
      env.setCurrentPuzzleIdx(0);
      env.setUnlockedCount(1);

      try{ env.loadCategoryProgress(); }catch(e){}
      env.applyDailyUiLocks();

      env.refs.getLandingScreenEl().classList.add("hidden");
      env.refs.getGameScreenEl().classList.remove("hidden");

      env.closeResumePrompt(null);
      try{ env.setDifficulty("hard"); }catch(e){}
      env.rebuildPuzzleDropdown();
      env.loadPuzzleImage(0);
      env.updateStats();
      env.draw();
      env.clearRoutePreload();
      return true;
    }

    function redirectLockedPuzzleRequest(meta){
      var data = meta || {};
      var catId = env.normalizeCatId(data.categoryId || env.getCategoryId() || "");
      var puzzleName = String(data.puzzleName || data.requestedPuzzle || "This puzzle").trim() || "This puzzle";
      var message = puzzleName + " is still locked. Unlock it from the category page first.";
      try{ global.alert(message); }catch(e){}
      var target = "";
      try{
        var ref = String(document.referrer || "").trim();
        if (ref){
          var u = new URL(ref, global.location.href);
          if (u.origin === global.location.origin && !/\/game\.html$/i.test(u.pathname)) target = u.href;
        }
      }catch(e){}
      if (!target) target = catId ? "/category.html?cat=" + encodeURIComponent(catId) : "/index.html";
      try{ global.location.href = target; }catch(e){
        try{ global.location.assign(target); }catch(err){}
      }
      return false;
    }

    function openCategory(catId, opts){
      var options = opts || {};
      var normalizedCat = env.normalizeCatId(catId) || catId;
      var c = env.getCategories().find(function(item){ return item.id === normalizedCat; }) || env.getCategories()[0];
      env.setCategoryId(c.id);
      env.setCategoryName(c.name);

      var routeSrc = options.src ? String(options.src) : "";
      var routePuzzle = options.puzzle ? String(options.puzzle) : "";
      var list = env.getPuzzleCatalog()[env.getCategoryId()] || [];
      var effectiveList = list;
      if (!effectiveList.length) effectiveList = env.firstNonEmptyList(env.getPuzzleIndexMeta()) || [];
      env.setPuzzles(effectiveList.length ? effectiveList : [{ name: "No Puzzles Found", src: "" }]);

      env.loadCategoryProgress();

      var requestedIdx = -1;
      var requestedLocked = false;

      if (routeSrc) {
        var routeSrcDecoded = env.decodeMaybeTwice(routeSrc);
        var targetVariants = new Set(env.safeDecodePathVariants(routeSrcDecoded));
        var directIdx = env.getPuzzles().findIndex(function(p){
          return env.safeDecodePathVariants(p && p.src ? p.src : "").some(function(v){ return targetVariants.has(v); });
        });
        if (directIdx >= 0) requestedIdx = directIdx;
      }

      if (requestedIdx < 0 && routePuzzle) {
        var wanted = routePuzzle.trim().toLowerCase();
        if (wanted) {
          var byName = env.getPuzzles().findIndex(function(p){
            return String((p && p.name) || "").trim().toLowerCase() === wanted;
          });
          if (byName >= 0) requestedIdx = byName;
        }
      }

      if (requestedIdx >= 0) {
        if (env.isPuzzleUnlockedIndex(requestedIdx)) {
          env.setCurrentPuzzleIdx(requestedIdx);
          env.saveCurrentPuzzle();
        } else {
          requestedLocked = true;
        }
      }

      if (requestedLocked) {
        var requestedPuzzle = env.getPuzzles()[requestedIdx] || null;
        return redirectLockedPuzzleRequest({
          categoryId: env.getCategoryId(),
          puzzleName: requestedPuzzle && requestedPuzzle.name ? requestedPuzzle.name : routePuzzle,
          requestedPuzzle: routePuzzle,
          requestedSrc: routeSrc
        });
      }

      if (!env.isPuzzleUnlockedIndex(env.getCurrentPuzzleIdx())) {
        env.setCurrentPuzzleIdx(env.getFirstUnlockedIndex());
      }

      env.applyDailyUiLocks();

      env.refs.getLandingScreenEl().classList.add("hidden");
      env.refs.getGameScreenEl().classList.remove("hidden");

      env.closeResumePrompt(null);
      env.setDifficulty(env.getDifficultyControlValue());
      env.rebuildPuzzleDropdown();
      env.loadPuzzleImage(env.getCurrentPuzzleIdx());
      env.updateStats();
      env.draw();
      env.clearRoutePreload();
      return true;
    }

    return {
      renderLanding: renderLanding,
      showLanding: showLanding,
      dailyPuzzleNameFromSrc: dailyPuzzleNameFromSrc,
      openDailyRoute: openDailyRoute,
      redirectLockedPuzzleRequest: redirectLockedPuzzleRequest,
      openCategory: openCategory,
    };
  }

  global.SnapshiftGameNavigation = {
    create: createGameNavigationHelpers,
  };
})(window);
