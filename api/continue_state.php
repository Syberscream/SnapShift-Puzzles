<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/continue_state.php';

try {
    $user = snapshift_auth_current_user();
    $pdo = snapshift_pdo();
    snapshift_auth_json(snapshift_continue_state_resolve($pdo, $user));
} catch (Throwable $e) {
    snapshift_auth_json([
        'ok' => false,
        'loggedIn' => false,
        'continue_state' => [
            'has_progress' => false,
            'progress' => null,
            'target' => null,
            'ui' => [
                'action' => 'none',
                'main_label' => 'All Caught Up',
                'sub_label' => '',
                'title' => 'You have no unfinished puzzle to resume',
            ],
        ],
        'msg' => 'server_error',
        'debug_error' => $e->getMessage(),
        'debug_error_class' => get_class($e),
    ], 200);
}
