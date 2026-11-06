(function(global){
  function createGameRenderHelpers(env){
    function resizeCanvasToFit(){
      const canvas = env.getCanvas();
      const wrapEl = document.querySelector("#gameScreen .canvasWrap") || env.getBoardCard();
      const wrapRect = wrapEl.getBoundingClientRect();
      const wrapStyle = getComputedStyle(wrapEl);
      const padX = parseFloat(wrapStyle.paddingLeft || "0") + parseFloat(wrapStyle.paddingRight || "0");
      const padY = parseFloat(wrapStyle.paddingTop || "0") + parseFloat(wrapStyle.paddingBottom || "0");

      const availW = Math.max(240, Math.floor(wrapRect.width - padX));
      const availH = Math.max(240, Math.floor(wrapRect.height - padY));
      const aspect = env.getCols() / env.getRows();

      let cssW = availW;
      let cssH = Math.floor(cssW / aspect);
      if (cssH > availH) {
        cssH = availH;
        cssW = Math.floor(cssH * aspect);
      }

      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const bufW = Math.floor(cssW * dpr);
      const bufH = Math.floor(cssH * dpr);

      if (canvas.width !== bufW || canvas.height !== bufH) {
        canvas.width = bufW;
        canvas.height = bufH;
      }
    }

    function tileIndexFromCanvas(x, y){
      const canvas = env.getCanvas();
      const tileW = canvas.width / env.getCols();
      const tileH = canvas.height / env.getRows();
      const col = Math.floor(x / tileW);
      const row = Math.floor(y / tileH);
      if (col < 0 || row < 0 || col >= env.getCols() || row >= env.getRows()) return null;
      return env.rcToIndex(row, col);
    }

    function canvasToLocalCoords(evt){
      const canvas = env.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const x = (evt.clientX - rect.left) * (canvas.width / rect.width);
      const y = (evt.clientY - rect.top) * (canvas.height / rect.height);
      return { x, y };
    }

    function spawnCorrectFX(posIndex){
      if (!env.fxEnabledEffective()) return;
      const now = performance.now();
      const sparks = [];
      for (let s = 0; s < env.getCorrectFxSparks(); s++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.55 + Math.random() * 0.75;
        const len = 0.45 + Math.random() * 0.65;
        const wob = (Math.random() - 0.5) * 0.35;
        sparks.push({ ang, spd, len, wob });
      }
      env.getCorrectFx().set(posIndex, { start: now, end: now + env.getCorrectFxMs(), sparks });
    }

    function maybeTriggerFX(oldTiles, newTiles, indicesToCheck){
      if (!env.fxEnabledEffective()) return;
      for (const idx of indicesToCheck) {
        if (oldTiles[idx] !== idx && newTiles[idx] === idx) spawnCorrectFX(idx);
      }
    }

    function drawCorrectFX(i, dx, dy, tileW, tileH, now){
      if (env.isDailyRoute()) return;
      if (!env.fxEnabledEffective()) return;
      const correctFx = env.getCorrectFx();
      const fx = correctFx.get(i);
      if (!fx) return;
      if (now >= fx.end) { correctFx.delete(i); return; }

      const dur = fx.end - fx.start;
      const t = (now - fx.start) / dur;
      const easeOut = 1 - Math.pow(1 - t, 3);
      const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 2);

      const cx = dx + tileW / 2;
      const cy = dy + tileH / 2;
      const r = Math.min(tileW, tileH) * (0.22 + 0.35 * easeOut);
      const ctx = env.getCtx();

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 2.2);
      g.addColorStop(0, `rgba(124,255,178,${env.getCorrectFxGlow() * (1 - t)})`);
      g.addColorStop(1, "rgba(124,255,178,0)");
      ctx.fillStyle = g;
      ctx.fillRect(dx, dy, tileW, tileH);

      ctx.globalAlpha = (1 - t) * 0.95;
      ctx.strokeStyle = "rgba(124,255,178,1)";
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(tileW, tileH) * (0.02 + 0.02 * pulse)));
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1.05 + 0.25 * pulse), 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = (1 - t) * 0.95;
      ctx.lineWidth = Math.max(1, Math.floor(Math.min(tileW, tileH) * 0.012));
      ctx.strokeStyle = "rgba(180,255,214,1)";
      for (const s of fx.sparks) {
        const ang = s.ang + s.wob * Math.sin(t * Math.PI * 2);
        const dist = (r * 1.6) * t * s.spd;
        const x1 = cx + Math.cos(ang) * dist;
        const y1 = cy + Math.sin(ang) * dist;
        const x2 = cx + Math.cos(ang) * (dist + r * 0.65 * s.len);
        const y2 = cy + Math.sin(ang) * (dist + r * 0.65 * s.len);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      ctx.restore();
    }

    return {
      resizeCanvasToFit,
      tileIndexFromCanvas,
      canvasToLocalCoords,
      spawnCorrectFX,
      maybeTriggerFX,
      drawCorrectFX,
    };
  }

  global.SnapshiftGameRenderHelpers = {
    create: createGameRenderHelpers,
  };
})(window);
