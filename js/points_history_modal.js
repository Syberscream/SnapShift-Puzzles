(function(){
  function initPointsHistoryModal() {
    const pointsPill = document.getElementById("pointsPill") || document.getElementById("globalPointsPill");
    if (!pointsPill) return;

    window.__snapshiftPointsHistoryShared = true;

    const endpoint = "/api/points_history.php";
    const reconcileEndpoint = "/api/points_reconcile.php";
    const cache = { ts: 0, data: null };

    if (!document.getElementById("points-history-modal-shared-style")) {
      const style = document.createElement("style");
      style.id = "points-history-modal-shared-style";
      style.textContent = [
        ".points-history-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:99998;padding:12px;}",
        ".points-history-modal.open{display:flex;}",
        ".points-history-backdrop{position:absolute;inset:0;background:rgba(5,10,18,0.82);backdrop-filter:blur(3px);}",
        ".points-history-card{position:relative;width:min(920px,calc(100vw - 24px));max-height:min(88vh,920px);overflow:hidden;border-radius:28px;border:3px solid #ffb84d;background:linear-gradient(180deg,rgba(11,33,83,0.98),rgba(5,12,30,0.98));box-shadow:0 28px 70px rgba(0,0,0,0.5);display:flex;flex-direction:column;color:#fff6dc;}",
        ".points-history-close{position:absolute;top:14px;right:14px;display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:999px;border:1px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.08);color:#fff;font-size:22px;font-weight:900;cursor:pointer;}",
        ".points-history-header{padding:14px 24px 6px;}",
        ".points-history-title{font-size:clamp(22px,3.2vw,34px);font-weight:900;color:#fff6d8;line-height:1.05;margin-bottom:6px;}",
        ".points-history-subtitle{color:rgba(255,245,220,0.88);font-size:12px;line-height:1.3;max-width:760px;}",
        ".points-history-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:4px 24px 8px;}",
        ".points-history-stat{border-radius:16px;border:2px solid rgba(255,190,90,0.65);background:rgba(0,116,217,0.22);padding:8px 11px 8px;}",
        ".points-history-stat-label{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,245,220,0.78);margin-bottom:6px;}",
        ".points-history-stat-value{font-size:clamp(18px,2.1vw,26px);line-height:1;font-weight:900;color:#fff2c4;}",
        ".points-history-stat-sub{margin-top:4px;font-size:10px;line-height:1.25;color:rgba(255,245,220,0.76);}",
        ".points-history-status{padding:0 24px 6px;color:rgba(255,245,220,0.86);font-size:12px;min-height:18px;}",
        ".points-history-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:0 24px 8px;flex-wrap:wrap;}",
        ".points-history-actions-copy{color:rgba(255,245,220,0.74);font-size:11px;line-height:1.25;max-width:620px;}",
        ".points-history-action-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 14px;border-radius:999px;border:2px solid rgba(255,190,90,0.65);background:linear-gradient(180deg,rgba(23,126,255,0.92),rgba(13,78,186,0.92));color:#fff6dc;font-weight:900;letter-spacing:.02em;cursor:pointer;box-shadow:0 10px 20px rgba(0,0,0,0.22);}",
        ".points-history-action-btn[disabled]{opacity:.55;cursor:wait;box-shadow:none;}",
        ".points-history-list{overflow:auto;padding:0 24px 24px;}",
        ".points-history-note{margin-bottom:14px;padding:12px 14px;border-radius:16px;border:1px solid rgba(255,190,90,0.45);background:rgba(255,255,255,0.05);color:rgba(255,245,220,0.9);font-size:14px;line-height:1.5;}",
        ".points-history-table{width:100%;border-collapse:separate;border-spacing:0 10px;}",
        ".points-history-table th{text-align:left;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,245,220,0.72);padding:0 12px 2px;}",
        ".points-history-table td{padding:12px;background:rgba(8,121,226,0.15);border-top:1px solid rgba(255,190,90,0.35);border-bottom:1px solid rgba(255,190,90,0.35);color:#fff6dc;font-size:15px;vertical-align:middle;}",
        ".points-history-table td:first-child{border-left:1px solid rgba(255,190,90,0.35);border-radius:14px 0 0 14px;}",
        ".points-history-table td:last-child{border-right:1px solid rgba(255,190,90,0.35);border-radius:0 14px 14px 0;}",
        ".points-history-source{display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:999px;font-weight:900;border:2px solid rgba(255,190,90,0.55);background:rgba(0,0,0,0.22);white-space:nowrap;}",
        ".points-history-source.source-daily-rewards{color:#ffe082;}",
        ".points-history-source.source-puzzle-completions{color:#9fe7ff;}",
        ".points-history-source.source-streak-rewards{color:#d2b6ff;}",
        ".points-history-source.source-supporter-bonuses{color:#96ffbb;}",
        ".points-history-source.source-bonus-rewards{color:#ffcf8a;}",
        ".points-history-source.source-adjustments{color:#ffd6d6;}",
        ".points-history-source.source-legacy-balance{color:#fff0c7;}",
        ".points-history-detail{display:block;font-weight:800;line-height:1.35;}",
        ".points-history-detail-meta{display:block;margin-top:4px;font-size:12px;color:rgba(255,245,220,0.72);line-height:1.35;}",
        ".points-history-points.positive{color:#7ef38f;font-weight:900;}",
        ".points-history-points.negative{color:#ff9c9c;font-weight:900;}",
        ".points-history-empty{padding:18px;border-radius:18px;border:1px solid rgba(255,190,90,0.35);background:rgba(255,255,255,0.05);color:rgba(255,245,220,0.88);}",
        "#pointsPill.points-history-trigger,#globalPointsPill.points-history-trigger{cursor:pointer;}",
        "body.modal-open{overflow:hidden !important;}",
        "@media (max-width:820px){.points-history-summary{grid-template-columns:repeat(2,minmax(0,1fr));}.points-history-card{max-height:min(88vh,920px);}.points-history-table th:nth-child(1),.points-history-table td:nth-child(1){display:none;}}",
        "@media (max-width:560px){.points-history-header,.points-history-summary,.points-history-status,.points-history-list{padding-left:14px;padding-right:14px;}.points-history-summary{grid-template-columns:1fr;}.points-history-table th:nth-child(2),.points-history-table td:nth-child(2){display:none;}}"
      ].join("");
      document.head.appendChild(style);
    }

    let modal = document.getElementById("pointsHistoryModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "pointsHistoryModal";
      document.body.appendChild(modal);
    }
    modal.className = "points-history-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="points-history-backdrop" data-points-history-close="1"></div>' +
      '<div class="points-history-card" role="dialog" aria-modal="true" aria-labelledby="pointsHistoryTitle">' +
        '<button id="pointsHistoryClose" class="points-history-close" type="button" aria-label="Close points breakdown">x</button>' +
        '<div class="points-history-header">' +
          '<div id="pointsHistoryTitle" class="points-history-title">Points Breakdown</div>' +
          '<div class="points-history-subtitle">This view separates your balance into daily rewards, puzzle completions, supporter bonuses, other logged changes, and any remaining balance or spend that has not been itemized yet.</div>' +
        '</div>' +
        '<div id="pointsHistorySummary" class="points-history-summary"></div>' +
        '<div id="pointsHistoryStatus" class="points-history-status"></div>' +
        '<div class="points-history-actions">' +
          '<div class="points-history-actions-copy">If older completed puzzles are missing from this breakdown, run a one-time recovery to reconcile saved completions into your points ledger.</div>' +
          '<button id="pointsHistoryReconcileBtn" class="points-history-action-btn" type="button">Recover Missing Puzzle Points</button>' +
        '</div>' +
        '<div id="pointsHistoryList" class="points-history-list"></div>' +
      '</div>';

    const closeBtn = document.getElementById("pointsHistoryClose");
    const summaryEl = document.getElementById("pointsHistorySummary");
    const statusEl = document.getElementById("pointsHistoryStatus");
    const listEl = document.getElementById("pointsHistoryList");
    const reconcileBtn = document.getElementById("pointsHistoryReconcileBtn");
    if (!modal || !closeBtn || !summaryEl || !statusEl || !listEl || !reconcileBtn) return;

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function signed(value) {
      const num = Number(value || 0);
      return num > 0 ? "+" + num : String(num);
    }

    function formatSignedStat(value) {
      const num = Number(value || 0);
      return num > 0 ? ("+" + num) : String(num);
    }

    function formatDay(dayKey) {
      if (!dayKey) return "-";
      const d = new Date(dayKey + "T00:00:00");
      if (Number.isNaN(d.getTime())) return dayKey;
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }

    function readPointsPillBalance() {
      const match = String(pointsPill && pointsPill.textContent || "").match(/Points:\s*([0-9,]+)/i);
      return match ? (Number(String(match[1] || "0").replace(/,/g, "")) || 0) : 0;
    }

    function historyEntries(data) {
      if (Array.isArray(data && data.entries)) return data.entries;
      if (Array.isArray(data && data.list)) return data.list;
      return [];
    }

    function entrySortValue(entry) {
      if (!entry || typeof entry !== "object") return 0;
      const metaCompletedAt = entry.meta && entry.meta.completed_at ? String(entry.meta.completed_at).trim() : "";
      const explicit = Number(entry && entry.sort_ts || 0) || 0;
      if (explicit > 0) return explicit;
      const raw = String(metaCompletedAt || entry.claimed_at || entry.sort_at || historyDay(entry) || "").trim();
      if (!raw) return 0;
      const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? (raw + "T00:00:00") : raw.replace(" ", "T");
      const ts = Date.parse(normalized);
      return Number.isNaN(ts) ? 0 : ts;
    }

    function entrySortDay(entry) {
      if (!entry || typeof entry !== "object") return "";
      const raw = String(entry.sort_day || historyDay(entry) || "").trim();
      if (!raw) {
        const ts = entrySortValue(entry);
        if (ts > 0) {
          return new Date(ts).toISOString().slice(0, 10);
        }
        return "";
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const ts = Date.parse(raw.replace(" ", "T"));
      return Number.isNaN(ts) ? raw : new Date(ts).toISOString().slice(0, 10);
    }

    function countDailyClaims(entries) {
      return historyEntries({ entries: entries }).filter(function(entry) {
        const type = String(entry && entry.type || "").toLowerCase();
        const label = String(entry && (entry.finish_text || entry.label) || "").toLowerCase();
        return type === "daily_reward" || label.indexOf("daily reward") !== -1;
      }).length;
    }

    function historySourceKey(entry) {
      const type = String(entry && entry.type || "").toLowerCase();
      const label = String(entry && (entry.finish_text || entry.label) || "").toLowerCase();
      if (type === "daily_reward" || label.indexOf("daily reward") !== -1) return "daily_rewards";
      if (type === "daily_puzzle_completion" || type === "puzzle_completion") return "puzzle_completions";
      if (type.indexOf("unlock") !== -1) return "adjustments";
      if (type.indexOf("streak") !== -1) return "streak_rewards";
      if (type.indexOf("supporter") !== -1) return "supporter_bonuses";
      if (type.indexOf("reward") !== -1 || type.indexOf("claim") !== -1 || type.indexOf("bonus") !== -1) return "bonus_rewards";
      return "adjustments";
    }

    function historySourceLabel(sourceKey) {
      if (sourceKey === "daily_rewards") return "Daily reward";
      if (sourceKey === "puzzle_completions") return "Puzzle completion";
      if (sourceKey === "streak_rewards") return "Streak reward";
      if (sourceKey === "supporter_bonuses") return "Supporter bonus";
      if (sourceKey === "bonus_rewards") return "Bonus reward";
      if (sourceKey === "legacy_balance") return "Older balance";
      return "Adjustment";
    }

    function sourceClass(sourceKey) {
      return "source-" + String(sourceKey || "adjustments").replace(/_/g, "-");
    }

    function groupPointsSources(data) {
      const summary = data && data.summary ? data.summary : {};
      const entries = historyEntries(data);
      const grouped = {
        daily_rewards: { points: Number(summary.daily_claimed_points ?? summary.daily_rewards ?? 0) || 0, count: Number(summary.claim_count || 0) || countDailyClaims(entries) || 0 },
        puzzle_completions: { points: 0, count: 0 },
        streak_rewards: { points: 0, count: 0 },
        supporter_bonuses: { points: Number(summary.supporter_bonus_points ?? summary.supporter_bonus ?? 0) || 0, count: 0 },
        bonus_rewards: { points: 0, count: 0 },
        adjustments: { points: 0, count: 0 },
        legacy_balance: { points: 0, count: 0 }
      };

      entries.forEach(function(entry) {
        const sourceKey = historySourceKey(entry);
        if (sourceKey === "daily_rewards") return;
        const bucket = grouped[sourceKey] || grouped.adjustments;
        bucket.points += Number(entry && entry.points || 0) || 0;
        bucket.count += 1;
      });

      const currentBalance = Number(summary.current_points ?? summary.current_balance ?? 0) || readPointsPillBalance() || 0;
      const classifiedTotal = grouped.daily_rewards.points + grouped.puzzle_completions.points + grouped.streak_rewards.points + grouped.supporter_bonuses.points + grouped.bonus_rewards.points + grouped.adjustments.points;
      grouped.legacy_balance.points = currentBalance - classifiedTotal;
      grouped.legacy_balance.count = grouped.legacy_balance.points !== 0 ? 1 : 0;
      if (grouped.supporter_bonuses.points !== 0) {
        grouped.supporter_bonuses.count = Math.max(grouped.supporter_bonuses.count, 1);
      }

      return grouped;
    }

    function renderSummary(data) {
      const summary = data && data.summary ? data.summary : {};
      const entries = historyEntries(data);
      const currentBalance = Number(summary.current_points ?? summary.current_balance ?? 0) || readPointsPillBalance() || 0;
      const grouped = groupPointsSources(data);
      const claimCount = Number(summary.claim_count ?? countDailyClaims(entries) ?? 0);
      const residualPoints = Number(grouped.legacy_balance.points || 0) || 0;
      const residualLabel = residualPoints < 0 ? "Unlogged spend" : (residualPoints > 0 ? "Unlogged balance" : "Residual");
      const residualSub = residualPoints < 0
        ? "Mostly points spent or adjusted outside the itemized history, such as older unlock costs."
        : (residualPoints > 0
          ? "Balance that exists outside the currently itemized point sources."
          : "Your current balance is fully explained by the logged sources above.");
      const stats = [
        { label: "Current balance", value: currentBalance, sub: "All points currently on your account." },
        { label: "Daily rewards", value: grouped.daily_rewards.points, sub: grouped.daily_rewards.count ? (grouped.daily_rewards.count + " claimed leaderboard reward" + (grouped.daily_rewards.count === 1 ? "" : "s") + ".") : "No claimed daily rewards yet." },
        { label: "Puzzle completions", value: formatSignedStat(grouped.puzzle_completions.points), sub: grouped.puzzle_completions.count ? (grouped.puzzle_completions.count + " logged puzzle finish" + (grouped.puzzle_completions.count === 1 ? "" : "es") + ".") : "No logged puzzle completion points yet." },
        { label: "Supporter bonuses", value: formatSignedStat(grouped.supporter_bonuses.points), sub: grouped.supporter_bonuses.points ? "Membership bonuses awarded to this account." : "No supporter bonuses recorded." },
        { label: "Other logged changes", value: formatSignedStat(grouped.streak_rewards.points + grouped.bonus_rewards.points + grouped.adjustments.points), sub: (
            (grouped.streak_rewards.count ? (grouped.streak_rewards.count + " streak reward" + (grouped.streak_rewards.count === 1 ? "" : "s")) : "") +
            (grouped.streak_rewards.count && (grouped.bonus_rewards.count || grouped.adjustments.count) ? " | " : "") +
            (grouped.bonus_rewards.count ? (grouped.bonus_rewards.count + " bonus/reward entr" + (grouped.bonus_rewards.count === 1 ? "y" : "ies")) : "") +
            ((grouped.streak_rewards.count || grouped.bonus_rewards.count) && grouped.adjustments.count ? " | " : "") +
            (grouped.adjustments.count ? (grouped.adjustments.count + " adjustment" + (grouped.adjustments.count === 1 ? "" : "s")) : "")
          ) || "No other logged changes." },
        { label: residualLabel, value: formatSignedStat(grouped.legacy_balance.points), sub: residualSub }
      ];

      summaryEl.innerHTML = stats.map(function(item) {
        return '<div class="points-history-stat">' +
          '<div class="points-history-stat-label">' + escapeHtml(item.label) + '</div>' +
          '<div class="points-history-stat-value">' + escapeHtml(item.value) + '</div>' +
          '<div class="points-history-stat-sub">' + escapeHtml(item.sub) + '</div>' +
        '</div>';
      }).join("");

      if (claimCount > 0 && /No claimed daily rewards yet\./i.test(String(statusEl && statusEl.textContent || ""))) {
        statusEl.textContent = "Showing " + claimCount + " claimed daily reward" + (claimCount === 1 ? "" : "s") + ".";
      }
    }

    function historyDay(entry) {
      if (!entry || typeof entry !== "object") return "";
      if (entry.display_day) return entry.display_day;
      if (entry.day) return entry.day;
      if (entry.reward_day) return entry.reward_day;
      if (entry.meta && entry.meta.day) return entry.meta.day;
      const text = String(entry.finish_text || entry.label || "");
      const match = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
      return match ? match[1] : "";
    }

    function historyMedal(entry) {
      const explicit = String(entry && (entry.medal || entry.medal_text || (entry.meta && entry.meta.medal)) || "").toLowerCase();
      if (explicit) return explicit;
      const rank = Number(entry && (entry.rank || (entry.meta && entry.meta.rank)) || 0);
      if (rank === 1) return "gold";
      if (rank === 2) return "silver";
      if (rank === 3) return "bronze";
      if (String(entry && entry.type || "").toLowerCase() === "daily_reward") return "daily";
      if (String(entry && entry.type || "").toLowerCase() === "supporter_bonus") return "supporter";
      return "adjustment";
    }

    function historyFinishLabel(entry) {
      if (!entry || typeof entry !== "object") return "Balance adjustment";
      if (entry.finish_text) return entry.finish_text;
      if (entry.type === "daily_reward") {
        const day = historyDay(entry);
        return "Daily reward" + (day ? " | " + day : "");
      }
      return entry.label || "Balance adjustment";
    }

    function historyDetailMeta(entry) {
      if (!entry || typeof entry !== "object") return "";
      const parts = [];
      const medal = historyMedal(entry);
      if (medal === "gold" || medal === "silver" || medal === "bronze") {
        parts.push(medal.charAt(0).toUpperCase() + medal.slice(1) + " medal");
      }
      const diffKey = String(entry.diff_key || (entry.meta && entry.meta.diff_key) || "").trim();
      if (diffKey) {
        parts.push(diffKey.charAt(0).toUpperCase() + diffKey.slice(1));
      }
      const day = historyDay(entry);
      if (String(entry && entry.type || "").toLowerCase().indexOf("daily") === -1 && day) {
        parts.push(formatDay(day));
      }
      return parts.join(" | ");
    }

    function renderRows(data) {
      const entries = historyEntries(data).slice().sort(function(a, b) {
        const leftDay = entrySortDay(a);
        const rightDay = entrySortDay(b);
        if (leftDay !== rightDay) return rightDay.localeCompare(leftDay);
        const left = entrySortValue(a);
        const right = entrySortValue(b);
        if (left !== right) return right - left;
        const leftLabel = String(historyFinishLabel(a) || "");
        const rightLabel = String(historyFinishLabel(b) || "");
        return rightLabel.localeCompare(leftLabel);
      });
      const note = data && data.note ? '<div class="points-history-note">' + escapeHtml(data.note) + "</div>" : "";
      if (!entries.length) {
        listEl.innerHTML = note + '<div class="points-history-empty">No itemized point history was found yet for this account.</div>';
        return;
      }
      const rows = entries.map(function(entry) {
        const sourceKey = historySourceKey(entry);
        const sourceLabel = historySourceLabel(sourceKey);
        const label = historyFinishLabel(entry);
        const detailMeta = historyDetailMeta(entry);
        const points = Number(entry && entry.points || 0);
        return "<tr>" +
          "<td>" + escapeHtml(formatDay(historyDay(entry))) + "</td>" +
          '<td><span class="points-history-source ' + sourceClass(sourceKey) + '">' + escapeHtml(sourceLabel) + "</span></td>" +
          '<td><span class="points-history-detail">' + escapeHtml(label) + "</span>" + (detailMeta ? '<span class="points-history-detail-meta">' + escapeHtml(detailMeta) + "</span>" : "") + "</td>" +
          '<td class="points-history-points ' + (points >= 0 ? "positive" : "negative") + '">' + escapeHtml(signed(points)) + "</td>" +
          "</tr>";
      }).join("");

      listEl.innerHTML = note +
        '<table class="points-history-table">' +
          "<thead><tr><th>Day</th><th>Earned from</th><th>Details</th><th>Points</th></tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
        "</table>";
    }

    function setStatus(text) {
      statusEl.textContent = text || "";
    }

    function setPointsPillBalance(value) {
      const num = Math.max(0, Number(value || 0) || 0);
      if (pointsPill) pointsPill.textContent = "Points: " + num.toLocaleString();
      try {
        window.dispatchEvent(new CustomEvent("snapshift:points-updated", { detail: { points: num } }));
      } catch (err) {}
    }

    function openModal() {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
    }

    function closeModal() {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    }

    async function loadPointsHistory(force) {
      const now = Date.now();
      if (!force && cache.data && (now - cache.ts) < 15000) {
        renderSummary(cache.data);
        renderRows(cache.data);
        setStatus("Updated just now.");
        return;
      }

      summaryEl.innerHTML = "";
      listEl.innerHTML = "";
      setStatus("Loading points breakdown...");
      try {
        const res = await fetch(endpoint + "?_=" + now, { credentials: "include", cache: "no-store" });
        const data = await res.json().catch(function(){ return {}; });
        if (!res.ok || !data.ok) {
          throw new Error(data && data.error ? data.error : ("Request failed (" + res.status + ")"));
        }
        if (data.logged_in === false) {
          renderSummary({ summary: { current_points: 0, daily_claimed_points: 0, supporter_bonus_points: 0, other_adjustments: 0 } });
          listEl.innerHTML = '<div class="points-history-empty">Sign in to view your points breakdown.</div>';
          setStatus("");
          return;
        }
        cache.ts = now;
        cache.data = data;
        if (data && data.summary && typeof data.summary.current_points !== "undefined") {
          setPointsPillBalance(data.summary.current_points);
        }
        renderSummary(data);
        renderRows(data);
        const entryCount = historyEntries(data).length;
        const count = data.summary && typeof data.summary.claim_count !== "undefined" ? Number(data.summary.claim_count || 0) : countDailyClaims(historyEntries(data));
        setStatus(entryCount ? ("Showing " + entryCount + " logged point entr" + (entryCount === 1 ? "y" : "ies") + (count ? (" | including " + count + " claimed daily reward" + (count === 1 ? "" : "s")) : "") + ".") : "No point history logged yet.");
      } catch (err) {
        console.error("points_history load failed", err);
        renderSummary({ summary: { current_points: 0, daily_claimed_points: 0, supporter_bonus_points: 0, other_adjustments: 0 } });
        listEl.innerHTML = '<div class="points-history-empty">Could not load the points breakdown right now.</div>';
        setStatus(err && err.message ? err.message : "Unknown error");
      }
    }

    async function reconcileMissingCompletions() {
      reconcileBtn.disabled = true;
      const originalLabel = reconcileBtn.textContent;
      reconcileBtn.textContent = "Recovering...";
      setStatus("Reconciling older completed puzzles...");
      try {
        const res = await fetch(reconcileEndpoint, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recover: true })
        });
        const data = await res.json().catch(function(){ return {}; });
        if (!res.ok || !data.ok) {
          throw new Error(data && (data.error || data.message) ? (data.error || data.message) : ("Request failed (" + res.status + ")"));
        }
        if (typeof data.points !== "undefined") {
          setPointsPillBalance(data.points);
        }
        cache.ts = 0;
        cache.data = null;
        await loadPointsHistory(true);
        setStatus(data && data.message ? data.message : "Reconciliation complete.");
      } catch (err) {
        console.error("points reconcile failed", err);
        setStatus(err && err.message ? err.message : "Could not reconcile missing completions.");
      } finally {
        reconcileBtn.disabled = false;
        reconcileBtn.textContent = originalLabel;
      }
    }

    async function openPointsHistory(force) {
      openModal();
      await loadPointsHistory(!!force);
    }

    pointsPill.classList.add("points-history-trigger");
    pointsPill.setAttribute("role", "button");
    pointsPill.setAttribute("tabindex", "0");
    pointsPill.setAttribute("title", "View points breakdown");
    pointsPill.addEventListener("click", function(){ openPointsHistory(true); });
    pointsPill.addEventListener("keydown", function(event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPointsHistory(true);
      }
    });

    modal.addEventListener("click", function(event) {
      if (event.target === modal || event.target.hasAttribute("data-points-history-close")) {
        closeModal();
      }
    });

    closeBtn.addEventListener("click", closeModal);
    reconcileBtn.addEventListener("click", reconcileMissingCompletions);

    document.addEventListener("keydown", function(event) {
      if (event.key === "Escape" && modal.classList.contains("open")) {
        closeModal();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPointsHistoryModal, { once: true });
  } else {
    initPointsHistoryModal();
  }
})();
