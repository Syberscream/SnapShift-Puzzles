<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';
require_once __DIR__ . '/../lib/puzzle_card_state.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function snapshift_puzzle_card_state_json(array $payload, int $status = 200): void {
    if (function_exists('snapshift_auth_json')) {
        snapshift_auth_json($payload, $status);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $user = snapshift_auth_current_user();
    if (!$user) {
        snapshift_puzzle_card_state_json([
            'ok' => true,
            'loggedIn' => false,
            'byCategory' => (object)[],
            'byCard' => (object)[],
        ]);
    }

    $input = json_decode((string)file_get_contents('php://input'), true);
    $categories = (is_array($input) && isset($input['categories']) && is_array($input['categories']))
        ? $input['categories']
        : [];
    $cards = (is_array($input) && isset($input['cards']) && is_array($input['cards']))
        ? $input['cards']
        : [];

    $pdo = snapshift_pdo();
    $resolved = snapshift_puzzle_card_state_resolve($pdo, (int)$user['id'], $categories, $cards);

    snapshift_puzzle_card_state_json([
        'ok' => true,
        'loggedIn' => true,
        'uid' => (int)$user['id'],
        'byCategory' => (object)($resolved['byCategory'] ?? []),
        'byCard' => (object)($resolved['byCard'] ?? []),
    ]);
} catch (Throwable $e) {
    snapshift_puzzle_card_state_json([
        'ok' => false,
        'loggedIn' => false,
        'byCategory' => (object)[],
        'byCard' => (object)[],
        'msg' => 'server_error',
    ], 200);
}
