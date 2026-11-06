<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';
require_once __DIR__ . '/../lib/puzzle_card_state.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function snapshift_trifecta_status_json(array $payload, int $status = 200): void {
    if (function_exists('snapshift_auth_json')) {
        snapshift_auth_json($payload, $status);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function snapshift_trifecta_clean_slug($value, int $maxLen = 64): string {
    $value = substr(trim((string)$value), 0, $maxLen);
    $value = preg_replace('/[^a-z0-9_-]/i', '', $value);
    return strtolower((string)$value);
}

try {
    $user = snapshift_auth_current_user();
    if (!$user) {
        snapshift_trifecta_status_json([
            'ok' => true,
            'loggedIn' => false,
            'trifecta' => ['completed' => false, 'completedDiffs' => [], 'missingDiffs' => ['easy', 'medium', 'hard']],
        ]);
    }

    $uid = (int)($user['id'] ?? 0);
    if ($uid <= 0) {
        snapshift_trifecta_status_json([
            'ok' => true,
            'loggedIn' => false,
            'trifecta' => ['completed' => false, 'completedDiffs' => [], 'missingDiffs' => ['easy', 'medium', 'hard']],
        ]);
    }

    $categoryId = snapshift_trifecta_clean_slug($_GET['category_id'] ?? $_GET['cat'] ?? '', 64);
    $puzzleIdx = max(0, (int)($_GET['puzzle_idx'] ?? $_GET['idx'] ?? 0));
    $puzzleSrc = snapshift_unlock_normalize_src((string)($_GET['puzzle_src'] ?? $_GET['src'] ?? ''));

    if ($categoryId === '' && $puzzleSrc === '') {
        snapshift_trifecta_status_json([
            'ok' => false,
            'loggedIn' => true,
            'msg' => 'missing_scope',
            'trifecta' => ['completed' => false, 'completedDiffs' => [], 'missingDiffs' => ['easy', 'medium', 'hard']],
        ], 200);
    }

    $pdo = snapshift_pdo();
    $completionByKey = snapshift_puzzle_summary_best_by_key($pdo, $uid);
    $trifecta = snapshift_puzzle_card_trifecta_summary($completionByKey, $categoryId, $puzzleIdx, $puzzleSrc);

    snapshift_trifecta_status_json([
        'ok' => true,
        'loggedIn' => true,
        'uid' => $uid,
        'userId' => $uid,
        'username' => (string)($user['username'] ?? ''),
        'categoryId' => $categoryId,
        'puzzleIdx' => $puzzleIdx,
        'puzzleSrc' => $puzzleSrc,
        'trifecta' => $trifecta,
    ]);
} catch (Throwable $e) {
    snapshift_trifecta_status_json([
        'ok' => false,
        'loggedIn' => false,
        'msg' => 'server_error',
        'trifecta' => ['completed' => false, 'completedDiffs' => [], 'missingDiffs' => ['easy', 'medium', 'hard']],
    ], 200);
}
