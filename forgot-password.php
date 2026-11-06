<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Forgot Password • Snapshift Puzzles</title>
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
.authFine{margin-top:16px;color:var(--muted);font-size:13px;line-height:1.6}
.authLinks{margin-top:16px;display:flex;gap:12px;flex-wrap:wrap}
.msg{margin-top:14px;line-height:1.55;font-weight:700}
.msg.error{color:#ffb3b3}
.msg.success{color:#aef1c1}
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
        <h1>Forgot Password</h1>
        <p class="authLead">Enter your email and we’ll send a reset link if the account exists.</p>
        
<form id="forgotForm" class="authGrid">
  <div>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com">
  </div>
  <div class="authActions">
    <button class="btnPrimary" type="submit">Send Reset Link</button>
  </div>
  <div id="msg" class="msg" aria-live="polite"></div>
</form>
<div class="authLinks">
  <a class="pill" href="/login.php">Back to sign in</a>
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
document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'msg';
  msg.textContent = 'Sending...';
  const payload = { email: document.getElementById('email').value.trim() };
  try{
    const r = await fetch('/api/forgot_password.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(() => ({}));
    msg.className = r.ok && j.ok ? 'msg success' : 'msg error';
    msg.textContent = j.message || j.error || 'Request failed.';
  }catch(err){
    msg.className = 'msg error';
    msg.textContent = 'Request failed.';
  }
});

  </script>
</body>
</html>