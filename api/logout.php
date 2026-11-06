<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

snapshift_logout_current_session(true);

// Optional UI convenience cookie. Clear it on logout so shared browsers do not
// keep suggesting the previous account name after sign-out.
snapshift_cookie_clear('snapshift_remembered_username');

snapshift_json([
    'ok' => true,
    'loggedIn' => false,
]);
