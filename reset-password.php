<?php
declare(strict_types=1);
$token = trim((string)($_GET['token'] ?? ''));
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reset Password • Snapshift Puzzles</title>
  <style>
    body{margin:0;background:#000;color:#e8eef7;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}
    .card{max-width:560px;width:100%;border-radius:18px;border:1px solid rgba(42,57,82,.7);background:rgba(15,23,42,.82);padding:24px}
    label{display:block;margin:0 0 8px;font-weight:800}
    input,button{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(42,57,82,.7);padding:12px 14px}
    input{background:#0e1625;color:#e8eef7;margin-bottom:14px}
    button{background:#1f4fd7;color:#fff;font-weight:900;cursor:pointer}
    .msg{margin-top:14px;line-height:1.5}
  </style>
</head>
<body>
  <div class="card">
    <h1>Reset Password</h1>
    <form id="resetForm">
      <label for="password">New Password</label>
      <input id="password" name="password" type="password" minlength="8" required>
      <button type="submit">Set New Password</button>
    </form>
    <div class="msg" id="msg"></div>
  </div>
  <script>
    const token = <?php echo json_encode($token, JSON_UNESCAPED_SLASHES); ?>;
    const form = document.getElementById('resetForm');
    const msg = document.getElementById('msg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = 'Working...';
      const password = document.getElementById('password').value;
      try {
        const r = await fetch('/api/reset_password.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, new_password: password })
        });
        const j = await r.json();
        msg.textContent = j.message || j.error || 'Done.';
      } catch (err) {
        msg.textContent = 'Reset failed.';
      }
    });
  </script>
</body>
</html>
