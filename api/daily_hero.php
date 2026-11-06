<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/daily_hero_state.php';

try {
    $user = snapshift_auth_current_user();
    $pdo = snapshift_pdo();
    $payload = snapshift_daily_hero_resolve($pdo, $user);
    snapshift_auth_json($payload);
} catch (Throwable $e) {
    snapshift_auth_json([
        'ok' => false,
        'loggedIn' => false,
        'error' => 'daily_hero_error',
        'message' => $e->getMessage(),
    ], 500);
}
