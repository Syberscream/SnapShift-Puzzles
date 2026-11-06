<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/puzzle_manifest.php';

$runningDirectly = (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__);
if ($runningDirectly) {
    header('Content-Type: text/plain; charset=utf-8');
}

$result = puzzle_manifest_generate(__DIR__);
if (!$result['ok']) {
    if ($runningDirectly) {
        http_response_code(500);
    }
    echo $result['message'] . "\n";
    return;
}

echo 'OK: Wrote ' . $result['catalog_slug'] . "/index.json\n";
echo 'Categories: ' . $result['categories'] . "\n";
echo 'Total puzzles: ' . $result['total'] . "\n";
echo 'Generated at: ' . date('c', $result['generated_at']) . "\n";
