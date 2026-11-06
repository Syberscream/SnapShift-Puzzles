/* visit tracking (server-side) */
(function () {
  var DID = false;

  function getParam(name) {
    try {
      var u = new URL(location.href);
      var v = u.searchParams.get(name);
      if (v !== null && v !== "") return v;

      // Also support hash-based params: #cat=...&src=...&puzzle=...&daily=...
      var h = (location.hash || "");
      if (h.startsWith("#")) h = h.slice(1);
      if (h.startsWith("!")) h = h.slice(1);
      var hp = new URLSearchParams(h);
      v = hp.get(name);
      return (v === null ? "" : v);
    } catch (e) {
      return "";
    }
  }

  function safeDecode(s) {
    try { return decodeURIComponent(String(s || "").replace(/\+/g, " ")); }
    catch (e) { return String(s || ""); }
  }

  function basenameNoExt(p) {
    if (!p) return "";
    try {
      p = String(p);
      var q = p.split("?")[0].split("#")[0];
      var parts = q.split("/");
      var file = parts[parts.length - 1] || "";
      file = safeDecode(file);
      return file.replace(/\.[^.]+$/, "");
    } catch (e) {
      return "";
    }
  }

  function slugify(s) {
    s = String(s || "").trim().toLowerCase();
    if (!s) return "";
    // keep letters/numbers, convert spaces/punct to hyphens
    s = s.replace(/\+/g, " ");
    s = s.replace(/[^a-z0-9]+/g, "-");
    s = s.replace(/^-+|-+$/g, "");
    s = s.replace(/-+/g, "-");
    return s;
  }

  function computePage() {
    var cat = safeDecode(getParam("cat")).toLowerCase().trim();
    if (!cat) return "";

    var isDaily = !!safeDecode(getParam("daily")).trim();

    // Prefer explicit puzzle name; fall back to src filename
    var puzzleName = safeDecode(getParam("puzzle")).trim();
    var src = safeDecode(getParam("src")).trim();
    var base = basenameNoExt(src);
    var slug = slugify(puzzleName || base);

    // If we still can't identify the puzzle, don't log (avoids generic rows like 'game'/'daily')
    if (!slug) return "";

    return (isDaily ? "daily_" : "game_") + cat + "_" + slug;
  }

  function pingOnce() {
    if (DID) return;
    var page = computePage();
    if (!page) return; // wait for URL params to be ready
    DID = true;
    try {
      fetch("/api/visit_track.php?page=" + encodeURIComponent(page), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        keepalive: true
      }).catch(function () { });
    } catch (e) { }
  }

  // Try immediately, then after a short delay (some builds rewrite hash on load).
  pingOnce();
  setTimeout(pingOnce, 600);

  // If hash params arrive slightly later, we'll catch it once.
  window.addEventListener("hashchange", function () { setTimeout(pingOnce, 50); });
  window.addEventListener("popstate", function () { setTimeout(pingOnce, 50); });
})();
