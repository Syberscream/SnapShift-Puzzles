(function(global){
  function createGameStreakHelpers(env){
    var STREAK_EFFECTS = {
      7: {
        eyebrow: "Milestone reached",
        title: "7-Day Streak<br>Unlocked!",
        sub: "A full week of Daily wins. Nice work.",
        medal: "Weekly Warrior Unlocked",
        accent: "#7cc4ff",
        medalFg: "#e8f3ff",
        colors: ["#7cc4ff","#7cffb2","#ffffff","#9ae6ff","#c39bff","#ffd666"]
      },
      14: {
        eyebrow: "Milestone reached",
        title: "14-Day Challenge<br>Complete!",
        sub: "You just locked in a full 14-day Daily streak.",
        medal: "Streak Master Unlocked",
        accent: "#ffd666",
        medalFg: "#fff1b8",
        colors: ["#ffd666","#7cc4ff","#7cffb2","#ff8fc7","#ffffff","#c39bff"]
      },
      30: {
        eyebrow: "Legendary milestone",
        title: "30-Day Streak<br>Legend!",
        sub: "Thirty straight Daily wins. That is elite consistency.",
        medal: "Monthly Legend Unlocked",
        accent: "#c39bff",
        medalFg: "#f1e4ff",
        colors: ["#c39bff","#ffd666","#7cc4ff","#ff8fc7","#ffffff","#7cffb2"]
      }
    };

    function isRecognizedStreakMilestone(milestone){
      var n = Number(milestone || 0);
      return n === 7 || n === 14 || (n >= 30 && n % 30 === 0);
    }

    function streakEffectConfig(milestone){
      var n = Number(milestone || 0);
      if (STREAK_EFFECTS[n]) return STREAK_EFFECTS[n];
      if (n >= 30 && n % 30 === 0) {
        var base = STREAK_EFFECTS[30];
        return {
          eyebrow: "Legendary milestone",
          title: n + "-Day Streak<br>Legend!",
          sub: n + " straight Daily wins. That is elite consistency.",
          medal: n + "-Day Legend Unlocked",
          accent: base.accent,
          medalFg: base.medalFg,
          colors: base.colors
        };
      }
      return STREAK_EFFECTS[14];
    }

    function wasStreakCelebrated(milestone, day){
      try{ return !!day && !!milestone && localStorage.getItem("pq_streak_fx_" + milestone + "_" + day) === "1"; }catch(e){ return false; }
    }

    function markStreakCelebrated(milestone, day){
      try{ if (day && milestone) localStorage.setItem("pq_streak_fx_" + milestone + "_" + day, "1"); }catch(e){}
    }

    function buildStreakOverlay(){
      var overlay = document.getElementById("challengeCelebrateOverlay");
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = "challengeCelebrateOverlay";
      overlay.className = "challengeCelebrateOverlay";
      overlay.innerHTML =
        '<div class="challengeCelebrateBackdrop"></div>' +
        '<div class="challengeCelebrateBurst" id="challengeCelebrateBurst"></div>' +
        '<div class="challengeCelebrateCard">' +
          '<div class="challengeCelebrateEyebrow" id="challengeCelebrateEyebrow"></div>' +
          '<div class="challengeCelebrateTitle" id="challengeCelebrateTitle"></div>' +
          '<div class="challengeCelebrateSub" id="challengeCelebrateSub"></div>' +
          '<div class="challengeCelebrateMedal" id="challengeCelebrateMedal"><span class="challengeCelebrateSpark">&#9733;</span><span id="challengeCelebrateMedalText"></span><span class="challengeCelebrateSpark">&#9733;</span></div>' +
        "</div>";
      document.body.appendChild(overlay);
      return overlay;
    }

    function fillStreakConfetti(container, milestone){
      if (!container) return;
      var cfg = streakEffectConfig(milestone);
      var colors = Array.isArray(cfg.colors) && cfg.colors.length ? cfg.colors : STREAK_EFFECTS[14].colors;
      var html = "";
      for (var i = 0; i < 42; i++) {
        var left = Math.round((i / 41) * 100);
        var dx = Math.round((Math.random() * 46) - 23) + "vw";
        var rot = Math.round((Math.random() * 900) - 450) + "deg";
        var delay = (Math.random() * 0.38).toFixed(2) + "s";
        var dur = (2.2 + Math.random() * 1.05).toFixed(2) + "s";
        var color = colors[i % colors.length];
        var w = 8 + (i % 4);
        var h = 16 + ((i * 3) % 7);
        html += '<span style="left:' + left + '%;--dx:' + dx + ';--rot:' + rot + ';animation-delay:' + delay + ';animation-duration:' + dur + ';background:' + color + ';width:' + w + 'px;height:' + h + 'px;"></span>';
      }
      container.innerHTML = html;
    }

    function launchStreakCelebration(milestone){
      var cfg = streakEffectConfig(milestone);
      var overlay = buildStreakOverlay();
      var card = overlay.querySelector(".challengeCelebrateCard");
      var backdrop = overlay.querySelector(".challengeCelebrateBackdrop");
      var eyebrow = document.getElementById("challengeCelebrateEyebrow");
      var title = document.getElementById("challengeCelebrateTitle");
      var sub = document.getElementById("challengeCelebrateSub");
      var medal = document.getElementById("challengeCelebrateMedal");
      var medalText = document.getElementById("challengeCelebrateMedalText");
      if (eyebrow) eyebrow.textContent = cfg.eyebrow || "Milestone reached";
      if (title) title.innerHTML = cfg.title || "Challenge Complete!";
      if (sub) sub.textContent = cfg.sub || "";
      if (medalText) medalText.textContent = cfg.medal || "Streak Unlocked";
      if (eyebrow) eyebrow.style.color = cfg.accent || "#ffd666";
      if (card) {
        card.style.borderColor = (cfg.accent || "#ffd666") + "66";
        card.style.boxShadow = "0 28px 70px rgba(0,0,0,.48), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 46px " + (cfg.accent || "#ffd666") + "33";
      }
      if (medal) {
        medal.style.color = cfg.medalFg || "#fff1b8";
        medal.style.borderColor = (cfg.accent || "#ffd666") + "59";
      }
      if (backdrop) {
        var accent = cfg.accent || "#ffd666";
        backdrop.style.background = "radial-gradient(circle at center, " + accent + "33 0%, " + accent + "18 18%, rgba(0,0,0,0) 56%), radial-gradient(circle at center, rgba(11,18,32,0.12) 0%, rgba(11,18,32,0.55) 100%)";
      }
      fillStreakConfetti(document.getElementById("challengeCelebrateBurst"), milestone);
      overlay.classList.remove("show");
      void overlay.offsetWidth;
      overlay.classList.add("show");
      [document.getElementById("modal"), document.querySelector(".modalCard"), document.querySelector(".canvasWrap")].forEach(function(el){
        if (!el) return;
        el.classList.remove("dailyCelebratePulse");
        void el.offsetWidth;
        el.classList.add("dailyCelebratePulse");
        setTimeout(function(){ el.classList.remove("dailyCelebratePulse"); }, 2600);
      });
      try{ if (navigator.vibrate) navigator.vibrate([70, 35, 110, 35, 160]); }catch(e){}
      setTimeout(function(){ overlay.classList.remove("show"); }, 3400);
    }

    function maybeCelebrateStreakMilestone(current, lastCompleted, submittedDay){
      var cur = Number(current || 0);
      var last = String(lastCompleted || "");
      var day = String(submittedDay || "");
      if (!isRecognizedStreakMilestone(cur) || !last || !day || last !== day || wasStreakCelebrated(cur, last)) return;
      markStreakCelebrated(cur, last);
      setTimeout(function(){ launchStreakCelebration(cur); }, 220);
      setTimeout(function(){
        try{ env.showAccomplishmentToast("Daily Streak", cur + " days in a row", "streak", 4200); }catch(e){}
        try{ env.spawnPointsFloat(cur + " DAY STREAK", "streak", { big: true }); }catch(e){}
      }, 560);
    }

    function consumeStreakEffectTest(target){
      try{
        var raw = localStorage.getItem("pq_streak_effect_test");
        if (!raw) return 0;
        var j = JSON.parse(raw);
        var milestone = Number((j && j.milestone) || 0);
        if (!isRecognizedStreakMilestone(milestone)) return 0;
        var age = Date.now() - Number((j && j.ts) || 0);
        if (age > 15 * 60 * 1000){
          localStorage.removeItem("pq_streak_effect_test");
          return 0;
        }
        var tgt = String((j && j.target) || "any");
        if (tgt !== "any" && tgt !== target) return 0;
        localStorage.removeItem("pq_streak_effect_test");
        return milestone;
      }catch(e){ return 0; }
    }

    function maybeRunStreakEffectTest(target){
      var milestone = consumeStreakEffectTest(target);
      if (milestone) setTimeout(function(){ launchStreakCelebration(milestone); }, 220);
    }

    function formatStreakRewardToast(awarded){
      var items = Array.isArray(awarded) ? awarded : [];
      if (!items.length) return "Streak reward claimed";
      return items.map(function(item){
        if (item == null) return "";
        if (typeof item === "string") return item;
        var label = String(item.label || item.name || item.reward || item.type || "Reward").trim();
        var points = Math.floor(Number(item.points) || 0);
        if (points > 0) return label + " +" + points;
        return label;
      }).filter(Boolean).join(" • ");
    }

    async function maybeClaimStreakRewards(current, lastCompleted, submittedDay){
      var cur = Number(current || 0);
      var last = String(lastCompleted || "");
      var day = String(submittedDay || "");
      if (cur < 7 || !last || !day || last !== day) return null;
      try{
        var pointsBefore = env.getPoints ? Math.max(0, Math.floor(Number(env.getPoints()) || 0)) : null;
        var r = await fetch("/api/streak_reward_claim.php", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        var j = await r.json().catch(function(){ return null; });
        if (!j || !j.ok) return j;
        if (typeof j.points === "number"){
          env.setPoints(Math.max(0, Math.floor(Number(j.points) || 0)));
          try{ env.savePoints(); }catch(e){}
          try{ env.updateStats(); env.draw(); }catch(e){}
          try{ if (env.maybeShowPointsMilestone) env.maybeShowPointsMilestone(pointsBefore, j.points, { source: "streak" }); }catch(e){}
        }
        if (Array.isArray(j.awarded) && j.awarded.length){
          var rewardMsg = formatStreakRewardToast(j.awarded);
          var rewardPointsTotal = env.sumAwardedPoints(j.awarded);
          env.mgShowToast(rewardMsg, 3600);
          env.showAccomplishmentToast("Streak reward", rewardMsg, "streak", 2600);
          if (rewardPointsTotal > 0) env.spawnPointsFloat("+" + rewardPointsTotal, "streak", { big: true });
          env.playCoinCascade(Math.max(120, rewardPointsTotal), { big: true });
        }
        return j;
      }catch(e){
        return null;
      }
    }

    function installStreakEffects(){
      if (global.__snapshiftStreakEffectsInstalled) return;
      global.__snapshiftStreakEffectsInstalled = true;
      global.addEventListener("pageshow", function(){
        try{ maybeRunStreakEffectTest("game"); }catch(e){}
      });
    }

    return {
      wasStreakCelebrated: wasStreakCelebrated,
      markStreakCelebrated: markStreakCelebrated,
      buildStreakOverlay: buildStreakOverlay,
      fillStreakConfetti: fillStreakConfetti,
      launchStreakCelebration: launchStreakCelebration,
      maybeCelebrateStreakMilestone: maybeCelebrateStreakMilestone,
      consumeStreakEffectTest: consumeStreakEffectTest,
      maybeRunStreakEffectTest: maybeRunStreakEffectTest,
      formatStreakRewardToast: formatStreakRewardToast,
      maybeClaimStreakRewards: maybeClaimStreakRewards,
      installStreakEffects: installStreakEffects
    };
  }

  global.SnapshiftGameStreaks = {
    create: createGameStreakHelpers
  };
})(window);
