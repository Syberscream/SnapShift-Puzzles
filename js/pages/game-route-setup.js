    (function(){
      try{
        var href = String(location.href || "");
        if (/[?#&](?:cat|src|puzzle|daily|resume)=/i.test(href)) {
          document.documentElement.classList.add("pq-preload-route");
        }
        if (href.indexOf("daily=") !== -1 || href.indexOf("resume=") !== -1) {
          document.documentElement.classList.add("pq-preload-daily");
        }
      }catch(e){}
    })();
  
