  (() => {
    const CATEGORY_URL = '/category.html';
    const CATALOG_URLS = ['/puzzles/index.json', 'puzzles/index.json'];
    const THEME_URL = '/theme.json';
    const REMEMBERED_USERNAME_COOKIE = 'snapshift_remembered_username';
    const CATEGORY_ALIASES = { city:['city','cities'], landscape:['landscape','landscapes'] };
    const CATEGORIES = [
      { id:'animals', name:'Animals', desc:'Wildlife, pets, safari scenes.', tile:'category_tiles/animals.png' },
      { id:'architecture', name:'Architecture', desc:'Buildings, interiors, design.', tile:'category_tiles/architecture.png' },
      { id:'art', name:'Art', desc:'Paintings, illustrations, museums.', tile:'category_tiles/art.png' },
      { id:'cities', name:'Cities', desc:'Skylines, streets, downtown.', tile:'category_tiles/cities.png' },
      { id:'food', name:'Food', desc:'Meals, desserts, ingredients.', tile:'category_tiles/food.png' },
      { id:'fractals', name:'Fractals', desc:'Patterns, math art, abstractions.', tile:'category_tiles/fractals.png' },
      { id:'landscapes', name:'Landscapes', desc:'Fields, hills, scenic views.', tile:'category_tiles/landscapes.png' },
      { id:'marine', name:'Marine', desc:'Sea, boats, underwater worlds.', tile:'category_tiles/marine.png' },
      { id:'nature', name:'Nature', desc:'Flowers, forests, outdoor detail.', tile:'category_tiles/nature.png' },
      { id:'scifi', name:'Sci‑Fi', desc:'Futuristic worlds, tech, aliens.', tile:'category_tiles/scifi.png' },
      { id:'space', name:'Space', desc:'Planets, stars, cosmic scenes.', tile:'category_tiles/space.png' },
      { id:'vehicles', name:'Vehicles', desc:'Cars, bikes, machines.', tile:'category_tiles/vehicles.png' }
    ];

    const grid = document.getElementById('grid');
    const countPill = document.getElementById('countPill');
    const emptyState = document.getElementById('emptyState');
    const pointsPill = document.getElementById('pointsPill');
    const authPill = document.getElementById('authPill');
    const frogImg = document.getElementById('frogImg');
    let catalog = {};

    function footerYear(){ const y = document.getElementById('footerYear'); if (y) y.textContent = new Date().getFullYear(); }
    function getRememberedUsername(){
      try {
        const m = document.cookie.match(new RegExp('(?:^|; )' + REMEMBERED_USERNAME_COOKIE.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : '';
      } catch(e){ return ''; }
    }
    function buildRememberedLoginHref(base = '/login.php'){
      try {
        const url = new URL(base, window.location.href);
        const current = window.location.pathname + window.location.search + window.location.hash;
        if (current && !/\/login\.php$/i.test(window.location.pathname)) url.searchParams.set('return', current);
        return url.pathname + url.search + url.hash;
      } catch(e){ return base; }
    }
    function setRememberedUsername(username){
      const value = String(username || '').trim();
      if (!value) return;
      try { document.cookie = `${REMEMBERED_USERNAME_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60*60*24*365}; SameSite=Lax`; } catch(e){}
    }
    function shortName(value){ const raw = String(value || '').trim(); return !raw ? 'Player' : (raw.length > 18 ? raw.slice(0,18) + '…' : raw); }
    function normalizeCatId(v){ return String(v || '').trim().toLowerCase(); }
    function openCategory(catId){ window.location.href = `${CATEGORY_URL}?cat=${encodeURIComponent(catId)}`; }
    function getIndexListForCategory(indexData, catId){
      const cats = (indexData && indexData.categories) || indexData || {};
      const candidates = CATEGORY_ALIASES[catId] || [catId];
      for (const k of candidates){
        const arr = cats[k];
        if (Array.isArray(arr)) return arr;
      }
      return [];
    }
    async function loadCatalog(){
      let data = null;
      for (const url of CATALOG_URLS){
        try{
          const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache:'no-store' });
          if (!r.ok) continue;
          data = await r.json();
          break;
        }catch(e){}
      }
      if (!data || typeof data !== 'object') throw new Error('catalog missing');
      catalog = (data.categories && typeof data.categories === 'object') ? data.categories : data;
    }
    function renderGrid(){
      grid.innerHTML = '';
      let totalWithData = 0;
      for (const c of CATEGORIES){
        const puzzles = getIndexListForCategory(catalog, c.id).length;
        if (puzzles > 0) totalWithData++;
        const el = document.createElement('a');
        el.className = 'cat';
        el.href = `${CATEGORY_URL}?cat=${encodeURIComponent(c.id)}`;
        el.innerHTML = `
          <div class="tile"><img src="${c.tile}" alt="${c.name}"></div>
          <div class="info">
            <div>
              <div class="catName">${c.name}</div>
              <div class="catDesc">${c.desc || ''}</div>
            </div>
            <div class="tags"><span class="tag">${puzzles} puzzles</span></div>
          </div>`;
        const img = el.querySelector('img');
        if (img) img.addEventListener('error', () => {
          const tile = el.querySelector('.tile');
          if (tile) tile.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:950;opacity:.85;">${c.name}</div>`;
        });
        grid.appendChild(el);
      }
      countPill.textContent = `Categories: ${CATEGORIES.length}`;
      emptyState.hidden = totalWithData > 0;
    }
    function setSeo(){
      const totalPuzzles = CATEGORIES.reduce((sum, c) => sum + getIndexListForCategory(catalog, c.id).length, 0);
      const desc = `${totalPuzzles || 'Dozens of'} free picture tile puzzles are available across ${CATEGORIES.length} Snapshift categories. Browse animals, architecture, art, cities, food, fractals, landscapes, marine, nature, sci-fi, space, and vehicles from one standalone page.`;
      document.title = 'Browse Categories | Snapshift Puzzles';
      const md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute('content', desc);
      const ogd = document.querySelector('meta[property="og:description"]'); if (ogd) ogd.setAttribute('content', desc);
      const ld = document.getElementById('structuredData');
      if (ld) ld.textContent = JSON.stringify({ '@context':'https://schema.org', '@type':'CollectionPage', name:'Snapshift browse categories', url:new URL('/browse-categories.html', location.origin).href, description:desc });
      const seoCopy = document.getElementById('seoBrowseCopy'); if (seoCopy) seoCopy.textContent = desc;
    }
    async function refreshPoints(){
      try{
        const syncDot = document.getElementById('syncDot');
        if (syncDot) syncDot.style.display = 'inline';
        const r = await fetch('/api/points_get.php', { credentials:'include', cache:'no-store' });
        const j = await r.json().catch(() => null);
        const points = (j && j.loggedIn) ? Math.max(0, Number(j.points) || 0) : 0;
        pointsPill.textContent = `Points: ${points}`;
      }catch(e){ pointsPill.textContent = 'Points: 0'; }
      finally { const syncDot = document.getElementById('syncDot'); if (syncDot) syncDot.style.display = 'none'; }
    }
    async function initAuth(){
      authPill.href = buildRememberedLoginHref('/login.php');
      authPill.textContent = 'Sign in';
      try{
        const r = await fetch('/api/me.php', { credentials:'include', cache:'no-store' });
        const j = await r.json().catch(() => null);
        if (j && j.loggedIn){
          setRememberedUsername(j.username || 'Account');
          authPill.textContent = `Signed in: ${shortName(j.username)}`;
          authPill.href = '/logout.php';
          authPill.title = 'Sign out';
        }
      }catch(e){}
      await refreshPoints();
    }
    function applyThemeTokens(t){
      const root = document.documentElement;
      const pick = (key, fallback) => (typeof t[key] === 'string' && t[key].trim()) ? t[key].trim() : fallback;
      const bg = typeof t.backgroundImage === 'string' ? t.backgroundImage.trim() : '';
      root.style.setProperty('--themeAlpha', pick('themeAlpha', '0.85'));
      root.style.setProperty('--bgUrl', bg ? `url("${bg}")` : 'none');
      root.style.setProperty('--ss-site-bg', pick('siteBackgroundColor', '#0B1220'));
      root.style.setProperty('--ss-panel-bg', pick('panelBackgroundColor', 'rgba(15,23,42,.72)'));
      root.style.setProperty('--ss-section-bg', pick('sectionBackgroundColor', 'rgba(17,27,45,.78)'));
      root.style.setProperty('--ss-card-bg', pick('cardBackgroundColor', 'rgba(26,39,64,.78)'));
      root.style.setProperty('--ss-border', pick('borderColor', 'rgba(42,57,82,.85)'));
      root.style.setProperty('--ss-text', pick('textColor', '#E8EEF7'));
      root.style.setProperty('--ss-muted', pick('mutedTextColor', '#AFC2E0'));
      root.style.setProperty('--ss-accent', pick('accentColor', '#36CFC9'));
      root.style.setProperty('--ss-accent-2', pick('accentSecondaryColor', '#7CC4FF'));
      root.style.setProperty('--ss-button-bg', pick('buttonBackgroundColor', 'rgba(0,0,0,.18)'));
      root.style.setProperty('--ss-button-text', pick('buttonTextColor', '#E8EEF7'));
      root.style.setProperty('--ss-pill-bg', pick('pillBackgroundColor', 'rgba(0,0,0,.18)'));
      root.style.setProperty('--ss-pill-text', pick('pillTextColor', '#E8EEF7'));
      root.style.setProperty('--ss-font', pick('fontFamily', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'));
      root.style.setProperty('--ss-heading-font', pick('headingFontFamily', pick('fontFamily','system-ui, -apple-system, Segoe UI, Roboto, sans-serif')));
    }
    function applyTheme(t){
      const enabled = t && (t.themeEnabled !== false);
      const frogSrc = String((t && (t.frogImage || t.frogSrc)) || '').trim();
      document.body.classList.toggle('theme-on', !!enabled);
      applyThemeTokens(t || {});
      if (frogSrc && enabled){ frogImg.src = frogSrc; frogImg.classList.add('show'); }
      else { frogImg.removeAttribute('src'); frogImg.classList.remove('show'); }
    }
    async function loadTheme(){
      try{ const r = await fetch(THEME_URL + '?t=' + Date.now(), { cache:'no-store' }); if (!r.ok) throw new Error(); applyTheme(await r.json()); }
      catch(e){ applyTheme({ themeEnabled:false }); }
    }

    footerYear();
    Promise.allSettled([loadTheme(), loadCatalog(), initAuth()]).then(() => {
      renderGrid();
      setSeo();
    }).catch(() => {
      renderGrid();
      setSeo();
    });

    window.addEventListener('focus', () => { initAuth().catch(()=>{}); });
    window.addEventListener('pageshow', () => { initAuth().catch(()=>{}); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) initAuth().catch(()=>{}); });
  })();
  
