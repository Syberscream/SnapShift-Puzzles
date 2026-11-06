<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

snapshift_only_post();

$input = snapshift_get_json_input();
$email = snapshift_normalize_email((string)($input['email'] ?? ''));

if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $cfg = snapshift_app_config();
    $pdo = snapshift_pdo();

    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM password_reset_tokens prt
        JOIN users u ON u.id = prt.user_id
        WHERE u.email = :email
          AND prt.created_at >= (NOW() - INTERVAL :mins MINUTE)
    ");
    $stmt->bindValue(':email', $email);
    $stmt->bindValue(':mins', (int)$cfg['reset_window_minutes'], PDO::PARAM_INT);
    $stmt->execute();

    $count = (int)$stmt->fetchColumn();
    if ($count < (int)$cfg['reset_email_limit']) {
        $user = snapshift_find_user_by_email($email);
        if ($user) {
            $token = snapshift_issue_token((int)$user['id'], 'password_reset_tokens', (int)$cfg['reset_token_minutes']);
            $resetUrl = rtrim($cfg['app_url'], '/') . '/reset-password.php?token=' . urlencode($token);

            $subject = 'Reset your Snapshift Puzzles password';
            $body = "We received a password reset request for your Snapshift Puzzles account.\n\n" .
                    "Use this link to reset your password:\n{$resetUrl}\n\n" .
                    "If you did not request this, you can ignore this message.";

            snapshift_send_mail($email, $subject, $body);
        }
    }
}

snapshift_json([
    'ok' => true,
    'message' => 'If that email exists, a reset link has been sent.',
]);
