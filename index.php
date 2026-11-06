<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$base = __DIR__; // /puzzles
$allowed = ['jpg','jpeg','png','webp'];

$out = [];

// List only directories inside /puzzles
$dirs = glob($base . '/*', GLOB_ONLYDIR) ?: [];

foreach ($dirs as $dirPath) {
  $cat = basename($dirPath);

  // Optional: ignore hidden/system folders
  if ($cat === '' || $cat[0] === '.') continue;

  $files = glob($dirPath . '/*') ?: [];
  $list = [];

  foreach ($files as $f) {
    if (!is_file($f)) continue;

    $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed, true)) continue;

    $filename = basename($f);

    // filename -> display name
    $name = preg_replace('/\.[^.]+$/', '', $filename);
    $name = str_replace(['_', '-'], ' ', $name);
    $name = ucwords(trim($name));

    $list[] = [
      "name" => $name,
      "src" => "puzzles/$cat/$filename"
    ];
  }

  // Sort by name (case-insensitive)
  usort($list, fn($a, $b) => strcasecmp($a["name"], $b["name"]));

  if (count($list)) $out[$cat] = $list;
}

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);