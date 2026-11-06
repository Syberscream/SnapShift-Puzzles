<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

snapshift_only_post();
$input = snapshift_get_json_input();

$token = trim((string)($input['token'] ?? ''));
$newPassword = (string)($input['new_password'] ?? '');

if ($token === '' || strlen($newPassword) < 8) {
    snapshift_json(['ok' => false, 'error' => 'Invalid reset request.'], 422);
}

$pdo = snapshift_pdo();
$tokenHash = snapshift_token_hash($token);

$stmt = $pdo->prepare("
    SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
    FROM password_reset_tokens prt
    WHERE prt.token_hash = :token_hash
    LIMIT 1
");
$stmt->execute([':token_hash' => $tokenHash]);
$row = $stmt->fetch();

if (!$row || $row['used_at'] !== null || strtotime((string)$row['expires_at']) < time()) {
    snapshift_json(['ok' => false, 'error' => 'That reset link is invalid or expired.'], 400);
}

$pdo->beginTransaction();

try {
    $stmt = $pdo->prepare("UPDATE users SET password_hash = :password_hash WHERE id = :id");
    $stmt->execute([
        ':password_hash' => snapshift_password_hash($newPassword),
        ':id' => (int)$row['user_id'],
    ]);

    $stmt = $pdo->prepare("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = :id");
    $stmt->execute([':id' => (int)$row['id']]);

    $stmt = $pdo->prepare("
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE user_id = :user_id
          AND used_at IS NULL
          AND id <> :id
    ");
    $stmt->execute([
        ':user_id' => (int)$row['user_id'],
        ':id' => (int)$row['id'],
    ]);

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    snapshift_json(['ok' => false, 'error' => 'Password reset failed.'], 500);
}

snapshift_json([
    'ok' => true,
    'message' => 'Password updated. You can now sign in.',
]);
