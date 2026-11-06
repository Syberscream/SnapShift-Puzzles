<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/state_core.php';
require_once __DIR__ . '/../lib/auth_core.php';
require_once __DIR__ . '/../lib/puzzle_completion_summary.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function snapshift_progress_summary_json(array $payload, int $status = 200): void {
    if (function_exists('snapshift_auth_json')) {
        snapshift_auth_json($payload, $status);
    }
    if (function_exists('snapshift_json')) {
        snapshift_json($payload, $status);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $user = function_exists('snapshift_auth_current_user')
        ? snapshift_auth_current_user()
        : snapshift_current_user();

    if (!$user) {
        snapshift_progress_summary_json([
            'ok' => true,
            'loggedIn' => false,
            'uid' => null,
            'userId' => null,
            'username' => null,
            'byKey' => (object)[],
        ]);
    }

    $uid = (int)($user['id'] ?? 0);
    $username = (string)($user['username'] ?? '');
    if ($uid <= 0) {
        snapshift_progress_summary_json([
            'ok' => true,
            'loggedIn' => false,
            'uid' => null,
            'userId' => null,
            'username' => null,
            'byKey' => (object)[],
        ]);
    }

    $pdo = snapshift_pdo();
    $bestByKey = snapshift_puzzle_summary_best_by_key($pdo, $uid);

    snapshift_progress_summary_json([
        'ok' => true,
        'loggedIn' => true,
        'uid' => $uid,
        'userId' => $uid,
        'username' => $username,
        'byKey' => (object)$bestByKey,
    ]);
} catch (Throwable $e) {
    snapshift_progress_summary_json([
        'ok' => false,
        'loggedIn' => false,
        'uid' => null,
        'userId' => null,
        'username' => null,
        'byKey' => (object)[],
        'msg' => 'server_error',
    ], 200);
}
