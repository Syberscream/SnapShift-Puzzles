<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/auth_core.php';

try {
    $user = snapshift_auth_current_user();
    if (!$user) {
        snapshift_auth_json([
            'ok' => true,
            'loggedIn' => false,
            'points' => 0,
            'supporter' => [
                'active' => false,
                'badgeLabel' => 'Supporter',
                'bonusAmount' => snapshift_auth_supporter_bonus_amount(),
                'bonusIntervalDays' => snapshift_auth_supporter_bonus_interval_days(),
                'bonusAwardedPoints' => 0,
            ],
        ]);
    }

    $uid = (int)$user['id'];
    $pdo = snapshift_pdo();
    $supporter = snapshift_auth_supporter_state($pdo, $uid, true);

    snapshift_auth_json([
        'ok' => true,
        'loggedIn' => true,
        'user_id' => $uid,
        'points' => (int)($supporter['points'] ?? 0),
        'supporter' => [
            'active' => (bool)($supporter['active'] ?? false),
            'plan' => $supporter['plan'] ?? null,
            'badgeLabel' => $supporter['badge_label'] ?? 'Supporter',
            'startedAt' => $supporter['started_at'] ?? null,
            'lastAwardedAt' => $supporter['last_awarded_at'] ?? null,
            'nextBonusAt' => $supporter['next_bonus_at'] ?? null,
            'bonusAmount' => (int)($supporter['bonus_amount'] ?? 250),
            'bonusIntervalDays' => (int)($supporter['bonus_interval_days'] ?? 30),
            'bonusAwardedPoints' => (int)($supporter['bonus_awarded_points'] ?? 0),
        ],
    ]);
} catch (Throwable $e) {
    snapshift_auth_json([
        'ok' => false,
        'error' => $e->getMessage(),
    ], 500);
}
