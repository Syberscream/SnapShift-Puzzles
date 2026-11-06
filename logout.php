<?php
declare(strict_types=1);
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Signing out • Snapshift Puzzles</title>
  <style>
    body{margin:0;background:#000;color:#e8eef7;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:grid;place-items:center;min-height:100vh}
    .card{max-width:460px;width:min(460px,calc(100vw - 32px));padding:24px;border-radius:18px;border:1px solid rgba(42,57,82,.7);background:rgba(15,23,42,.82)}
  </style>
</head>
<body>
  <div class="card">Signing out...</div>
  <script>
    (async () => {
      try{
        await fetch('/api/logout.php', { method:'POST', credentials:'include' });
      }catch(e){}
      window.location.href = '/index.html';
    })();
  </script>
</body>
</html>
