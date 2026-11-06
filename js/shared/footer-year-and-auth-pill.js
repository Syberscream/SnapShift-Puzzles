    (function(){
      var y = document.getElementById('footerYear');
      if (y) y.textContent = new Date().getFullYear();

      var m = document.cookie.match(/(?:^|; )snapshift_remembered_username=([^;]+)/);
      var auth = document.getElementById('authPill');
      if (m && auth) {
        try {
          auth.href = '/login.php?username=' + encodeURIComponent(decodeURIComponent(m[1]));
        } catch (e) {
          auth.href = '/login.php?username=' + encodeURIComponent(m[1]);
        }
      }
    })();
  
