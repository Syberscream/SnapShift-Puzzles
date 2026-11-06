<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

snapshift_only_post();
snapshift_start_session();

$input = snapshift_get_json_input();
$email = snapshift_normalize_email((string)($input['email'] ?? ''));
$password = (string)($input['password'] ?? '');
$remember = !empty($input['remember']);
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
    snapshift_json(['ok' => false, 'error' => 'Invalid login.'], 422);
}

snapshift_rate_limit_login($email, $ip);

$user = snapshift_find_user_by_email($email);
$ok = false;

if ($user && $user['status'] === 'active' && password_verify($password, $user['password_hash'])) {
    $ok = true;
}

snapshift_log_login_attempt($email, $ip, $ok);

if (!$ok) {
    snapshift_json(['ok' => false, 'error' => 'Invalid email or password.'], 401);
}

session_regenerate_id(true);
$_SESSION['user_id'] = (int)$user['id'];

$pdo = snapshift_pdo();
$stmt = $pdo->prepare("UPDATE users SET last_login_at = NOW() WHERE id = :id");
$stmt->execute([':id' => (int)$user['id']]);

if ($remember) {
    snapshift_issue_remember_token((int)$user['id']);
} else {
    snapshift_clear_remember_token();
}

snapshift_json([
    'ok' => true,
    'loggedIn' => true,
    'username' => $user['username'],
    'emailVerified' => (bool)$user['email_verified'],
]);
