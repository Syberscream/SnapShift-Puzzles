(function(global){
  function createGameLayoutHelpers(env){
    function applyCompactSidebar(){
      // Keep the ultra-compact label replacement for genuinely small devices only.
      // Wider desktop/tablet landscape viewports should keep the real button labels.
      var onCompact = global.matchMedia("(orientation: landscape) and (max-width: 760px)").matches;
      env.getCompactMap().forEach(function(item){
        var id = item[0];
        var short = item[1];
        var label = item[2];
        var el = document.getElementById(id);
        if (!el) return;
        if (!el.dataset.fullLabel) el.dataset.fullLabel = String(el.textContent || label || "").trim();
        el.dataset.short = short;
        el.classList.toggle("compact-icon-btn", onCompact);
        if (onCompact) {
          if (id === "fsBtn") {
            var isFs = !!document.fullscreenElement;
            el.dataset.short = isFs ? "Minimize" : "Full-screen";
            el.title = isFs ? "Minimize" : "Full-screen";
            el.setAttribute("aria-label", isFs ? "Minimize" : "Full-screen");
          } else if (id === "muteBtn") {
            var isMuted = !!env.getUiMuted();
            el.dataset.short = isMuted ? "Unmute" : "Mute";
            el.title = isMuted ? "Unmute game sounds" : "Mute game sounds";
            el.setAttribute("aria-label", isMuted ? "Unmute game sounds" : "Mute game sounds");
          } else {
            el.title = el.dataset.fullLabel || label;
            el.setAttribute("aria-label", el.dataset.fullLabel || label);
          }
        } else {
          el.removeAttribute("aria-label");
        }
      });
    }

    function hasDirectPuzzleRequest(){
      try{
        var u = new URL(location.href);
        var qs = u.searchParams;
        var hasQueryRoute = !!(
          (qs.get("resume") && String(qs.get("resume")).trim()) ||
          (qs.get("src") && String(qs.get("src")).trim()) ||
          (qs.get("daily") && String(qs.get("daily")).trim()) ||
          ((qs.get("cat") && String(qs.get("cat")).trim()) && (qs.get("puzzle") && String(qs.get("puzzle")).trim()))
        );
        if (hasQueryRoute) return true;

        var h = String(location.hash || "");
        if (h.startsWith("#")) h = h.slice(1);
        if (h.startsWith("!")) h = h.slice(1);
        var hp = new URLSearchParams(h);
        return !!(
          (hp.get("resume") && String(hp.get("resume")).trim()) ||
          (hp.get("src") && String(hp.get("src")).trim()) ||
          (hp.get("daily") && String(hp.get("daily")).trim()) ||
          ((hp.get("cat") && String(hp.get("cat")).trim()) && (hp.get("puzzle") && String(hp.get("puzzle")).trim()))
        );
      }catch(e){}
      return false;
    }

    function syncLandscapeRequirement(){
      var requireLandscape = !!env.getCoarsePhoneMq().matches;
      var gameScreenEl = env.getGameScreenEl();
      var gameVisible = !!(gameScreenEl && !gameScreenEl.classList.contains("hidden"));
      var directRoute = hasDirectPuzzleRequest();
      var shouldBlockPortrait = !!(requireLandscape && env.getPortraitMq().matches && (gameVisible || directRoute));
      document.body.classList.toggle("require-landscape-phone", requireLandscape);
      document.body.classList.toggle("is-portrait-game", shouldBlockPortrait);
      var overlay = document.getElementById("rotateLandscapeOverlay");
      if (overlay) overlay.setAttribute("aria-hidden", shouldBlockPortrait ? "false" : "true");
    }

    function isResponsiveCanvasMode(){
      if (!global.matchMedia("(orientation: landscape)").matches) return false;
      var w = global.visualViewport ? global.visualViewport.width : global.innerWidth;
      var h = global.visualViewport ? global.visualViewport.height : global.innerHeight;
      if (!(w <= 1100)) return false;
      var aspect = w / Math.max(1, h);
      return h <= 560 || aspect >= 1.71;
    }

    function applyResponsiveCanvasSize(){
      var gameScreen = env.getGameScreenEl();
      var canvasWrapEl = env.getCanvasWrapEl();
      var canvas = env.getCanvasEl();
      if (!gameScreen || !canvasWrapEl || !canvas) return;
      if (gameScreen.classList.contains("hidden")) return;
      if (!isResponsiveCanvasMode()) return;

      var wrapRect = canvasWrapEl.getBoundingClientRect();
      if (!wrapRect.width || !wrapRect.height) return;

      var wrapStyle = getComputedStyle(canvasWrapEl);
      var padX = parseFloat(wrapStyle.paddingLeft || "0") + parseFloat(wrapStyle.paddingRight || "0");
      var padY = parseFloat(wrapStyle.paddingTop || "0") + parseFloat(wrapStyle.paddingBottom || "0");
      var cols = Number(env.getCols() || 6);
      var rows = Number(env.getRows() || 4);
      var availW = Math.max(240, Math.floor(wrapRect.width - padX));
      var availH = Math.max(180, Math.floor(wrapRect.height - padY));
      var aspect = cols / rows;

      var cssW = availW;
      var cssH = Math.floor(cssW / aspect);
      if (cssH > availH) {
        cssH = availH;
        cssW = Math.floor(cssH * aspect);
      }

      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";

      var dpr = Math.min(2, global.devicePixelRatio || 1);
      var bufW = Math.floor(cssW * dpr);
      var bufH = Math.floor(cssH * dpr);
      if (canvas.width !== bufW || canvas.height !== bufH) {
        canvas.width = bufW;
        canvas.height = bufH;
      }

      try { env.draw(); } catch(e){}
    }

    function installLayoutRuntime(){
      if (global.__snapshiftLayoutRuntimeInstalled) return;
      global.__snapshiftLayoutRuntimeInstalled = true;

      var raf = 0;
      function scheduleCanvas(){
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function(){
          requestAnimationFrame(applyResponsiveCanvasSize);
        });
      }

      function syncAll(){
        applyCompactSidebar();
        try{ env.updateMuteButton(); }catch(e){}
        syncLandscapeRequirement();
        scheduleCanvas();
      }

      global.addEventListener("resize", syncAll, { passive: true });
      global.addEventListener("orientationchange", function(){ setTimeout(syncAll, 180); }, { passive: true });
      global.addEventListener("pageshow", function(){ setTimeout(syncAll, 60); });
      document.addEventListener("visibilitychange", function(){ if (!document.hidden) setTimeout(syncAll, 60); });
      document.addEventListener("fullscreenchange", function(){ setTimeout(syncAll, 80); });
      if (global.visualViewport) {
        global.visualViewport.addEventListener("resize", scheduleCanvas, { passive: true });
        global.visualViewport.addEventListener("scroll", scheduleCanvas, { passive: true });
      }

      setTimeout(syncAll, 0);
      setTimeout(syncAll, 120);
      setTimeout(syncAll, 240);
      setTimeout(syncAll, 420);
    }

    return {
      applyCompactSidebar: applyCompactSidebar,
      hasDirectPuzzleRequest: hasDirectPuzzleRequest,
      syncLandscapeRequirement: syncLandscapeRequirement,
      isResponsiveCanvasMode: isResponsiveCanvasMode,
      applyResponsiveCanvasSize: applyResponsiveCanvasSize,
      installLayoutRuntime: installLayoutRuntime,
    };
  }

  global.SnapshiftGameLayout = {
    create: createGameLayoutHelpers,
  };
})(window);
