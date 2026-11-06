<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';
require_once __DIR__ . '/../lib/puzzle_unlock_action.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function snapshift_puzzle_unlock_apply_json(array $payload, int $status = 200): void {
    if (function_exists('snapshift_auth_json')) {
        snapshift_auth_json($payload, $status);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        snapshift_puzzle_unlock_apply_json([
            'ok' => false,
            'loggedIn' => false,
            'error_code' => 'method_not_allowed',
            'msg' => 'Method not allowed.',
        ], 405);
    }

    $user = snapshift_auth_current_user();
    if (!$user) {
        snapshift_puzzle_unlock_apply_json([
            'ok' => false,
            'loggedIn' => false,
            'error_code' => 'login_required',
            'msg' => 'Please sign in to unlock puzzles with points.',
        ], 200);
    }

    $input = snapshift_auth_get_json_input();
    $pdo = snapshift_pdo();
    $result = snapshift_unlock_action_apply($pdo, (int)$user['id'], $input);
    snapshift_puzzle_unlock_apply_json($result, 200);
} catch (Throwable $e) {
    error_log('puzzle_unlock_apply failed: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    snapshift_puzzle_unlock_apply_json([
        'ok' => false,
        'loggedIn' => false,
        'error_code' => 'server_error',
        'msg' => 'Could not unlock this puzzle right now.',
    ], 200);
}
