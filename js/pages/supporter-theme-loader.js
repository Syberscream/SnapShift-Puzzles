(() => {
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

  async function applyThemeFromJson(){
    try{
      const r = await fetch('/theme.json?t=' + Date.now(), { cache:'no-store' });
      if (!r.ok) return;
      const t = await r.json();
      applyAdminThemeTokens(t);
    }catch(e){}
  }
  applyThemeFromJson().catch(()=>{});
})();
