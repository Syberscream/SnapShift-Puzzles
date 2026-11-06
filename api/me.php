<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/auth_core.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$user = function_exists('snapshift_auth_current_user')
    ? snapshift_auth_current_user()
    : snapshift_current_user();

if (!$user) {
    snapshift_json([
        'ok' => true,
        'loggedIn' => false,
        'id' => null,
        'uid' => null,
        'userId' => null,
        'username' => null,
        'userTag' => null,
        'email' => null,
        'emailVerified' => false,
        'status' => 'guest',
        'points' => 0,
        'supporter' => [
            'active' => false,
            'plan' => null,
            'badgeLabel' => 'Supporter',
            'startedAt' => null,
            'lastAwardedAt' => null,
            'nextBonusAt' => null,
            'bonusAmount' => 250,
            'bonusIntervalDays' => 30,
            'bonusAwardedPoints' => 0,
        ],
    ]);
}

$pdo = snapshift_pdo();
$supporter = snapshift_auth_supporter_state($pdo, (int)$user['id'], true);

$username = (string)($user['username'] ?? '');
$status = (string)($user['status'] ?? 'active');

snapshift_json([
    'ok' => true,
    'loggedIn' => true,
    'id' => (int)$user['id'],
    'uid' => (int)$user['id'],
    'userId' => (int)$user['id'],
    'username' => $username,
    'userTag' => $username !== '' ? ('u:' . $username) : null,
    'email' => (string)($user['email'] ?? ''),
    'emailVerified' => (bool)($user['email_verified'] ?? false),
    'status' => $status,
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
