<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';
require_once __DIR__ . '/../lib/puzzle_unlock_state.php';

try {
    $user = snapshift_auth_current_user();
    if (!$user) {
        snapshift_auth_json([
            'ok' => true,
            'loggedIn' => false,
            'unlocked' => (object)[]
        ]);
    }

    $pdo = snapshift_pdo();
    $uid = (int)$user['id'];
    $unlocked = snapshift_fetch_unlocks($pdo, $uid);

    snapshift_auth_json([
        'ok' => true,
        'loggedIn' => true,
        'user_id' => $uid,
        'schema' => 'source_ids_v2',
        'unlocked' => (object)$unlocked,
    ]);
} catch (Throwable $e) {
    snapshift_auth_json([
        'ok' => false,
        'loggedIn' => false,
        'error' => $e->getMessage(),
    ], 500);
}
