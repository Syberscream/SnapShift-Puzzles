<?php
declare(strict_types=1);

function snapshift_app_config(): array {
    return [
        'app_name' => 'Snapshift Puzzles',
        'app_url' => 'https://snapshiftpuzzles.com',
        'mail_from' => 'signup@snapshiftpuzzles.com',
        'mail_from_name' => 'Snapshift Puzzles',
        'mail_return_path' => 'signup@snapshiftpuzzles.com',
        'storage_dir' => __DIR__ . '/../storage',
        'verification_token_minutes' => 24 * 60,
        'reset_token_minutes' => 30,
        'login_email_limit' => 5,
        'login_ip_limit' => 10,
        'login_window_minutes' => 15,
        'reset_email_limit' => 3,
        'reset_window_minutes' => 60,
        'remember_cookie_name' => 'snapshift_remember',
        'remember_days' => 30,
    ];
}
