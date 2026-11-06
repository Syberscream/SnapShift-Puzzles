<?php
/**
 * Copy this file to config.local.php (same folder) and fill in the real values.
 * config.local.php is git-ignored, so passwords never end up in the repository.
 *
 * Any of these keys can also be supplied as environment variables instead.
 * lib/site_config.php also looks for ../public_html_work.local.php and
 * ../snapshift.local.php (one level above the web root) before this file.
 */
return [
    // Database (MySQL / MariaDB)
    'DB_HOST'    => 'localhost',
    'DB_NAME'    => '',
    'DB_USER'    => '',
    'DB_PASS'    => '',
    'DB_CHARSET' => 'utf8mb4',

    // Contact form mailbox password (contact@snapshiftpuzzles.com)
    'SMTP_PASSWORD' => '',

    // Admin panel
    'ADMIN_ENABLED'   => '1',
    'ADMIN_USER'      => 'admin',
    // Generate with: php -r "echo password_hash('your-password', PASSWORD_DEFAULT), PHP_EOL;"
    'ADMIN_PASS_HASH' => '',
    // Comma-separated list of IPs allowed to open the admin panel ('' = any)
    'ADMIN_ALLOW_IPS' => '',
];
