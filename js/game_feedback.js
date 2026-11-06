(function(global){
  function createGameFeedbackHelpers(env){
    const refs = env.refs || {};

    function getRewardPlacementToastEl(){ return refs.getRewardPlacementToastEl ? refs.getRewardPlacementToastEl() : null; }
    function getAccomplishmentToastEl(){ return refs.getAccomplishmentToastEl ? refs.getAccomplishmentToastEl() : null; }
    function getPointsFloatLayerEl(){ return refs.getPointsFloatLayerEl ? refs.getPointsFloatLayerEl() : null; }
    function getMuteBtnEl(){ return refs.getMuteBtnEl ? refs.getMuteBtnEl() : null; }

    let rewardPlacementToastTimer = null;
    let accomplishmentToastTimer = null;

    function showGameRewardPreview(kind){
      const rewardPlacementToastEl = getRewardPlacementToastEl();
      if (!rewardPlacementToastEl) return;
      const copy = {
        pause_hint: {
          title: "Pause menu rewarded hint",
          body: "Planned as an optional Google Ad Manager rewarded placement after 90 seconds or 15 moves. One ad would grant 1 Hint Token, capped at 1 rewarded hint per puzzle."
        },
        finish_points: {
          title: "Completion reward",
          body: "Planned as an optional post-puzzle reward worth +25 Shift Points. It would not change medals, leaderboard position, fastest times, or move-count rankings."
        }
      }[String(kind || "")] || {
        title: "Rewarded placement preview",
        body: "This is a visual placeholder only for now. Connect the actual rewarded ad flow later."
      };

      rewardPlacementToastEl.innerHTML = `<strong>${copy.title}</strong>${copy.body}`;
      rewardPlacementToastEl.classList.add("show");
      clearTimeout(rewardPlacementToastTimer);
      rewardPlacementToastTimer = setTimeout(() => rewardPlacementToastEl.classList.remove("show"), 3600);
    }

    function updateMuteButton(){
      try{
        const muteBtn = getMuteBtnEl();
        if (!muteBtn) return;
        const isMuted = !!env.getUiMuted();
        muteBtn.textContent = isMuted ? "Unmute" : "Mute";
        muteBtn.dataset.short = isMuted ? "Unmute" : "Mute";
        muteBtn.title = isMuted ? "Unmute game sounds" : "Mute game sounds";
        muteBtn.setAttribute("aria-label", isMuted ? "Unmute game sounds" : "Mute game sounds");
      }catch(e){}
    }

    function resolvePointsFloatAnchor(opts = {}){
      try{
        const isPhoneLandscape = window.matchMedia("(max-width: 980px) and (orientation: landscape)").matches;
        const left = Number.isFinite(Number(opts.left)) ? Number(opts.left) : (isPhoneLandscape ? (window.innerWidth - 116) : (window.innerWidth * 0.70));
        const top = Number.isFinite(Number(opts.top)) ? Number(opts.top) : (isPhoneLandscape ? Math.max(104, window.innerHeight * 0.34) : Math.max(120, window.innerHeight * 0.40));
        return { left, top };
      }catch(e){
        return { left: window.innerWidth * 0.70, top: window.innerHeight * 0.40 };
      }
    }

    function spawnPointsFloat(textValue, kind = "points", opts = {}){
      try{
        const pointsFloatLayerEl = getPointsFloatLayerEl();
        if (!pointsFloatLayerEl || !textValue) return;
        const el = document.createElement("div");
        const anchor = resolvePointsFloatAnchor(opts);
        const jitterX = Number(opts.jitterX ?? (Math.random() * 18 - 9));
        const jitterY = Number(opts.jitterY ?? (Math.random() * 12 - 6));
        el.className = "pointsFloat" + (opts.big ? " big" : "");
        el.dataset.kind = String(kind || "points").toLowerCase();
        el.textContent = String(textValue);
        el.style.left = `${Math.round(anchor.left + jitterX)}px`;
        el.style.top = `${Math.round(anchor.top + jitterY)}px`;
        pointsFloatLayerEl.appendChild(el);
        const cleanup = () => { try{ el.remove(); }catch(e){} };
        el.addEventListener("animationend", cleanup, { once:true });
        setTimeout(cleanup, 1200);
      }catch(e){}
    }

    function sumAwardedPoints(awarded){
      try{
        if (!Array.isArray(awarded)) return 0;
        return awarded.reduce((sum, item) => {
          if (!item || typeof item !== "object") return sum;
          const kind = String(item.kind || item.type || item.reward_type || "").toLowerCase();
          const amount = Number(item.amount ?? item.value ?? item.points ?? item.qty ?? 0) || 0;
          if (kind.includes("point") || "points" in item || "amount" in item || "value" in item) return sum + Math.max(0, Math.floor(amount));
          return sum;
        }, 0);
      }catch(e){ return 0; }
    }

    function ensureUiAudio(){
      try{
        if (env.getUiMuted()) return;
        if (!env.getAudioContext()) env.setAudioContext(new (window.AudioContext || window.webkitAudioContext)());
        const audioCtx = env.getAudioContext();
        if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      }catch(e){}
    }

    function playMedalFanfare(medal = "gold", opts = {}){
      try{
        if (env.getUiMuted()) return;
        ensureUiAudio();
        const pqAudioCtx = env.getAudioContext();
        if (!pqAudioCtx) return;
        const key = String(medal || "").toLowerCase();
        const now = pqAudioCtx.currentTime;
        const plans = {
          bronze: { notes:[392.00, 493.88, 587.33], type:"triangle", gain:0.046, step:0.11, tail:0.20 },
          silver: { notes:[523.25, 659.25, 783.99, 659.25], type:"sine", gain:0.050, step:0.095, tail:0.18 },
          gold:   { notes:[659.25, 783.99, 987.77, 1318.51], type:"triangle", gain:0.056, step:0.085, tail:0.18 }
        };
        const plan = plans[key] || plans.gold;
        plan.notes.forEach((freq, i) => {
          const osc = pqAudioCtx.createOscillator();
          const gain = pqAudioCtx.createGain();
          const t = now + (i * plan.step);
          osc.type = plan.type;
          osc.frequency.setValueAtTime(freq, t);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.02, t + plan.tail * 0.6);
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(plan.gain, t + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + plan.tail);
          osc.connect(gain);
          gain.connect(pqAudioCtx.destination);
          osc.start(t);
          osc.stop(t + plan.tail + 0.03);
        });
        if (opts.daily){
          const shimmer = pqAudioCtx.createOscillator();
          const shimmerGain = pqAudioCtx.createGain();
          const st = now + (plan.notes.at(-1) || 880) * 0 + (plan.notes.length * plan.step) + 0.03;
          shimmer.type = "sine";
          shimmer.frequency.setValueAtTime((plan.notes.at(-1) || 880) * 1.25, st);
          shimmerGain.gain.setValueAtTime(0.0001, st);
          shimmerGain.gain.exponentialRampToValueAtTime(0.028, st + 0.015);
          shimmerGain.gain.exponentialRampToValueAtTime(0.0001, st + 0.22);
          shimmer.connect(shimmerGain);
          shimmerGain.connect(pqAudioCtx.destination);
          shimmer.start(st);
          shimmer.stop(st + 0.24);
        }
      }catch(e){}
    }

    function setUiMuted(nextMuted){
      try{
        env.setUiMuted(!!nextMuted);
        const pqAudioCtx = env.getAudioContext();
        try{ localStorage.setItem("pq_ui_muted", env.getUiMuted() ? "1" : "0"); }catch(e){}
        if (env.getUiMuted() && pqAudioCtx && pqAudioCtx.state === "running") {
          pqAudioCtx.suspend().catch(() => {});
        } else if (!env.getUiMuted()) {
          ensureUiAudio();
        }
        updateMuteButton();
        try{ env.applyCompactSidebar(); }catch(e){}
      }catch(e){}
    }

    function showAccomplishmentToast(title, body, kind = "points", duration = 1800){
      try{
        const accomplishmentToastEl = getAccomplishmentToastEl();
        if (!accomplishmentToastEl) return;
        accomplishmentToastEl.dataset.kind = String(kind || "points").toLowerCase();
        accomplishmentToastEl.innerHTML = `<span class="accomplishmentToastTitle">${title}</span><span class="accomplishmentToastBody">${body}</span>`;
        accomplishmentToastEl.classList.add("show");
        clearTimeout(accomplishmentToastTimer);
        accomplishmentToastTimer = setTimeout(() => {
          try{ accomplishmentToastEl.classList.remove("show"); }catch(e){}
        }, Math.max(1200, Math.floor(Number(duration) || 1800)));
      }catch(e){}
    }

    function playCoinCascade(amount = 0, opts = {}){
      try{
        if (env.getUiMuted()) return;
        ensureUiAudio();
        const pqAudioCtx = env.getAudioContext();
        if (!pqAudioCtx) return;
        const now = pqAudioCtx.currentTime;
        const big = !!opts.big;
        const medal = String(opts.medal || "").toLowerCase();
        const steps = medal === "gold" ? 4 : (big ? 3 : 2);
        const base = medal === "gold" ? 740 : medal === "silver" ? 680 : medal === "bronze" ? 620 : (big ? 600 : 520);
        for (let i = 0; i < steps; i++) {
          const osc = pqAudioCtx.createOscillator();
          const gain = pqAudioCtx.createGain();
          osc.type = i === steps - 1 ? "triangle" : "sine";
          const t = now + (i * 0.085);
          const freq = base + (i * 90);
          osc.frequency.setValueAtTime(freq, t);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.08, t + 0.09);
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(big ? 0.08 : 0.05, t + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
          osc.connect(gain);
          gain.connect(pqAudioCtx.destination);
          osc.start(t);
          osc.stop(t + 0.14);
        }
      }catch(e){}
    }

    function triggerDailyCompletionPulse(){
      try{
        [document.getElementById("modal"), document.querySelector(".modalCard"), document.querySelector(".canvasWrap")].forEach((el) => {
          if (!el) return;
          el.classList.remove("dailyCelebratePulse");
          void el.offsetWidth;
          el.classList.add("dailyCelebratePulse");
          setTimeout(() => el.classList.remove("dailyCelebratePulse"), 2600);
        });
      }catch(e){}
    }

    try{
      env.setUiMuted(localStorage.getItem("pq_ui_muted") === "1");
    }catch(e){
      env.setUiMuted(false);
    }

    return {
      showGameRewardPreview,
      updateMuteButton,
      resolvePointsFloatAnchor,
      spawnPointsFloat,
      sumAwardedPoints,
      playMedalFanfare,
      ensureUiAudio,
      setUiMuted,
      showAccomplishmentToast,
      playCoinCascade,
      triggerDailyCompletionPulse,
    };
  }

  global.SnapshiftGameFeedback = {
    create: createGameFeedbackHelpers,
  };
})(window);
