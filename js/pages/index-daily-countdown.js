(function(){
  if (window.__snapshiftDailyCountdownInstalled) return;
  window.__snapshiftDailyCountdownInstalled = true;

  const RESET_TZ = window.SNAPSHIFT_DAILY_RESET_TZ || 'America/Vancouver';
  const RESET_HOUR = Number(window.SNAPSHIFT_DAILY_RESET_HOUR ?? 17);
  const CLOCK_URLS = [
    '/daily_puzzles/history.json',
    location.pathname + (location.search || ''),
    '/index.html'
  ];

  function q(sel, root){
    try{ return (root || document).querySelector(sel); }catch(e){ return null; }
  }
  function qa(sel, root){
    try{ return Array.from((root || document).querySelectorAll(sel)); }catch(e){ return []; }
  }
  function pad(n){
    return String(Math.max(0, Number(n) || 0)).padStart(2, '0');
  }
  function ymdPartsInTz(date, timeZone){
    try{
      const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const out = {};
      dtf.formatToParts(date).forEach(function(part){
        if (part && part.type && part.type !== 'literal') out[part.type] = part.value;
      });
      return out;
    }catch(e){
      return {
        year: String(date.getFullYear()),
        month: pad(date.getMonth() + 1),
        day: pad(date.getDate())
      };
    }
  }
  function ymdInTz(date, timeZone){
    const p = ymdPartsInTz(date, timeZone);
    return [p.year, p.month, p.day].join('-');
  }
  function addDaysYmd(ymd, days){
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    d.setUTCDate(d.getUTCDate() + Number(days || 0));
    return [
      d.getUTCFullYear(),
      pad(d.getUTCMonth() + 1),
      pad(d.getUTCDate())
    ].join('-');
  }
  function tzOffsetMinutes(date, timeZone){
    try{
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = {};
      dtf.formatToParts(date).forEach(function(part){
        if (part && part.type && part.type !== 'literal') parts[part.type] = part.value;
      });
      const asUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
      );
      return Math.round((asUtc - date.getTime()) / 60000);
    }catch(e){
      return -date.getTimezoneOffset();
    }
  }
  function zonedTimeUtcMs(ymd, timeZone, hour, minute, second){
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return Date.now() + 3600000;
    const hh = Math.max(0, Math.min(23, Number(hour) || 0));
    const mm = Math.max(0, Math.min(59, Number(minute) || 0));
    const ss = Math.max(0, Math.min(59, Number(second) || 0));
    const approxUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm, ss);
    const firstPass = approxUtc - (tzOffsetMinutes(new Date(approxUtc), timeZone) * 60000);
    return approxUtc - (tzOffsetMinutes(new Date(firstPass), timeZone) * 60000);
  }

  function formatResetTimeLabel(hour){
    const normalized = ((Number(hour) || 0) % 24 + 24) % 24;
    const suffix = normalized >= 12 ? 'PM' : 'AM';
    const hour12 = normalized % 12 || 12;
    return hour12 + ':00 ' + suffix;
  }

  const state = {
    offsetMs: 0,
    synced: false,
    lastSyncAt: 0,
    timerId: 0
  };
  let lastAnnouncedDayKey = '';

  function currentServerNowMs(){
    return Date.now() + state.offsetMs;
  }

  async function syncServerClock(){
    for (let i = 0; i < CLOCK_URLS.length; i++) {
      const raw = String(CLOCK_URLS[i] || '').trim();
      if (!raw) continue;
      try{
        const sep = raw.indexOf('?') === -1 ? '?' : '&';
        const url = raw + sep + 'ss_clock=' + Date.now();
        const res = await fetch(url, { method:'HEAD', cache:'no-store' });
        const dateHeader = res && res.headers ? res.headers.get('date') : '';
        const parsed = dateHeader ? Date.parse(dateHeader) : NaN;
        if (Number.isFinite(parsed)) {
          state.offsetMs = parsed - Date.now();
          state.synced = true;
          state.lastSyncAt = Date.now();
          return true;
        }
      }catch(e){}
    }
    return false;
  }

  function formatRemaining(ms){
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
  }

  function nextResetMs(){
    const nowMs = currentServerNowMs();
    const serverNow = new Date(nowMs);
    const todayInResetTz = ymdInTz(serverNow, RESET_TZ);
    const todayResetMs = zonedTimeUtcMs(todayInResetTz, RESET_TZ, RESET_HOUR, 0, 0);
    if (nowMs < todayResetMs) return todayResetMs;
    const tomorrowInResetTz = addDaysYmd(todayInResetTz, 1);
    return zonedTimeUtcMs(tomorrowInResetTz, RESET_TZ, RESET_HOUR, 0, 0);
  }

  function updateElements(){
    const nodes = qa('[data-daily-countdown]');
    if (!nodes.length) return;

    const nowMs = currentServerNowMs();
    const nowDate = new Date(nowMs);
    const currentDayKey = ymdInTz(nowDate, RESET_TZ);
    const targetMs = nextResetMs();
    const diff = targetMs - nowMs;
    const display = diff > 0 ? formatRemaining(diff) : 'Refreshing…';
    const title = 'Next Daily Challenge starts at ' + formatResetTimeLabel(RESET_HOUR) + ' ' + RESET_TZ.replace(/_/g, ' ');

    nodes.forEach(function(node){
      try{
        const valueEl = q('[data-daily-countdown-value]', node);
        if (valueEl) valueEl.textContent = display;
        else node.textContent = 'Next Daily: ' + display;
        node.title = title;
        node.hidden = false;
        node.removeAttribute('aria-hidden');
      }catch(e){}
    });

    if (!lastAnnouncedDayKey) {
      lastAnnouncedDayKey = currentDayKey;
      return;
    }

    if (currentDayKey !== lastAnnouncedDayKey) {
      lastAnnouncedDayKey = currentDayKey;
      try {
        window.dispatchEvent(new CustomEvent('snapshift:daily-rollover', {
          detail: {
            day: currentDayKey,
            resetHour: RESET_HOUR,
            timeZone: RESET_TZ
          }
        }));
      } catch(e) {}
    }
  }

  async function init(){
    updateElements();
    await syncServerClock();
    updateElements();
    clearInterval(state.timerId);
    state.timerId = setInterval(function(){
      updateElements();
      if (!state.lastSyncAt || (Date.now() - state.lastSyncAt) > 300000) {
        syncServerClock().then(updateElements).catch(function(){});
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
