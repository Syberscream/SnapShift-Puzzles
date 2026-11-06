/* visit tracking (server-side) */
(function() {
  try {
    var page = ((function(){try{var u=new URL(location.href);var c=u.searchParams.get("cat")||"";return c?("cat_"+c):"category";}catch(e){return "category";}})());
    if (!page) page = "unknown";
    fetch("/api/visit_track.php?page=" + encodeURIComponent(page), { credentials: "include", cache: "no-store" })
      .catch(function(){});
  } catch (e) {}
})();
