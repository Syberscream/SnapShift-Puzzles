<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

$base = __DIR__;
$thumbDir = $base . '/_thumbs';

$out = [
  'ok' => true,
  'php_version' => PHP_VERSION,
  'gd_loaded' => extension_loaded('gd'),
  'imagick_loaded' => extension_loaded('imagick'),
  'has_imagecreatetruecolor' => function_exists('imagecreatetruecolor'),
  'has_imagejpeg' => function_exists('imagejpeg'),
  'has_imagecreatefrompng' => function_exists('imagecreatefrompng'),
  'has_imagecreatefromjpeg' => function_exists('imagecreatefromjpeg'),
  'has_imagecreatefromwebp' => function_exists('imagecreatefromwebp'),
  'thumb_dir' => $thumbDir,
  'thumb_dir_exists' => is_dir($thumbDir),
  'thumb_dir_writable' => is_dir($thumbDir) ? is_writable($thumbDir) : null,
  'mkdir_ok' => null,
  'write_test_ok' => null,
  'write_test_path' => null,
  'error' => null
];

try{
  if (!is_dir($thumbDir)) {
    $out['mkdir_ok'] = @mkdir($thumbDir, 0755, true);
  } else {
    $out['mkdir_ok'] = true;
  }

  $testPath = $thumbDir . '/__write_test.txt';
  $out['write_test_path'] = $testPath;
  $bytes = @file_put_contents($testPath, "ok " . date('c') . "\n");
  $out['write_test_ok'] = ($bytes !== false);

} catch (Throwable $e){
  $out['ok'] = false;
  $out['error'] = $e->getMessage();
}

echo json_encode($out, JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);
