(() => {
  const GAME_URL = '/game.html';
  const CATEGORY_URL = '/category.html';
  const DAILY_HISTORY_URL = '/daily_puzzles/history.json';
  const THEME_URL = '/theme.json';
  const HISTORY_URL = '/api/daily_history.php?days=400';
  const ARCHIVE_PAGE_SIZE = 16;
  const REMEMBERED_USERNAME_COOKIE = 'snapshift_remembered_username';
  const CATEGORY_NAMES = {
    animals:'Animals', architecture:'Architecture', art:'Art', cities:'Cities', food:'Food',
    fractals:'Fractals', landscapes:'Landscapes', marine:'Marine', nature:'Nature',
    scifi:'Sci‑Fi', space:'Space', vehicles:'Vehicles', daily:'Daily'
  };

  const groupsEl = document.getElementById('archiveGroups');
  const archiveDisabledEl = document.getElementById('archiveDisabled');
  const archiveEmptyEl = document.getElementById('archiveEmpty');
  const archiveCountValue = document.getElementById('archiveCountValue');
  const archiveCategoryValue = document.getElementById('archiveCategoryValue');
  const archiveLatestDay = document.getElementById('archiveLatestDay');
  const archiveCompletedValue = document.getElementById('archiveCompletedValue');
  const archiveCountText = document.getElementById('archiveCountText');
  const archiveHeroTitle = document.getElementById('archiveHeroTitle');
  const archiveHeroText = document.getElementById('archiveHeroText');
  const archiveSectionTitle = document.getElementById('archiveSectionTitle');
  const archiveSectionSub = document.getElementById('archiveSectionSub');
  const archivePager = document.getElementById('archivePager');
  const archivePrevPageBtn = document.getElementById('archivePrevPageBtn');
  const archiveNextPageBtn = document.getElementById('archiveNextPageBtn');
  const archivePageSelect = document.getElementById('archivePageSelect');
  const playTodayBtn = document.getElementById('playTodayBtn');
  const featuredCategoryBtn = document.getElementById('featuredCategoryBtn');
  const authPill = document.getElementById('authPill');

  let archiveEnabled = true;
  let currentRange = 60;
  let historyPool = [];
  let usingRealHistory = false;
  let archiveStartDate = '';
  let siteTodayKey = '';
  let allEntries = [];
  let currentPage = 1;
  let completedDays = new Set();
  let completionMetaByDay = new Map();

  function footerYear(){
    try{ const y = document.getElementById('footerYear'); if (y) y.textContent = new Date().getFullYear(); }catch(e){}
  }

  function getRememberedUsername(){
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + REMEMBERED_USERNAME_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch(e){ return ''; }
  }

  function buildRememberedLoginHref(base = '/login.php'){
    try {
      const url = new URL(base, window.location.href);
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (current && !/\/login\.php$/i.test(window.location.pathname)) {
        url.searchParams.set('return', current);
      }
      return url.pathname + url.search + url.hash;
    } catch(e){
      try{
        const current = window.location.pathname + window.location.search + window.location.hash;
        if (current && !/\/login\.php$/i.test(window.location.pathname)) {
          return `${base}${base.includes('?') ? '&' : '?'}return=${encodeURIComponent(current)}`;
        }
      }catch(err){}
      return base;
    }
  }

  function applyRememberedAuth(){
    if (authPill) authPill.href = buildRememberedLoginHref('/login.php');
  }

  function bindArchiveLeaderboardLinks(){
    const lbBtn = document.getElementById('archiveLeaderboardBtn');
    const ratingBtn = document.getElementById('archiveRatingsBtn');
    if (lbBtn){
      lbBtn.addEventListener('click', function(ev){
        ev.preventDefault();
        try { sessionStorage.setItem('snapshift_open_lb_mode', 'daily'); } catch(e) {}
        window.location.href = '/';
      });
    }
    if (ratingBtn){
      ratingBtn.addEventListener('click', function(ev){
        ev.preventDefault();
        try { sessionStorage.setItem('snapshift_open_lb_mode', 'rating'); } catch(e) {}
        window.location.href = '/';
      });
    }
  }

  const continueBtn = document.getElementById('continueBtn');
  const GAME_URL_RESUME = '/game.html';

  async function refreshArchivePointsFromServer(){
    try{
      const r = await fetch('/api/points_get.php', { credentials:'include', cache:'no-store' });
      const j = await r.json().catch(() => null);
      const points = (j && j.loggedIn) ? (Number(j.points) || 0) : 0;
      const pill = document.getElementById('pointsPill');
      if (pill) pill.textContent = `Points: ${points}`;
    }catch(e){
      const pill = document.getElementById('pointsPill');
      if (pill) pill.textContent = 'Points: 0';
    }
  }

  function setRememberedUsername(username){
    const value = String(username || '').trim();
    if (!value) return;
    try{
      document.cookie = `${REMEMBERED_USERNAME_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60*60*24*365}; SameSite=Lax`;
    }catch(e){}
  }

  function applySupporterUi(supporter){
    const pill = document.getElementById('supporterPill');
    if (!pill) return;
    const active = !!(supporter && supporter.active);
    if (!active){
      pill.hidden = true;
      pill.setAttribute('aria-hidden', 'true');
      pill.style.display = 'none';
      pill.textContent = '★ Supporter';
      return;
    }
    const label = String((supporter && supporter.badgeLabel) || 'Supporter').trim() || 'Supporter';
    pill.textContent = `★ ${label}`;
    pill.hidden = false;
    pill.setAttribute('aria-hidden', 'false');
    pill.style.display = '';
  }


  async function initArchiveAuthPill(){
    const el = document.getElementById('authPill');
    try{
      const r = await fetch('/api/me.php', { cache:'no-store', credentials:'include' });
      const j = await r.json().catch(() => null);
      if (!el) {
        applySupporterUi((j && j.loggedIn && j.supporter) ? (j.supporter || null) : null);
        return;
      }
      if (j && j.loggedIn){
        const username = j.username || 'Account';
        setRememberedUsername(username);
        el.textContent = `Signed in: ${username}`;
        el.href = '/logout.php';
        el.title = 'Sign out';
      } else {
        el.textContent = 'Sign in';
        el.href = buildRememberedLoginHref('/login.php');
        el.title = 'Sign in';
      }
      applySupporterUi((j && j.loggedIn && j.supporter) ? (j.supporter || null) : null);
    }catch(e){
      if (el){
        el.textContent = 'Sign in';
        el.href = buildRememberedLoginHref('/login.php');
        el.title = 'Sign in';
      }
      applySupporterUi(null);
    }
  }

  async function fetchLatestProgressForContinue(){
    try{
      const r = await fetch('/api/state_get.php', { credentials:'include', cache:'no-store' });
      const j = await r.json().catch(() => null);
      if (j && j.ok && j.loggedIn && j.progress && typeof j.progress === 'object'){
        const progress = j.progress;
        const completedRaw = progress.completed;
        const completed = completedRaw === true || completedRaw === 1 || completedRaw === '1' || String(completedRaw || '').toLowerCase() === 'true';
        if (!completed) return progress;
      }
    }catch(e){}
    return null;
  }

  function getContinueDifficultyLabel(diffKey){
    const key = String(diffKey || '').toLowerCase();
    if (key === 'hard') return 'Hard';
    if (key === 'medium') return 'Medium';
    return 'Easy';
  }

  function formatContinueRelativeTime(value){
    try{
      if (!value) return '';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return '';
      const diffMs = Date.now() - dt.getTime();
      if (!Number.isFinite(diffMs)) return '';
      const mins = Math.max(0, Math.round(diffMs / 60000));
      if (mins < 1) return 'Saved';
      if (mins < 60) return `saved ${mins} min ago`;
      const hours = Math.round(mins / 60);
      if (hours < 24) return `saved ${hours} hr ago`;
      const days = Math.round(hours / 24);
      if (days < 7) return `saved ${days} day${days === 1 ? '' : 's'} ago`;
      return 'saved ' + dt.toLocaleDateString();
    }catch(e){
      return '';
    }
  }

  function ensureContinueButtonLayout(){
    if (!continueBtn) return null;
    let wrap = continueBtn.querySelector('.continueLabelWrap');
    let main = continueBtn.querySelector('.continueMain');
    let sub = continueBtn.querySelector('.continueSub');
    if (!wrap || !main || !sub){
      continueBtn.textContent = '';
      wrap = document.createElement('span');
      wrap.className = 'continueLabelWrap';
      main = document.createElement('span');
      main.className = 'continueMain';
      sub = document.createElement('span');
      sub.className = 'continueSub';
      wrap.appendChild(main);
      wrap.appendChild(sub);
      continueBtn.appendChild(wrap);
    }
    return { wrap, main, sub };
  }

  function setContinueButtonDisplay(mainText, subText = '', titleText = ''){
    if (!continueBtn) return;
    const nodes = ensureContinueButtonLayout();
    if (!nodes) return;
    nodes.main.textContent = String(mainText || 'All Caught Up');
    nodes.sub.textContent = String(subText || '');
    continueBtn.classList.toggle('hasMeta', !!subText);
    continueBtn.title = String(titleText || (subText || mainText || 'All Caught Up'));
  }

  async function refreshContinueButtonState(){
    if (!continueBtn) return;
    try{
      const progress = await fetchLatestProgressForContinue();
      if (progress && progress.categoryId){
        const puzzleName = String(progress.puzzleName || 'Saved puzzle').trim();
        const diffLabel = getContinueDifficultyLabel(progress.diffKey);
        const whenLabel = formatContinueRelativeTime(progress.updatedAt || progress.savedAt);
        const main = progress.isDaily ? 'Resume Daily' : `Continue ${diffLabel}`;
        const sub = [puzzleName, whenLabel].filter(Boolean).join(' · ');
        setContinueButtonDisplay(main, sub, puzzleName || 'Continue your unfinished puzzle');
        return;
      }
    }catch(e){}
    setContinueButtonDisplay('All Caught Up', '', 'You have no unfinished puzzle to resume');
  }

  function openGameResumeLatest(){
    window.location.href = `${GAME_URL_RESUME}#resume=latest`;
  }

  if (continueBtn){
    continueBtn.addEventListener('click', async () => {
      const prevMain = continueBtn.querySelector('.continueMain') ? continueBtn.querySelector('.continueMain').textContent : 'All Caught Up';
      const prevSub = continueBtn.querySelector('.continueSub') ? continueBtn.querySelector('.continueSub').textContent : '';
      const prevTitle = continueBtn.title || 'You have no unfinished puzzle to resume';
      continueBtn.disabled = true;
      setContinueButtonDisplay('Opening…', prevSub, prevTitle);
      try{
        const progress = await fetchLatestProgressForContinue();
        if (progress && progress.categoryId){
          openGameResumeLatest();
          return;
        }
        window.location.href = '/';
      } catch(e){
        window.location.href = '/';
      } finally {
        continueBtn.disabled = false;
        setContinueButtonDisplay(prevMain, prevSub, prevTitle);
        refreshContinueButtonState().catch(()=>{});
      }
    });
  }

  function updateTopPlayTodayState(){
    if (!playTodayBtn) return;
    const done = completedDays.has(currentSiteDay());
    const liveToday = getLiveTodayEntryFromPool();
    if (!liveToday){
      playTodayBtn.textContent = "Today's Daily Unavailable";
      playTodayBtn.removeAttribute('href');
      playTodayBtn.setAttribute('aria-disabled', 'true');
      playTodayBtn.style.pointerEvents = 'none';
      playTodayBtn.style.opacity = '.6';
      return;
    }
    playTodayBtn.textContent = done ? "View Today's Puzzle" : "Play Today's Puzzle";
    playTodayBtn.href = buildPlayHref(liveToday);
    playTodayBtn.removeAttribute('aria-disabled');
    playTodayBtn.style.pointerEvents = '';
    playTodayBtn.style.opacity = '';
  }


  function decodeMaybeTwice(value){
    let v = String(value || '');
    try { v = decodeURIComponent(v); } catch(e) {}
    if (/%[0-9A-Fa-f]{2}/.test(v)) {
      try { v = decodeURIComponent(v); } catch(e) {}
    }
    return v;
  }

  function normalizeCatId(catId){
    const s = String(catId || '').trim().toLowerCase();
    const aliases = { city:'cities', landscape:'landscapes' };
    return aliases[s] || s;
  }

  function todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function currentSiteDay(){
    return /^\d{4}-\d{2}-\d{2}$/.test(siteTodayKey) ? siteTodayKey : todayKey();
  }

  function dayKeyOffset(offset){
    const d = new Date();
    d.setHours(12,0,0,0);
    d.setDate(d.getDate() - Number(offset || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatLongDay(day){
    try{
      const d = new Date(String(day) + 'T00:00:00');
      return d.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    }catch(e){ return String(day || ''); }
  }

  function formatShortDay(day){
    try{
      const d = new Date(String(day) + 'T00:00:00');
      return d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
    }catch(e){ return String(day || ''); }
  }

  function monthLabel(day){
    try{
      const d = new Date(String(day) + 'T00:00:00');
      return d.toLocaleDateString(undefined, { month:'long', year:'numeric' });
    }catch(e){ return 'Archive'; }
  }

  function categoryName(catId){
    return CATEGORY_NAMES[normalizeCatId(catId)] || 'Daily';
  }

  function buildCategoryHref(entry){
    const catId = normalizeCatId(entry && entry.catId ? entry.catId : '');
    if (catId && catId !== 'daily') return `${CATEGORY_URL}?cat=${encodeURIComponent(catId)}`;
    return '';
  }

  function categoryCtaLabel(entry){
    const catId = normalizeCatId(entry && entry.catId ? entry.catId : '');
    return (catId && catId !== 'daily') ? 'View Category' : '';
  }

  function badgeLabel(entry){
    return entry.isToday ? 'Today' : 'Daily';
  }

  function thumbFromSrc(src){
    const clean = decodeMaybeTwice(String(src || ''));
    if (!clean) return '';
    const dot = clean.lastIndexOf('.');
    if (dot < 0) return clean;
    return clean.slice(0, dot) + '_thumb' + clean.slice(dot);
  }

  function buildPlayHref(entry){
    const cleanSrc = decodeMaybeTwice(String(entry.src || ''));
    const puzzleName = String(entry.name || 'Puzzle');
    const catId = normalizeCatId(entry.catId || 'animals');
    return `${GAME_URL}#daily=${encodeURIComponent(entry.day)}&cat=${encodeURIComponent(catId)}&src=${encodeURIComponent(cleanSrc)}&puzzle=${encodeURIComponent(puzzleName)}`;
  }



  function flattenHistory(history){
    const out = [];
    const src = history && typeof history === 'object' ? history : {};
    const days = src.days && typeof src.days === 'object' ? src.days : {};
    const today = currentSiteDay();
    Object.keys(days).forEach((day) => {
      const p = days[day];
      const safeDay = String(day || '');
      if (!p || !p.src) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDay)) return;
      if (safeDay > today) return;
      if (archiveStartDate && safeDay < archiveStartDate) return;
      out.push({
        day: safeDay,
        catId: normalizeCatId(p.catId || 'daily'),
        name: String(p.name || 'Puzzle'),
        src: decodeMaybeTwice(String(p.src || '')),
        thumb: String(p.thumb || '').trim(),
        updated: Number(p.updated || 0) || 0,
        puzzleIdx: Math.max(0, Number(p.puzzleIdx || 0) || 0),
        isToday: safeDay === today,
        complete: completedDays.has(safeDay),
        medalMeta: completionMetaByDay.get(safeDay) || null
      });
    });
    out.sort((a,b) => String(b.day).localeCompare(String(a.day)));
    return out;
  }



  function getLiveTodayEntryFromPool(){
    const day = currentSiteDay();
    if (!usingRealHistory || !Array.isArray(historyPool) || !historyPool.length) return null;
    const exact = historyPool.find((entry) => String(entry.day || '') === day);
    if (!exact || !exact.src) return null;
    return {
      ...exact,
      day,
      isToday: true,
      complete: completedDays.has(day),
      medalMeta: completionMetaByDay.get(day) || null
    };
  }

  function alignTodayEntryWithLivePool(){
    return;
  }

  function groupByMonth(entries){
    const groups = new Map();
    entries.forEach((entry) => {
      const label = monthLabel(entry.day);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(entry);
    });
    return Array.from(groups.entries());
  }

  function pageCountForEntries(entries){
    return Math.max(1, Math.ceil((Array.isArray(entries) ? entries.length : 0) / ARCHIVE_PAGE_SIZE));
  }

  function currentArchivePageEntries(){
    const totalPages = pageCountForEntries(allEntries);
    currentPage = Math.max(1, Math.min(totalPages, Math.floor(Number(currentPage) || 1)));
    const start = (currentPage - 1) * ARCHIVE_PAGE_SIZE;
    return allEntries.slice(start, start + ARCHIVE_PAGE_SIZE);
  }

  function updateArchivePager(){
    const total = allEntries.length;
    const totalPages = pageCountForEntries(allEntries);
    currentPage = Math.max(1, Math.min(totalPages, Math.floor(Number(currentPage) || 1)));
    if (archivePager) archivePager.hidden = total <= ARCHIVE_PAGE_SIZE;
    if (archivePrevPageBtn) archivePrevPageBtn.disabled = currentPage <= 1;
    if (archiveNextPageBtn) archiveNextPageBtn.disabled = currentPage >= totalPages;
    if (archivePageSelect) {
      const desired = String(currentPage);
      if (archivePageSelect.dataset.pages !== String(totalPages) || archivePageSelect.dataset.total !== String(total)) {
        archivePageSelect.innerHTML = '';
        for (let i = 1; i <= totalPages; i += 1) {
          const opt = document.createElement('option');
          opt.value = String(i);
          const start = ((i - 1) * ARCHIVE_PAGE_SIZE) + 1;
          const end = Math.min(total, i * ARCHIVE_PAGE_SIZE);
          opt.textContent = `Page ${i} (${start}-${end})`;
          archivePageSelect.appendChild(opt);
        }
        archivePageSelect.dataset.pages = String(totalPages);
        archivePageSelect.dataset.total = String(total);
      }
      archivePageSelect.value = desired;
    }
  }

  function scrollArchiveToTop(){
    const target = groupsEl ? groupsEl.closest('.railCard') : null;
    const scrollTarget = target || groupsEl || document.body;
    requestAnimationFrame(() => {
      try {
        scrollTarget.scrollIntoView({ behavior:'smooth', block:'start' });
      } catch (e) {
        scrollTarget.scrollIntoView(true);
      }
    });
  }

  function renderArchivePage(options = {}){
    updateArchivePager();
    renderArchive(currentArchivePageEntries());
    if (options.scrollToTop) scrollArchiveToTop();
  }


  function deriveDailyMedalMeta(item){
    const src = item && typeof item === 'object' ? item : {};
    const rating = src.rating && typeof src.rating === 'object' ? src.rating : null;
    const medalRaw = String(src.medal || src.medalKey || src.medal_key || (rating && (rating.medal || rating.key || rating.label)) || '').trim().toLowerCase();
    let stars = Math.max(
      0,
      Math.floor(
        Number(
          src.stars ??
          src.star_count ??
          src.starCount ??
          src.medalStars ??
          (rating && (rating.stars ?? rating.star_count))
        ) || 0
      )
    );
    let key = '';
    let label = '';

    if (medalRaw === 'gold' || medalRaw === '3' || medalRaw === 'three') { stars = Math.max(stars, 3); key = 'gold'; label = 'Gold'; }
    else if (medalRaw === 'silver' || medalRaw === '2' || medalRaw === 'two') { stars = Math.max(stars, 2); key = 'silver'; label = 'Silver'; }
    else if (medalRaw === 'bronze' || medalRaw === '1' || medalRaw === 'one') { stars = Math.max(stars, 1); key = 'bronze'; label = 'Bronze'; }

    if (!label && stars >= 3) { stars = 3; key = 'gold'; label = 'Gold'; }
    else if (!label && stars === 2) { key = 'silver'; label = 'Silver'; }
    else if (!label && stars === 1) { key = 'bronze'; label = 'Bronze'; }

    if (!stars) return null;
    return {
      stars,
      key: key || 'bronze',
      label: label || 'Bronze',
      starsText: '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars))
    };
  }

  function archiveCompleteBadge(entry){
    if (!entry || !entry.complete) return '<div></div>';
    const medal = entry.medalMeta || null;
    if (medal){
      const cls = medal.key ? ` is${medal.key.charAt(0).toUpperCase() + medal.key.slice(1)}` : '';
      return `<div class="badge medal${cls}" title="${medal.label} medal • ${medal.stars} star${medal.stars === 1 ? '' : 's'}"><span>${medal.label}</span><span class="badgeStars">${medal.starsText}</span></div>`;
    }
    return '<div class="badge done">Completed</div>';
  }

  function renderArchive(entries){
    groupsEl.innerHTML = '';
    archiveEmptyEl.hidden = allEntries.length > 0;
    if (!entries.length) return;

    groupByMonth(entries).forEach(([label, items]) => {
      const group = document.createElement('section');
      group.className = 'monthGroup';
      const header = document.createElement('div');
      header.className = 'monthHeader';
      header.innerHTML = `<h2>${label}</h2><div class="monthMeta">${items.length} challenge${items.length === 1 ? '' : 's'}</div>`;
      group.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'archiveGrid';

      items.forEach((entry) => {
        const card = document.createElement('article');
        card.className = 'archiveCard' + (entry.complete ? ' complete' : '');
        const thumb = entry.thumb || thumbFromSrc(entry.src) || entry.src;
        const catName = categoryName(entry.catId);
        const cleanMetaName = catName === 'Daily' ? 'Daily challenge' : catName;
        const completeBadge = archiveCompleteBadge(entry);
        const categoryHref = buildCategoryHref(entry);
        const categoryLabel = categoryCtaLabel(entry);
        card.innerHTML = `
          <div class="archiveThumbWrap">
            <img class="archiveThumb" src="${thumb}" alt="${entry.name} daily puzzle thumbnail" loading="lazy" onerror="if(this.dataset.full!==this.src){this.src=this.dataset.full}" data-full="${entry.src}">
            <div class="archiveBadgeRow">
              <div class="badge ${entry.isToday ? 'today' : ''}">${badgeLabel(entry)}</div>
              ${completeBadge}
            </div>
          </div>
          <div class="archiveBody">
            <div class="archiveDate">${formatLongDay(entry.day)}</div>
            <h3 class="archiveName">${entry.name}</h3>
            <div class="archiveMeta">${cleanMetaName}${entry.medalMeta ? ` • ${entry.medalMeta.label} ${entry.medalMeta.starsText}` : ''} • Replay this daily challenge, compare your time, and keep your Snapshift streak moving.</div>
            <div class="archiveActions">
              <a class="btnPrimary" href="${buildPlayHref(entry)}">${entry.isToday ? (entry.complete ? "View Today's Puzzle" : "Play Today's Puzzle") : (entry.complete ? "View Daily" : "Play This Daily")}</a>
              ${(!entry.isToday && categoryHref && categoryLabel) ? `<a class="pill archiveActionSecondary" href="${categoryHref}">${categoryLabel}</a>` : ''}
            </div>
          </div>
        `;
        grid.appendChild(card);
      });

      group.appendChild(grid);
      groupsEl.appendChild(group);
    });
  }

  function updateStats(entries){
    const totalEntries = Array.isArray(entries) ? entries.length : 0;
    const totalPages = pageCountForEntries(entries);
    const pageStart = totalEntries ? ((currentPage - 1) * ARCHIVE_PAGE_SIZE) + 1 : 0;
    const pageEnd = Math.min(totalEntries, currentPage * ARCHIVE_PAGE_SIZE);
    const categorySource = historyPool;
    archiveCountValue.textContent = String(totalEntries || 0);
    archiveCategoryValue.textContent = String(new Set((categorySource || []).map((x) => normalizeCatId(x.catId))).size || 0);
    const liveToday = getLiveTodayEntryFromPool();
    const latestDay = liveToday ? String(liveToday.day || currentSiteDay()) : currentSiteDay();
    archiveLatestDay.textContent = formatShortDay(latestDay);
    archiveCompletedValue.textContent = String(completedDays.size || 0);
    if (usingRealHistory){
      archiveCountText.textContent = totalEntries ? `Showing ${pageStart}-${pageEnd} of ${totalEntries} daily challenge${totalEntries === 1 ? '' : 's'}${totalPages > 1 ? ` (page ${currentPage} of ${totalPages}).` : '.'}` : 'No saved daily challenges found yet.';
    } else {
      archiveCountText.textContent = totalEntries ? `Showing today's live daily challenge until saved history is built.` : 'No archive entries found yet.';
    }
  }

  function applyAdminThemeTokens(t){
    try{
      const root = document.documentElement;
      const theme = (t && typeof t === 'object') ? t : {};
      const pick = (key, fallback) => {
        const v = theme[key];
        return (typeof v === 'string' && v.trim()) ? v.trim() : fallback;
      };
      root.style.setProperty('--ss-site-bg', pick('siteBackgroundColor', '#0B1220'));
      root.style.setProperty('--ss-panel-bg', pick('panelBackgroundColor', 'rgba(15,23,42,.72)'));
      root.style.setProperty('--ss-section-bg', pick('sectionBackgroundColor', 'rgba(17,27,45,.78)'));
      root.style.setProperty('--ss-card-bg', pick('cardBackgroundColor', 'rgba(26,39,64,.78)'));
      root.style.setProperty('--ss-border', pick('borderColor', 'rgba(42,57,82,.85)'));
      root.style.setProperty('--ss-text', pick('textColor', '#E8EEF7'));
      root.style.setProperty('--ss-muted', pick('mutedTextColor', '#AFC2E0'));
      root.style.setProperty('--ss-accent', pick('accentColor', '#36CFC9'));
      root.style.setProperty('--ss-accent-2', pick('accentSecondaryColor', '#7CC4FF'));
      root.style.setProperty('--ss-button-bg', pick('buttonBackgroundColor', '#16335D'));
      root.style.setProperty('--ss-button-text', pick('buttonTextColor', '#E8EEF7'));
      root.style.setProperty('--ss-pill-bg', pick('pillBackgroundColor', '#142848'));
      root.style.setProperty('--ss-pill-text', pick('pillTextColor', '#E8EEF7'));
      root.style.setProperty('--ss-font', pick('fontFamily', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'));
      root.style.setProperty('--ss-heading-font', pick('headingFontFamily', pick('fontFamily', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif')));
  
      root.style.setProperty('--controlBg', pick('buttonBackgroundColor', 'rgba(11,18,32,0.88)'));
      root.style.setProperty('--controlBorder', pick('borderColor', 'rgba(42,57,82,0.95)'));
      root.style.setProperty('--controlText', pick('buttonTextColor', '#e8eef7'));
      root.style.setProperty('--controlBgAlt', pick('sectionBackgroundColor', 'rgba(18,28,48,0.92)'));
    }catch(e){}
  }

  function applyTheme(theme){
    const t = (theme && typeof theme === 'object') ? theme : {};
    applyAdminThemeTokens(t);
    const root = document.documentElement;
    const body = document.body;
    const bust = Date.now();
    const themeEnabled = t.themeEnabled !== false;
    if (body) body.classList.toggle('theme-on', themeEnabled);
    const alpha = Number(t.themeAlpha);
    root.style.setProperty('--themeAlpha', Number.isFinite(alpha) ? String(Math.max(0, Math.min(1, alpha))) : '0.85');
    const bg = typeof t.backgroundImage === 'string' ? t.backgroundImage.trim() : '';
    root.style.setProperty('--bgUrl', bg ? `url("${bg}?t=${bust}")` : 'none');
    let frog = document.getElementById('frogImg');
    if (!frog && body) {
      frog = document.createElement('img');
      frog.id = 'frogImg';
      frog.className = 'frog';
      frog.alt = '';
      frog.setAttribute('aria-hidden', 'true');
      body.appendChild(frog);
    }
    const frogSrc = typeof t.frogImage === 'string' ? t.frogImage.trim() : '';
    if (frog) {
      if (themeEnabled && frogSrc) {
        frog.src = frogSrc + '?t=' + bust;
        frog.style.removeProperty('display');
      } else {
        frog.removeAttribute('src');
        frog.style.display = 'none';
      }
    }
    archiveEnabled = t.archiveEnabled !== false;
    archiveStartDate = String(t.archiveStartDate || t.dailyHistoryStartDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveStartDate)) archiveStartDate = '';
    const introTitle = String(t.archiveIntroTitle || 'Daily Puzzle Archive').trim();
    const introText = String(t.archiveIntroText || 'Browse past daily challenges and replay your favorites.').trim();
    const ctaText = String(t.archiveCtaText || "Play Today's Puzzle").trim() || "Play Today's Puzzle";
    const featuredName = String(t.featuredCategoryName || '').trim();
    const featuredUrl = String(t.featuredCategoryUrl || '').trim();

    if (archiveHeroTitle) archiveHeroTitle.textContent = introTitle;
    if (archiveSectionTitle) archiveSectionTitle.textContent = introTitle;
    if (archiveHeroText) archiveHeroText.textContent = introText;
    if (archiveSectionSub) archiveSectionSub.textContent = introText;
    if (playTodayBtn) playTodayBtn.textContent = ctaText;

    if (featuredName && featuredUrl){
      featuredCategoryBtn.hidden = false;
      featuredCategoryBtn.textContent = featuredName;
      featuredCategoryBtn.href = featuredUrl;
    } else {
      featuredCategoryBtn.hidden = true;
    }

    archiveDisabledEl.hidden = archiveEnabled;
    groupsEl.hidden = !archiveEnabled;
    archiveEmptyEl.hidden = !archiveEnabled;
  }

  async function fetchTheme(){
    try{
      const r = await fetch(THEME_URL + '?t=' + Date.now(), { cache:'no-store' });
      if (!r.ok) throw new Error('theme.json missing');
      applyTheme(await r.json());
    }catch(e){
      applyTheme({});
    }
  }

  async function fetchDailyCatalog(){ return []; }

  async function fetchDailyHistoryFile(){
    try{
      const r = await fetch(DAILY_HISTORY_URL + '?t=' + Date.now(), { cache:'no-store' });
      if (!r.ok) throw new Error('history missing');
      const data = await r.json();
      const serverToday = String(data && data.today || '').trim();
      siteTodayKey = /^\d{4}-\d{2}-\d{2}$/.test(serverToday) ? serverToday : '';
      historyPool = flattenHistory(data);
      usingRealHistory = historyPool.length > 0;
    }catch(e){
      siteTodayKey = '';
      historyPool = [];
      usingRealHistory = false;
    }
  }

  async function fetchCompletionHistory(){
    completedDays = new Set();
    completionMetaByDay = new Map();
    try{
      const r = await fetch(HISTORY_URL, { cache:'no-store', credentials:'include' });
      const j = await r.json();
      if (!j || !j.ok || !j.loggedIn || !Array.isArray(j.days)) return;
      j.days.forEach((d) => {
        const day = d && d.day ? String(d.day) : '';
        if (!day) return;
        if (d && d.completed) completedDays.add(day);
        const medalMeta = deriveDailyMedalMeta(d);
        if (medalMeta) completionMetaByDay.set(day, medalMeta);
      });
    }catch(e){}
  }

  function renderRange(range, options = {}){
    const previousCount = allEntries.length;
    currentRange = Math.max(30, Number(range || 60));
    const keepPage = !!options.keepPage;
    const jumpToOlder = !!options.jumpToOlder;
    document.querySelectorAll('[data-range]').forEach((btn) => {
      btn.style.background = Number(btn.getAttribute('data-range')) === currentRange ? 'rgba(48,99,227,.95)' : 'rgba(16,27,49,.82)';
      btn.style.borderColor = Number(btn.getAttribute('data-range')) === currentRange ? 'rgba(129,176,255,.55)' : 'rgba(124,196,255,.26)';
    });
    allEntries = usingRealHistory
      ? historyPool.slice(0, currentRange).map((entry) => ({
          ...entry,
          isToday: entry.day === currentSiteDay(),
          complete: completedDays.has(entry.day),
          medalMeta: completionMetaByDay.get(String(entry.day || '')) || null
        }))
      : [];
    if (jumpToOlder && previousCount > 0) {
      currentPage = Math.min(pageCountForEntries(allEntries), Math.floor(previousCount / ARCHIVE_PAGE_SIZE) + 1);
    } else if (!keepPage) {
      currentPage = 1;
    }
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
      loadMoreBtn.hidden = !usingRealHistory || currentRange >= historyPool.length;
      loadMoreBtn.disabled = currentRange >= historyPool.length;
    }
    renderArchivePage();
    updateStats(allEntries);
    updateTopPlayTodayState();
  }

  function bindUi(){
    document.querySelectorAll('[data-range]').forEach((btn) => {
      btn.addEventListener('click', () => renderRange(Number(btn.getAttribute('data-range')) || 60));
    });
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn){
      loadMoreBtn.addEventListener('click', () => renderRange(currentRange + 30, { jumpToOlder:true }));
    }
    if (archivePrevPageBtn) {
      archivePrevPageBtn.addEventListener('click', () => {
        currentPage = Math.max(1, currentPage - 1);
        renderArchivePage({ scrollToTop:true });
        updateStats(allEntries);
      });
    }
    if (archiveNextPageBtn) {
      archiveNextPageBtn.addEventListener('click', () => {
        currentPage = Math.min(pageCountForEntries(allEntries), currentPage + 1);
        renderArchivePage({ scrollToTop:true });
        updateStats(allEntries);
      });
    }
    if (archivePageSelect) {
      archivePageSelect.addEventListener('change', () => {
        currentPage = Math.max(1, Math.min(pageCountForEntries(allEntries), Math.floor(Number(archivePageSelect.value) || 1)));
        renderArchivePage({ scrollToTop:true });
        updateStats(allEntries);
      });
    }
  }

  async function boot(){
    footerYear();
    applyRememberedAuth();
    await initArchiveAuthPill();
    await refreshArchivePointsFromServer();
    await refreshContinueButtonState();
    bindArchiveLeaderboardLinks();
    bindUi();
    await fetchTheme();
    if (!archiveEnabled) {
      updateStats([]);
      archiveCountText.textContent = 'Archive disabled in theme settings.';
      return;
    }
    await Promise.all([fetchCompletionHistory(), fetchDailyHistoryFile()]);
    updateTopPlayTodayState();
    if (!usingRealHistory){
      archiveEmptyEl.hidden = false;
      updateStats([]);
      return;
    }
    renderRange(currentRange);
  }


  document.addEventListener('visibilitychange', () => {
    if (!document.hidden){
      initArchiveAuthPill().catch(()=>{});
      refreshArchivePointsFromServer().catch(()=>{});
    }
  });
  window.addEventListener('focus', () => {
    initArchiveAuthPill().catch(()=>{});
    refreshArchivePointsFromServer().catch(()=>{});
  });
  window.addEventListener('pageshow', () => {
    initArchiveAuthPill().catch(()=>{});
    refreshArchivePointsFromServer().catch(()=>{});
  });

  boot();
})();
