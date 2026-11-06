<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sign In • Snapshift Puzzles</title>
  <style>
:root{
  --bg:#000000;
  --text:#e8eef7;
  --line:rgba(42,57,82,.7);
  --pill:rgba(0,0,0,.18);
  --card:rgba(15,23,42,.82);
  --muted:#a9b9d6;
  --primary:#2f63e3;
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  color:var(--text);
  background:var(--bg);
  font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
}
.screen{position:relative;z-index:1;min-height:100vh}
.shell{width:min(1200px,100%);margin:0 auto;padding:18px}
.topbar{
  display:flex;align-items:flex-end;justify-content:space-between;gap:12px;
  padding:10px 6px 14px;flex-wrap:wrap;
}
.brand{display:flex;align-items:center;gap:12px;min-width:240px}
.logoImg{
  height:75px;width:auto;max-width:750px;object-fit:contain;display:block;
  filter:drop-shadow(0 10px 26px rgba(0,0,0,.25));
}
.right{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.pill,.btnSoft,.btnPrimary{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  min-height:32px;padding:7px 10px;border-radius:999px;border:1px solid var(--line);
  color:var(--text);font-weight:800;font-size:12px;letter-spacing:.2px;line-height:1;
  text-decoration:none;white-space:nowrap;
}
.pill,.btnSoft{background:var(--pill)}
.btnPrimary{background:var(--primary);border-color:rgba(129,176,255,.55);color:#fff}
.authCard{
  width:min(560px,100%);
  margin:12px auto 0;
  border-radius:20px;
  border:1px solid rgba(36,48,69,.85);
  background:var(--card);
  padding:24px;
  box-shadow:0 24px 80px rgba(0,0,0,.34);
}
.authCard h1{margin:0 0 8px;font-size:32px;line-height:1.05}
.authLead{margin:0 0 18px;color:#d8e2f5;line-height:1.55;font-weight:700}
.authGrid{display:grid;gap:14px}
label{display:block;font-size:13px;font-weight:900;margin:0 0 7px}
input{
  width:100%;border-radius:14px;border:1px solid var(--line);background:#0f1726;color:var(--text);
  padding:13px 14px;font-size:15px;outline:none;
}
input::placeholder{color:#8ca0bf}
input:focus{border-color:rgba(129,176,255,.6);box-shadow:0 0 0 3px rgba(47,99,227,.16)}
.authActions{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.authLinks{margin-top:16px;display:flex;gap:12px;flex-wrap:wrap}
.msg{margin-top:14px;line-height:1.55;font-weight:700}
.msg.error{color:#ffb3b3}
.msg.success{color:#aef1c1}
.checkRow{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:800;color:#d8e2f5}
.checkRow input{width:auto;margin:0;padding:0;accent-color:#2f63e3}
.siteFooter{
  margin-top:18px;display:flex;justify-content:space-between;align-items:center;gap:10px;
  padding:8px 6px 2px;flex-wrap:wrap;opacity:.95
}
.footerMeta{opacity:.86;font-size:12px;font-weight:800}
.footerLinks{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.footerLink{
  display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border-radius:999px;
  border:1px solid var(--line);background:var(--pill);color:var(--text);font-weight:800;
  font-size:12px;letter-spacing:.2px;text-decoration:none;min-height:32px
}
@media (max-width:640px){
  .topbar{padding:10px 6px 14px}
  .logoImg{height:60px}
  .right{width:100%;justify-content:flex-start}
  .authCard{padding:18px}
  .siteFooter{justify-content:center;text-align:center}
  .footerLinks{justify-content:center;width:100%}
}
  </style>
</head>
<body>
  <div class="screen">
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <a href="/index.html" aria-label="Snapshift Puzzles home">
            <img class="logoImg" src="Snapshift_Puzzles_Logo.png" onerror="this.onerror=null;this.src='PuzzleQuest_Logo.png'" alt="Snapshift Puzzles" />
          </a>
        </div>
        <div class="right">
          <a class="btnSoft" href="/index.html">← Home</a>
          <a class="btnSoft" href="/shop.html">Shop</a>
        </div>
      </header>

      <section class="authCard">
        <h1>Sign In</h1>
        <p class="authLead">Sign in with your Snapshift email and password.</p>

        <form id="loginForm" class="authGrid">
          <div>
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com">
          </div>
          <div>
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Your password">
          </div>
          <label class="checkRow" for="remember">
            <input id="remember" name="remember" type="checkbox" checked>
            Keep me signed in on this device
          </label>
          <div class="authActions">
            <button class="btnPrimary" type="submit">Sign In</button>
          </div>
          <div id="msg" class="msg" aria-live="polite"></div>
        </form>

        <div class="authLinks">
          <a class="pill" href="/signup.php">Create account</a>
          <a class="pill" href="/forgot-password.php">Forgot password?</a>
        </div>
      </section>

      <footer class="siteFooter">
        <div class="footerMeta">© <span id="footerYear"></span> Snapshift Puzzles</div>
        <div class="footerLinks">
          <a class="footerLink" href="/about.html">About</a>
          <a class="footerLink" href="/contact.html">Contact</a>
          <a class="footerLink" href="/daily-archive.html">Daily Archive</a>
        </div>
      </footer>
    </div>
  </div>
  <script>
    document.getElementById('footerYear').textContent = String(new Date().getFullYear());

    const msg = document.getElementById('msg');
    const form = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const rememberInput = document.getElementById('remember');
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('return') || '/index.html';

    try{
      const saved = localStorage.getItem('snapshift_last_email') || '';
      if (saved && !emailInput.value) emailInput.value = saved;
    }catch(e){}

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.className = 'msg';
      msg.textContent = 'Signing in...';

      const payload = {
        email: emailInput.value.trim(),
        password: document.getElementById('password').value,
        remember: !!rememberInput.checked
      };

      try{
        localStorage.setItem('snapshift_last_email', payload.email);
      }catch(e){}

      try{
        const r = await fetch('/api/login.php', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload),
          credentials:'include'
        });
        const j = await r.json().catch(() => ({}));

        if (!r.ok || !j.ok) {
          msg.className = 'msg error';
          msg.textContent = j.error || 'Sign in failed.';
          return;
        }

        msg.className = 'msg success';
        msg.textContent = 'Signed in. Redirecting...';
        window.location.href = returnTo || '/index.html';
      }catch(err){
        msg.className = 'msg error';
        msg.textContent = 'Sign in failed.';
      }
    });
  </script>
</body>
</html>
