(function(){
  if (window.__snapshiftPointsHistoryShared) return;
  const endpoint = '/api/points_history.php';
  const modal = document.getElementById('pointsHistoryModal');
  const closeBtn = document.getElementById('pointsHistoryClose');
  const summaryEl = document.getElementById('pointsHistorySummary');
  const statusEl = document.getElementById('pointsHistoryStatus');
  const listEl = document.getElementById('pointsHistoryList');
  const pointsPill = document.getElementById('pointsPill');
  if (!modal || !summaryEl || !statusEl || !listEl || !pointsPill) return;

  const cache = { ts: 0, data: null };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function signed(value) {
    const num = Number(value || 0);
    return num > 0 ? '+' + num : String(num);
  }

  function formatDay(dayKey) {
    if (!dayKey) return '—';
    const d = new Date(dayKey + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return dayKey;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function medalClass(medal) {
    if (medal === 'gold' || medal === 'silver' || medal === 'bronze') return 'medal-' + medal;
    return 'medal-none';
  }

  function readPointsPillBalance() {
    const match = String(pointsPill && pointsPill.textContent || '').match(/Points:\s*([0-9,]+)/i);
    return match ? (Number(String(match[1] || '0').replace(/,/g, '')) || 0) : 0;
  }

  function historyEntries(data) {
    if (Array.isArray(data && data.entries)) return data.entries;
    if (Array.isArray(data && data.list)) return data.list;
    return [];
  }

  function countDailyClaims(entries) {
    return historyEntries({ entries }).filter((entry) => {
      const type = String(entry && entry.type || '').toLowerCase();
      const label = String(entry && (entry.finish_text || entry.label) || '').toLowerCase();
      return type === 'daily_reward' || label.includes('daily reward');
    }).length;
  }

  function formatSignedStat(value) {
    const num = Number(value || 0);
    return num > 0 ? ('+' + num) : String(num);
  }

  function historySourceKey(entry) {
    const type = String(entry && entry.type || '').toLowerCase();
    const label = String(entry && (entry.finish_text || entry.label) || '').toLowerCase();
    if (type === 'daily_reward' || label.includes('daily reward')) return 'daily_rewards';
    if (type === 'daily_puzzle_completion' || type === 'puzzle_completion') return 'puzzle_completions';
    if (type.includes('streak')) return 'streak_rewards';
    if (type.includes('supporter')) return 'supporter_bonuses';
    if (type.includes('reward') || type.includes('claim') || type.includes('bonus')) return 'bonus_rewards';
    return 'adjustments';
  }

  function historySourceLabel(sourceKey) {
    if (sourceKey === 'daily_rewards') return 'Daily reward';
    if (sourceKey === 'puzzle_completions') return 'Puzzle completion';
    if (sourceKey === 'streak_rewards') return 'Streak reward';
    if (sourceKey === 'supporter_bonuses') return 'Supporter bonus';
    if (sourceKey === 'bonus_rewards') return 'Bonus reward';
    if (sourceKey === 'legacy_balance') return 'Older balance';
    return 'Adjustment';
  }

  function sourceClass(sourceKey) {
    return 'source-' + String(sourceKey || 'adjustments').replace(/_/g, '-');
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

    entries.forEach((entry) => {
      const sourceKey = historySourceKey(entry);
      if (sourceKey === 'daily_rewards') return;
      const bucket = grouped[sourceKey] || grouped.adjustments;
      bucket.points += Number(entry && entry.points || 0) || 0;
      bucket.count += 1;
    });

    const currentBalance = Number(summary.current_points ?? summary.current_balance ?? 0) || readPointsPillBalance() || 0;
    const classifiedTotal =
      grouped.daily_rewards.points +
      grouped.puzzle_completions.points +
      grouped.streak_rewards.points +
      grouped.supporter_bonuses.points +
      grouped.bonus_rewards.points +
      grouped.adjustments.points;
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
    const stats = [
      { label: 'Current balance', value: currentBalance, sub: 'All points currently on your account.' },
      { label: 'Daily rewards', value: grouped.daily_rewards.points, sub: grouped.daily_rewards.count ? (grouped.daily_rewards.count + ' claimed leaderboard reward' + (grouped.daily_rewards.count === 1 ? '' : 's') + '.') : 'No claimed daily rewards yet.' },
      { label: 'Puzzle completions', value: formatSignedStat(grouped.puzzle_completions.points), sub: grouped.puzzle_completions.count ? (grouped.puzzle_completions.count + ' logged puzzle finish' + (grouped.puzzle_completions.count === 1 ? '' : 'es') + '.') : 'No logged puzzle completion points yet.' },
      { label: 'Supporter bonuses', value: formatSignedStat(grouped.supporter_bonuses.points), sub: grouped.supporter_bonuses.points ? 'Membership bonuses awarded to this account.' : 'No supporter bonuses recorded.' },
      { label: 'Other logged changes', value: formatSignedStat(grouped.streak_rewards.points + grouped.bonus_rewards.points + grouped.adjustments.points), sub: (
          (grouped.streak_rewards.count ? (grouped.streak_rewards.count + ' streak reward' + (grouped.streak_rewards.count === 1 ? '' : 's')) : '') +
          (grouped.streak_rewards.count && (grouped.bonus_rewards.count || grouped.adjustments.count) ? ' • ' : '') +
          (grouped.bonus_rewards.count ? (grouped.bonus_rewards.count + ' bonus/reward entry' + (grouped.bonus_rewards.count === 1 ? '' : 'ies')) : '') +
          ((grouped.streak_rewards.count || grouped.bonus_rewards.count) && grouped.adjustments.count ? ' • ' : '') +
          (grouped.adjustments.count ? (grouped.adjustments.count + ' adjustment' + (grouped.adjustments.count === 1 ? '' : 's')) : '')
        ) || 'No other logged changes.' },
      { label: 'Older balance', value: formatSignedStat(grouped.legacy_balance.points), sub: grouped.legacy_balance.points ? 'Balance that existed before detailed point-source logging was added.' : 'Your current balance is fully explained by the sources above.' }
    ];
    summaryEl.innerHTML = stats.map((item) => (
      '<div class="points-history-stat">' +
        '<div class="points-history-stat-label">' + escapeHtml(item.label) + '</div>' +
        '<div class="points-history-stat-value">' + escapeHtml(item.value) + '</div>' +
        '<div class="points-history-stat-sub">' + escapeHtml(item.sub) + '</div>' +
      '</div>'
    )).join('');
    if (claimCount > 0 && /No claimed daily rewards yet\./i.test(String(statusEl && statusEl.textContent || ''))) {
      statusEl.textContent = 'Showing ' + claimCount + ' claimed daily reward' + (claimCount === 1 ? '' : 's') + '.';
    }
  }

  function historyDay(entry) {
    if (!entry || typeof entry !== 'object') return '';
    if (entry.display_day) return entry.display_day;
    if (entry.day) return entry.day;
    if (entry.reward_day) return entry.reward_day;
    if (entry.meta && entry.meta.day) return entry.meta.day;
    const text = String(entry.finish_text || entry.label || '');
    const match = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    return match ? match[1] : '';
  }

  function historyRank(entry) {
    const rank = Number(entry && (entry.rank || (entry.meta && entry.meta.rank)) || 0);
    if (rank === 1) return '1st';
    if (rank === 2) return '2nd';
    if (rank === 3) return '3rd';
    return rank > 0 ? ('#' + rank) : '';
  }

  function historyMedal(entry) {
    const explicit = String(entry && (entry.medal || entry.medal_text || (entry.meta && entry.meta.medal)) || '').toLowerCase();
    if (explicit) return explicit;
    const rank = Number(entry && (entry.rank || (entry.meta && entry.meta.rank)) || 0);
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    if (String(entry && entry.type || '').toLowerCase() === 'daily_reward') return 'daily';
    if (String(entry && entry.type || '').toLowerCase() === 'supporter_bonus') return 'supporter';
    return 'adjustment';
  }

  function historyFinishLabel(entry) {
    if (!entry || typeof entry !== 'object') return 'Balance adjustment';
    if (entry.finish_text) return entry.finish_text;
    if (entry.type === 'daily_reward') {
      const day = historyDay(entry);
      const rankLabel = historyRank(entry);
      return 'Daily reward' + (day ? ' • ' + day : '') + (rankLabel ? ' • ' + rankLabel : '');
    }
    return entry.label || 'Balance adjustment';
  }

  function historyDetailMeta(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const parts = [];
    const medal = historyMedal(entry);
    if (medal === 'gold' || medal === 'silver' || medal === 'bronze') {
      parts.push(medal.charAt(0).toUpperCase() + medal.slice(1) + ' medal');
    }
    const diffKey = String(entry.diff_key || (entry.meta && entry.meta.diff_key) || '').trim();
    if (diffKey) {
      parts.push(diffKey.charAt(0).toUpperCase() + diffKey.slice(1));
    }
    const day = historyDay(entry);
    if (!String(entry && entry.type || '').toLowerCase().includes('daily') && day) {
      parts.push(formatDay(day));
    }
    return parts.join(' • ');
  }

  function renderRows(data) {
    const entries = historyEntries(data);
    const note = data && data.note ? '<div class="points-history-note">' + escapeHtml(data.note) + '</div>' : '';
    if (!entries.length) {
      listEl.innerHTML = note + '<div class="points-history-empty">No itemized point history was found yet for this account.</div>';
      return;
    }
    const rows = entries.map((entry) => {
      const sourceKey = historySourceKey(entry);
      const sourceLabel = historySourceLabel(sourceKey);
      const label = historyFinishLabel(entry);
      const detailMeta = historyDetailMeta(entry);
      const points = Number(entry && entry.points || 0);
      return (
        '<tr>' +
          '<td>' + escapeHtml(formatDay(historyDay(entry))) + '</td>' +
          '<td><span class="points-history-source ' + sourceClass(sourceKey) + '">' + escapeHtml(sourceLabel) + '</span></td>' +
          '<td><span class="points-history-detail">' + escapeHtml(label) + '</span>' + (detailMeta ? '<span class="points-history-detail-meta">' + escapeHtml(detailMeta) + '</span>' : '') + '</td>' +
          '<td class="points-history-points ' + (points >= 0 ? 'positive' : 'negative') + '">' + escapeHtml(signed(points)) + '</td>' +
        '</tr>'
      );
    }).join('');
    listEl.innerHTML = note +
      '<table class="points-history-table">' +
        '<thead><tr><th>Day</th><th>Earned from</th><th>Details</th><th>Points</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
  }

  function setStatus(text) {
    statusEl.textContent = text || '';
  }

  function openModal() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  async function loadPointsHistory(force) {
    const now = Date.now();
    if (!force && cache.data && (now - cache.ts) < 15000) {
      renderSummary(cache.data);
      renderRows(cache.data);
      setStatus('Updated just now.');
      return;
    }
    summaryEl.innerHTML = '';
    listEl.innerHTML = '';
    setStatus('Loading points breakdown…');
    try {
      const res = await fetch(endpoint + '?_=' + now, { credentials: 'include', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data && data.error ? data.error : ('Request failed (' + res.status + ')'));
      }
      if (data.logged_in === false) {
        renderSummary({ summary: { current_points: 0, daily_claimed_points: 0, supporter_bonus_points: 0, other_adjustments: 0 } });
        listEl.innerHTML = '<div class="points-history-empty">Sign in to view your points breakdown.</div>';
        setStatus('');
        return;
      }
      cache.ts = now;
      cache.data = data;
      renderSummary(data);
      renderRows(data);
      const entryCount = historyEntries(data).length;
      const count = data.summary && typeof data.summary.claim_count !== 'undefined' ? Number(data.summary.claim_count || 0) : countDailyClaims(historyEntries(data));
      setStatus(entryCount ? ('Showing ' + entryCount + ' logged point entr' + (entryCount === 1 ? 'y' : 'ies') + (count ? (' • including ' + count + ' claimed daily reward' + (count === 1 ? '' : 's')) : '') + '.') : 'No point history logged yet.');
    } catch (err) {
      console.error('points_history load failed', err);
      renderSummary({ summary: { current_points: 0, daily_claimed_points: 0, supporter_bonus_points: 0, other_adjustments: 0 } });
      listEl.innerHTML = '<div class="points-history-empty">Could not load the points breakdown right now.</div>';
      setStatus(err && err.message ? err.message : 'Unknown error');
    }
  }

  async function openPointsHistory(force) {
    openModal();
    await loadPointsHistory(!!force);
  }

  pointsPill.classList.add('points-history-trigger');
  pointsPill.setAttribute('role', 'button');
  pointsPill.setAttribute('tabindex', '0');
  pointsPill.setAttribute('title', 'View points breakdown');
  pointsPill.addEventListener('click', () => openPointsHistory(true));
  pointsPill.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPointsHistory(true);
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.hasAttribute('data-points-history-close')) {
      closeModal();
    }
  });

  closeBtn.addEventListener('click', closeModal);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('open')) {
      closeModal();
    }
  });

  if (typeof window.claimDailyReward === 'function') {
    const originalClaimDailyReward = window.claimDailyReward;
    window.claimDailyReward = async function() {
      const result = await originalClaimDailyReward.apply(this, arguments);
      cache.ts = 0;
      cache.data = null;
      return result;
    };
  }
})();
