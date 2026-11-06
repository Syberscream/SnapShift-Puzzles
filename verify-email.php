<?php
declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

$token = trim((string)($_GET['token'] ?? ''));
$message = 'Invalid or expired verification link.';
$success = false;

if ($token !== '') {
    $pdo = snapshift_pdo();
    $tokenHash = snapshift_token_hash($token);

    $stmt = $pdo->prepare("
        SELECT evt.id, evt.user_id, evt.expires_at, evt.used_at
        FROM email_verification_tokens evt
        WHERE evt.token_hash = :token_hash
        LIMIT 1
    ");
    $stmt->execute([':token_hash' => $tokenHash]);
    $row = $stmt->fetch();

    if ($row && $row['used_at'] === null && strtotime((string)$row['expires_at']) >= time()) {
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("
                UPDATE users
                SET email_verified = 1, email_verified_at = NOW()
                WHERE id = :id
            ");
            $stmt->execute([':id' => (int)$row['user_id']]);

            $stmt = $pdo->prepare("UPDATE email_verification_tokens SET used_at = NOW() WHERE id = :id");
            $stmt->execute([':id' => (int)$row['id']]);

            $pdo->commit();
            $success = true;
            $message = 'Email verified. You can now sign in.';
        } catch (Throwable $e) {
            $pdo->rollBack();
            $message = 'Verification failed. Please try again.';
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verify Email • Snapshift Puzzles</title>
  <style>
    body{margin:0;background:#000;color:#e8eef7;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}
    .card{max-width:560px;width:100%;border-radius:18px;border:1px solid rgba(42,57,82,.7);background:rgba(15,23,42,.82);padding:24px}
    a{color:#b8d1ff}
  </style>
</head>
<body>
  <div class="card">
    <h1><?php echo $success ? 'Verified' : 'Verification Issue'; ?></h1>
    <p><?php echo htmlspecialchars($message, ENT_QUOTES, 'UTF-8'); ?></p>
    <p><a href="/login.php">Go to login</a></p>
  </div>
</body>
</html>
