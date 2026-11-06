(() => {
  const AUTO_CLAIM_DAILY_BACKLOG = window.SNAPSHIFT_AUTO_CLAIM_DAILY_BACKLOG === true;
  let dailyRewardBacklogChecked = false;

  function showDailyBacklogToast(totalReward, claimedCount, claimedDays){
    const total = Math.max(0, Math.floor(Number(totalReward) || 0));
    const count = Math.max(0, Math.floor(Number(claimedCount) || 0));
    if (!total || !count) return;
    const items = Array.isArray(claimedDays) ? claimedDays : [];
    const detail = items.length
      ? items.slice(0, 3).map((x) => `${x.day} • #${x.rank} • +${x.reward}`).join(' • ') + (items.length > 3 ? ` • +${items.length - 3} more` : '')
      : 'Missed Daily rewards added to your total.';
    if (typeof showStreakRewardToast === 'function') {
      showStreakRewardToast(
        count === 1 ? `Daily leaderboard reward: +${total} points!` : `Claimed ${count} Daily rewards: +${total} points!`,
        detail
      );
    }
  }

  async function autoClaimMissedDailyRewards(options = {}){
    const force = !!(options && options.force);
    if (dailyRewardBacklogChecked && !force) return null;
    dailyRewardBacklogChecked = true;

    try {
      try {
        if (!window.meCache) {
          const r0 = await fetch('/api/me.php', { cache:'no-store', credentials:'include' });
          window.meCache = await r0.json();
        }
      } catch(e) {}

      const loggedIn = !!(window.meCache && window.meCache.loggedIn);
      if (!loggedIn) return null;

      const rs = await fetch('/api/reward_status.php?backlog=1', { cache:'no-store', credentials:'include' });
      const status = await rs.json().catch(() => null);
      if (!(status && status.ok && status.claimable && Number(status.claim_count || 0) > 0 && Number(status.total_reward || 0) > 0)) {
        return status;
      }

      const rc = await fetch('/api/reward_claim.php?backlog=1', {
        method:'POST',
        credentials:'include',
        headers:{ 'Content-Type':'application/json' },
        body:'{}'
      });
      const claim = await rc.json().catch(() => null);
      if (!(claim && claim.ok && Number(claim.claimed_count || 0) > 0 && Number(claim.total_reward || 0) > 0)) {
        return claim;
      }

      if (typeof claim.points === 'number') {
        try {
          if (typeof pointsState !== 'undefined') pointsState = Math.max(0, Math.floor(Number(claim.points) || 0));
          const pill = document.getElementById('pointsPill');
          if (pill) pill.textContent = `Points: ${Math.max(0, Math.floor(Number(claim.points) || 0))}`;
        } catch(e){}
      } else if (typeof refreshPointsFromServer === 'function') {
        try { await refreshPointsFromServer(); } catch(e){}
      }

      showDailyBacklogToast(claim.total_reward, claim.claimed_count, claim.claimed_days);
      return claim;
    } catch (e) {
      return null;
    }
  }

  window.autoClaimMissedDailyRewards = autoClaimMissedDailyRewards;

  document.addEventListener('DOMContentLoaded', () => {
    if (!AUTO_CLAIM_DAILY_BACKLOG) return;
    setTimeout(() => {
      autoClaimMissedDailyRewards().catch(() => {});
    }, 700);
  });
})();
