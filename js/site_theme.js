(function(global){
  const DEFAULTS = Object.freeze({
    themeEnabled: true,
    themeAlpha: 0.85,
    backgroundImage: "jungle_background.png",
    frogImage: "red_eyed_frog.png",
    siteBackgroundColor: "#0B1220",
    panelBackgroundColor: "rgba(15,23,42,.72)",
    sectionBackgroundColor: "rgba(17,27,45,.78)",
    cardBackgroundColor: "rgba(26,39,64,.78)",
    borderColor: "rgba(42,57,82,.85)",
    textColor: "#E8EEF7",
    mutedTextColor: "#AFC2E0",
    accentColor: "#36CFC9",
    accentSecondaryColor: "#7CC4FF",
    buttonBackgroundColor: "#16335D",
    buttonTextColor: "#E8EEF7",
    pillBackgroundColor: "#142848",
    pillTextColor: "#E8EEF7",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    headingFontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    contentMaxWidth: "1180px",
    shellPadding: "18px",
    panelRadius: "18px",
    cardRadius: "16px",
    buttonRadius: "999px",
    pillRadius: "999px",
    panelBlurPx: "10px",
    topbarHeight: "64px",
    sectionGap: "12px",
    shopBannerEnabled: true,
    shopBannerImage: "/98bannerads12/Banner1.png",
    shopBannerHref: "/shop.html",
    shopBannerAlt: "Snapshift Swag Shop banner",
    categoryShopBannerEnabled: true,
    categoryShopBannerImage: "/98bannerads12/Banner1.png",
    categoryShopBannerHref: "/shop.html",
    categoryShopBannerAlt: "Snapshift category shop banner",
  });

  function isObject(value){
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function pickString(theme, key, fallback){
    const value = theme[key];
    return (typeof value === "string" && value.trim()) ? value.trim() : fallback;
  }

  function pickOptionalString(theme, key, fallback){
    if (Object.prototype.hasOwnProperty.call(theme, key)) {
      const value = theme[key];
      return typeof value === "string" ? value.trim() : "";
    }
    return fallback;
  }

  function pickBoolean(theme, key, fallback){
    if (typeof theme[key] === "boolean") return theme[key];
    return fallback;
  }

  function withBust(url, bust){
    const value = String(url || "").trim();
    if (!value) return "";
    return value + (value.includes("?") ? "&" : "?") + "t=" + bust;
  }

  function normalizeAssetPath(value){
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(?:https?:)?\/\//i.test(raw)) return raw;
    if (/^(?:data:|blob:)/i.test(raw)) return raw;
    if (raw.startsWith("/")) return raw;
    return "/" + raw.replace(/^\/+/, "");
  }

  function normalize(theme){
    const source = isObject(theme) ? theme : {};
    const alpha = Number(source.themeAlpha);
    return {
      themeEnabled: pickBoolean(source, "themeEnabled", DEFAULTS.themeEnabled),
      themeAlpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : DEFAULTS.themeAlpha,
      backgroundImage: normalizeAssetPath(pickOptionalString(source, "backgroundImage", DEFAULTS.backgroundImage)),
      frogImage: normalizeAssetPath(pickOptionalString(source, "frogImage", DEFAULTS.frogImage)),
      siteBackgroundColor: pickString(source, "siteBackgroundColor", DEFAULTS.siteBackgroundColor),
      panelBackgroundColor: pickString(source, "panelBackgroundColor", DEFAULTS.panelBackgroundColor),
      sectionBackgroundColor: pickString(source, "sectionBackgroundColor", DEFAULTS.sectionBackgroundColor),
      cardBackgroundColor: pickString(source, "cardBackgroundColor", DEFAULTS.cardBackgroundColor),
      borderColor: pickString(source, "borderColor", DEFAULTS.borderColor),
      textColor: pickString(source, "textColor", DEFAULTS.textColor),
      mutedTextColor: pickString(source, "mutedTextColor", DEFAULTS.mutedTextColor),
      accentColor: pickString(source, "accentColor", DEFAULTS.accentColor),
      accentSecondaryColor: pickString(source, "accentSecondaryColor", DEFAULTS.accentSecondaryColor),
      buttonBackgroundColor: pickString(source, "buttonBackgroundColor", DEFAULTS.buttonBackgroundColor),
      buttonTextColor: pickString(source, "buttonTextColor", DEFAULTS.buttonTextColor),
      pillBackgroundColor: pickString(source, "pillBackgroundColor", DEFAULTS.pillBackgroundColor),
      pillTextColor: pickString(source, "pillTextColor", DEFAULTS.pillTextColor),
      fontFamily: pickString(source, "fontFamily", DEFAULTS.fontFamily),
      headingFontFamily: pickString(source, "headingFontFamily", DEFAULTS.headingFontFamily),
      contentMaxWidth: pickString(source, "contentMaxWidth", DEFAULTS.contentMaxWidth),
      shellPadding: pickString(source, "shellPadding", DEFAULTS.shellPadding),
      panelRadius: pickString(source, "panelRadius", DEFAULTS.panelRadius),
      cardRadius: pickString(source, "cardRadius", DEFAULTS.cardRadius),
      buttonRadius: pickString(source, "buttonRadius", DEFAULTS.buttonRadius),
      pillRadius: pickString(source, "pillRadius", DEFAULTS.pillRadius),
      panelBlurPx: pickString(source, "panelBlurPx", DEFAULTS.panelBlurPx),
      topbarHeight: pickString(source, "topbarHeight", DEFAULTS.topbarHeight),
      sectionGap: pickString(source, "sectionGap", DEFAULTS.sectionGap),
      shopBannerEnabled: pickBoolean(source, "shopBannerEnabled", DEFAULTS.shopBannerEnabled),
      shopBannerImage: normalizeAssetPath(pickOptionalString(source, "shopBannerImage", DEFAULTS.shopBannerImage)),
      shopBannerHref: pickString(source, "shopBannerHref", DEFAULTS.shopBannerHref),
      shopBannerAlt: pickString(source, "shopBannerAlt", DEFAULTS.shopBannerAlt),
      categoryShopBannerEnabled: pickBoolean(source, "categoryShopBannerEnabled", DEFAULTS.categoryShopBannerEnabled),
      categoryShopBannerImage: normalizeAssetPath(pickOptionalString(source, "categoryShopBannerImage", DEFAULTS.categoryShopBannerImage)),
      categoryShopBannerHref: pickString(source, "categoryShopBannerHref", DEFAULTS.categoryShopBannerHref),
      categoryShopBannerAlt: pickString(source, "categoryShopBannerAlt", DEFAULTS.categoryShopBannerAlt),
    };
  }

  function applyTokens(theme){
    const t = normalize(theme);
    const root = document.documentElement;
    root.style.setProperty("--ss-site-bg", t.siteBackgroundColor);
    root.style.setProperty("--ss-panel-bg", t.panelBackgroundColor);
    root.style.setProperty("--ss-section-bg", t.sectionBackgroundColor);
    root.style.setProperty("--ss-card-bg", t.cardBackgroundColor);
    root.style.setProperty("--ss-border", t.borderColor);
    root.style.setProperty("--ss-text", t.textColor);
    root.style.setProperty("--ss-muted", t.mutedTextColor);
    root.style.setProperty("--ss-accent", t.accentColor);
    root.style.setProperty("--ss-accent-2", t.accentSecondaryColor);
    root.style.setProperty("--ss-button-bg", t.buttonBackgroundColor);
    root.style.setProperty("--ss-button-text", t.buttonTextColor);
    root.style.setProperty("--ss-pill-bg", t.pillBackgroundColor);
    root.style.setProperty("--ss-pill-text", t.pillTextColor);
    root.style.setProperty("--ss-font", t.fontFamily);
    root.style.setProperty("--ss-heading-font", t.headingFontFamily || t.fontFamily);
    root.style.setProperty("--ss-content-max", t.contentMaxWidth);
    root.style.setProperty("--ss-shell-pad", t.shellPadding);
    root.style.setProperty("--ss-panel-radius", t.panelRadius);
    root.style.setProperty("--ss-card-radius", t.cardRadius);
    root.style.setProperty("--ss-button-radius", t.buttonRadius);
    root.style.setProperty("--ss-pill-radius", t.pillRadius);
    root.style.setProperty("--ss-panel-blur", t.panelBlurPx);
    root.style.setProperty("--ss-topbar-height", t.topbarHeight);
    root.style.setProperty("--ss-section-gap", t.sectionGap);
    root.style.setProperty("--controlBg", t.buttonBackgroundColor);
    root.style.setProperty("--controlBorder", t.borderColor);
    root.style.setProperty("--controlText", t.buttonTextColor);
    root.style.setProperty("--controlBgAlt", t.sectionBackgroundColor);
    root.setAttribute("data-site-theme-ready", "1");

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) metaThemeColor.setAttribute("content", t.siteBackgroundColor);
    return t;
  }

  function applyRuntime(theme, options){
    const t = normalize(theme);
    const opts = isObject(options) ? options : {};
    const bust = Number.isFinite(Number(opts.bust)) ? Number(opts.bust) : Date.now();
    document.body.classList.toggle("theme-on", t.themeEnabled);
    document.documentElement.style.setProperty("--themeAlpha", String(t.themeAlpha));
    if (t.backgroundImage) {
      document.documentElement.style.setProperty("--bgUrl", `url("${withBust(t.backgroundImage, bust)}")`);
    } else {
      document.documentElement.style.setProperty("--bgUrl", "none");
    }

    const frogEl = opts.frogEl || (opts.frogSelector ? document.querySelector(opts.frogSelector) : null);
    if (frogEl) {
      if (t.frogImage) {
        frogEl.src = withBust(t.frogImage, bust);
        frogEl.style.removeProperty("display");
      } else {
        frogEl.removeAttribute("src");
        frogEl.style.display = "none";
      }
    }
    return t;
  }

  async function load(options){
    const opts = isObject(options) ? options : {};
    const url = String(opts.url || "theme.json");
    const bust = Date.now();
    const response = await fetch(withBust(url, bust), { cache: "no-store" });
    if (!response.ok) throw new Error("Theme load failed");
    const json = await response.json();
    const theme = normalize(json);
    applyTokens(theme);
    applyRuntime(theme, { frogEl: opts.frogEl, frogSelector: opts.frogSelector, bust });
    if (typeof opts.onTheme === "function") opts.onTheme(theme, bust);
    return theme;
  }

  async function init(options){
    applyTokens(DEFAULTS);
    applyRuntime(DEFAULTS, options);
    return load(options);
  }

  global.SnapshiftSiteTheme = {
    defaults: DEFAULTS,
    normalize,
    applyTokens,
    applyRuntime,
    load,
    init,
  };
})(window);
