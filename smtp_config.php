<?php
// Non-secret contact-form settings. The SMTP password is read from
// config.local.php (SMTP_PASSWORD) or the environment.
require_once __DIR__ . '/lib/site_config.php';

return [
    'smtp_host' => 'snapshiftpuzzles.com',
    'smtp_port' => 465,
    'smtp_secure' => 'ssl',
    'smtp_username' => 'contact@snapshiftpuzzles.com',
    'smtp_password' => snapshift_smtp_password(),
    'from_email' => 'contact@snapshiftpuzzles.com',
    'from_name' => 'Snapshift Puzzles Contact Form',
    'to_email' => 'contact@snapshiftpuzzles.com',
    'to_name' => 'Snapshift Puzzles',
    'redirect_success' => '/contact.html',
    'redirect_error' => '/contact.html',
];
