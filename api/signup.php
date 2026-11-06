<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

snapshift_only_post();
snapshift_start_session();

$input = snapshift_get_json_input();
$email = snapshift_normalize_email((string)($input['email'] ?? ''));
$username = trim((string)($input['username'] ?? ''));
$password = (string)($input['password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    snapshift_json(['ok' => false, 'error' => 'Please enter a valid email address.'], 422);
}

if (!snapshift_validate_username($username)) {
    snapshift_json(['ok' => false, 'error' => 'Username must be 3-20 characters and use letters, numbers, underscores, or hyphens.'], 422);
}

if (strlen($password) < 8) {
    snapshift_json(['ok' => false, 'error' => 'Password must be at least 8 characters long.'], 422);
}

if (snapshift_find_user_by_email($email)) {
    snapshift_json(['ok' => false, 'error' => 'That email is already in use.'], 409);
}

if (snapshift_find_user_by_username($username)) {
    snapshift_json(['ok' => false, 'error' => 'That username is already taken.'], 409);
}

$pdo = snapshift_pdo();
$stmt = $pdo->prepare("
    INSERT INTO users (email, username, password_hash)
    VALUES (:email, :username, :password_hash)
");
$stmt->execute([
    ':email' => $email,
    ':username' => $username,
    ':password_hash' => snapshift_password_hash($password),
]);

$userId = (int)$pdo->lastInsertId();
$cfg = snapshift_app_config();
$token = snapshift_issue_token($userId, 'email_verification_tokens', (int)$cfg['verification_token_minutes']);
$verifyUrl = rtrim($cfg['app_url'], '/') . '/verify-email.php?token=' . urlencode($token);

$subject = 'Verify your Snapshift Puzzles account';
$body = "Welcome to Snapshift Puzzles!\n\n" .
        "Please verify your email by visiting this link:\n{$verifyUrl}\n\n" .
        "If you did not create this account, you can ignore this message.";

$mailSent = snapshift_send_mail($email, $subject, $body);

if (!$mailSent) {
    snapshift_json([
        'ok' => false,
        'error' => 'Account created, but we could not send the verification email from signup@snapshiftpuzzles.com right now. Please try again later.',
    ], 500);
}

snapshift_json([
    'ok' => true,
    'message' => 'Account created. Please check your email to verify your account.',
]);
