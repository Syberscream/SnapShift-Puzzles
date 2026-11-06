(function(global){
  const FOOTER_LINKS = [
    { href: "/about.html", label: "About" },
    { href: "/faq.html", label: "FAQ" },
    { href: "/privacy.html", label: "Privacy" },
    { href: "/terms.html", label: "Terms" },
    { href: "/contact.html", label: "Contact" },
    { href: "/daily-archive.html", label: "Daily Archive" },
  ];

  function normalizePath(value){
    const raw = String(value || "").trim();
    if (!raw) return "/";
    try{
      return new URL(raw, global.location.origin).pathname.replace(/\/+$/, "") || "/";
    }catch(e){
      return raw.replace(/\/+$/, "") || "/";
    }
  }

  function markCurrentLinks(root){
    const current = normalizePath(global.location.pathname);
    (root || document).querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const linkPath = normalizePath(href);
      if (linkPath === current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function syncFooter(){
    const footer = document.querySelector(".siteFooter");
    if (!footer) return;

    const yearEl = footer.querySelector("#footerYear");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    let linksWrap = footer.querySelector(".footerLinks");
    if (!linksWrap) {
      linksWrap = document.createElement("div");
      linksWrap.className = "footerLinks";
      footer.appendChild(linksWrap);
    }

    linksWrap.innerHTML = FOOTER_LINKS.map((item) =>
      `<a class="footerLink" href="${item.href}">${item.label}</a>`
    ).join("");

    markCurrentLinks(footer);
  }

  function ensureFrog(){
    let frog = document.querySelector("#frogImg");
    if (frog) return frog;
    if (!document.body) return null;
    frog = document.createElement("img");
    frog.id = "frogImg";
    frog.className = "frog";
    frog.alt = "";
    frog.setAttribute("aria-hidden", "true");
    document.body.appendChild(frog);
    return frog;
  }

  async function refreshTheme(){
    if (!global.SnapshiftSiteTheme || typeof global.SnapshiftSiteTheme.load !== "function") return;
    try{
      ensureFrog();
      await global.SnapshiftSiteTheme.load({
        url: "/theme.json",
        frogSelector: "#frogImg",
      });
    }catch(e){
      try{
        global.SnapshiftSiteTheme.applyTokens(global.SnapshiftSiteTheme.defaults || {});
        global.SnapshiftSiteTheme.applyRuntime(global.SnapshiftSiteTheme.defaults || {}, {
          frogSelector: "#frogImg",
        });
      }catch(inner){}
    }
  }

  function bindRefreshes(){
    if (global.__snapshiftSiteChromeBound) return;
    global.__snapshiftSiteChromeBound = true;
    global.addEventListener("focus", () => { refreshTheme().catch(() => {}); });
    global.addEventListener("pageshow", () => { refreshTheme().catch(() => {}); });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshTheme().catch(() => {});
    });
  }

  async function init(){
    bindRefreshes();
    syncFooter();
    markCurrentLinks(document);
    await refreshTheme();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { init().catch(() => {}); }, { once: true });
  } else {
    init().catch(() => {});
  }
})(window);
