<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$base = __DIR__; // /puzzles on the server
$allowed = ['jpg', 'jpeg', 'png', 'webp'];

$out = [];

// Get category folders inside /puzzles
$dirs = glob($base . '/*', GLOB_ONLYDIR) ?: [];

foreach ($dirs as $dirPath) {
  $cat = basename($dirPath);

  // Skip hidden/system dirs
  if ($cat === '' || $cat[0] === '.') continue;

  $files = glob($dirPath . '/*') ?: [];
  $list = [];

  foreach ($files as $f) {
    if (!is_file($f)) continue;

    $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed, true)) continue;

    $filename = basename($f);

    // filename -> display name (derived)
    $name = preg_replace('/\.[^.]+$/', '', $filename);
    $name = str_replace(['_', '-'], ' ', $name);
    $name = ucwords(trim($name));

    $mtime = @filemtime($f);
    if ($mtime === false) $mtime = 0;

    $list[] = [
      "name" => $name,
      "src" => "puzzles/$cat/$filename",
      "_mtime" => $mtime
    ];
  }

  // Sort newest-first by modified time (desc). Tie-breaker: name A->Z
  usort($list, function($a, $b) {
    if ($a["_mtime"] === $b["_mtime"]) {
      return strcasecmp($a["name"], $b["name"]);
    }
    return ($a["_mtime"] > $b["_mtime"]) ? -1 : 1;
  });

  // Remove private field before output
  foreach ($list as &$item) {
    unset($item["_mtime"]);
  }
  unset($item);

  if (count($list) > 0) {
    $out[$cat] = $list;
  }
}

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);