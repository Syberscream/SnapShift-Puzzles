<?php
declare(strict_types=1);

header('Content-Type: application/json');
if (session_status() !== PHP_SESSION_ACTIVE) { session_start(); }

require_once __DIR__ . '/../lib/daily_reward_state.php';

try {
    $uid = snapshift_reward_user_id();
    if ($uid <= 0) {
        echo json_encode([
            'ok' => true,
            'logged_in' => false,
            'loggedIn' => false,
            'claimable' => false,
            'claimable_count' => 0,
            'claim_count' => 0,
            'claimable_days' => [],
            'claim_day' => null,
            'pending_points' => 0,
            'total_reward' => 0,
            'claimed_points' => 0,
            'medals' => ['gold' => 0, 'silver' => 0, 'bronze' => 0],
            'can_claim_today' => false,
            'active_daily_day' => pq_active_daily_day(),
            'default_claim_day' => pq_default_claim_day(),
        ]);
        exit;
    }

    $pdo = pq_db();
    $requestedDay = pq_requested_day();
    $response = snapshift_daily_reward_state_resolve($pdo, $uid, $requestedDay);
    $response['ok'] = true;
    $response['logged_in'] = true;
    $response['loggedIn'] = true;

    echo json_encode($response);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'claimable' => false,
        'msg' => 'Reward status error',
        'error' => $e->getMessage(),
    ]);
}
