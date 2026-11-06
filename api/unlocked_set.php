<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';
require_once __DIR__ . '/../lib/puzzle_unlock_state.php';

try {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        snapshift_auth_json(['ok' => false, 'error' => 'method_not_allowed'], 405);
    }

    $user = snapshift_auth_require_login();
    $pdo = snapshift_pdo();
    $uid = (int)$user['id'];

    $data = snapshift_auth_get_json_input();
    $incoming = snapshift_unlock_clean_map($data['unlocked'] ?? []);

    $pdo->prepare(
        "INSERT INTO user_state (user_id, points, unlocked_json)
         VALUES (?, 0, '{}')
         ON DUPLICATE KEY UPDATE user_id = user_id"
    )->execute([$uid]);

    $json = json_encode($incoming, JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('json_encode_failed');
    }

    $st = $pdo->prepare("UPDATE user_state SET unlocked_json = ? WHERE user_id = ?");
    $st->execute([$json, $uid]);

    snapshift_auth_json([
        'ok' => true,
        'loggedIn' => true,
        'user_id' => $uid,
        'schema' => 'source_ids_v2',
        'unlocked' => (object)$incoming,
    ]);
} catch (Throwable $e) {
    snapshift_auth_json([
        'ok' => false,
        'loggedIn' => false,
        'error' => $e->getMessage(),
    ], 500);
}
