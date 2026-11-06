/* visit tracking (server-side) */
(function() {
  try {
    var page = ("index");
    if (!page) page = "unknown";
    fetch("/api/visit_track.php?page=" + encodeURIComponent(page), { credentials: "include", cache: "no-store" })
      .catch(function(){});
  } catch (e) {}
})();
