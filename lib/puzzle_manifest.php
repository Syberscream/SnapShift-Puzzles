<?php
declare(strict_types=1);

function puzzle_manifest_safe_name_from_file(string $file): string {
    $name = pathinfo($file, PATHINFO_FILENAME);
    $name = preg_replace('/[_\-]+/', ' ', $name);
    $name = preg_replace('/\s+/', ' ', $name);
    $name = trim($name);
    if ($name === '') {
        return 'Puzzle';
    }

    return mb_convert_case($name, MB_CASE_TITLE, 'UTF-8');
}

function puzzle_manifest_ensure_dir(string $dir): void {
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
}

function puzzle_manifest_build_thumb(string $srcAbs, string $dstAbs, int $maxW, int $quality): bool {
    if (function_exists('imagecreatetruecolor') && function_exists('imagejpeg')) {
        $ext = strtolower(pathinfo($srcAbs, PATHINFO_EXTENSION));
        $src = null;
        if (($ext === 'jpg' || $ext === 'jpeg') && function_exists('imagecreatefromjpeg')) {
            $src = @imagecreatefromjpeg($srcAbs);
        } elseif ($ext === 'png' && function_exists('imagecreatefrompng')) {
            $src = @imagecreatefrompng($srcAbs);
        } elseif ($ext === 'gif' && function_exists('imagecreatefromgif')) {
            $src = @imagecreatefromgif($srcAbs);
        } elseif ($ext === 'webp' && function_exists('imagecreatefromwebp')) {
            $src = @imagecreatefromwebp($srcAbs);
        }

        if ($src) {
            $w = imagesx($src);
            $h = imagesy($src);
            if ($w > 0 && $h > 0) {
                $newW = min($maxW, $w);
                $newH = (int)round($h * ($newW / $w));
                $dst = imagecreatetruecolor($newW, $newH);
                imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $w, $h);
                puzzle_manifest_ensure_dir(dirname($dstAbs));
                $ok = @imagejpeg($dst, $dstAbs, $quality);
                imagedestroy($dst);
                imagedestroy($src);
                return (bool)$ok;
            }

            imagedestroy($src);
        }
    }

    if (class_exists('Imagick')) {
        try {
            $im = new Imagick($srcAbs);
            $im->setImageColorspace(Imagick::COLORSPACE_RGB);
            $im->setImageFormat('jpeg');
            $im->setImageCompressionQuality($quality);
            $w = $im->getImageWidth();
            if ($w > $maxW) {
                $im->resizeImage($maxW, 0, Imagick::FILTER_LANCZOS, 1);
            }
            puzzle_manifest_ensure_dir(dirname($dstAbs));
            $im->writeImage($dstAbs);
            $im->clear();
            $im->destroy();
            return true;
        } catch (Throwable $e) {
            return false;
        }
    }

    return false;
}

function puzzle_manifest_list_category_dirs(string $baseDir, array $ignoreDirs): array {
    $dirs = [];
    $scan = scandir($baseDir);
    if ($scan === false) {
        return $dirs;
    }

    foreach ($scan as $entry) {
        if (in_array($entry, $ignoreDirs, true)) {
            continue;
        }
        if (str_starts_with($entry, '.')) {
            continue;
        }

        $path = $baseDir . '/' . $entry;
        if (is_dir($path)) {
            $dirs[] = $entry;
        }
    }

    sort($dirs);
    return $dirs;
}

function puzzle_manifest_collect_files(string $dir, array $ignoreDirs, array $ignoreFiles, array $validExt): array {
    $items = [];
    $scan = scandir($dir);
    if ($scan === false) {
        return $items;
    }

    foreach ($scan as $entry) {
        if (in_array($entry, $ignoreDirs, true) || in_array($entry, $ignoreFiles, true)) {
            continue;
        }

        $full = $dir . '/' . $entry;
        if (!is_file($full)) {
            continue;
        }

        $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
        if (!in_array($ext, $validExt, true)) {
            continue;
        }

        $items[] = $entry;
    }

    sort($items, SORT_NATURAL | SORT_FLAG_CASE);
    return $items;
}

function puzzle_manifest_generate(string $baseDir): array {
    $catalogSlug = basename($baseDir);
    $outFile = $baseDir . '/index.json';
    $rootCategoryId = ($catalogSlug === 'daily_puzzles') ? 'daily' : 'uncategorized';
    $validExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    $generateThumbs = true;
    $thumbMaxW = 900;
    $thumbJpgQuality = 92;
    $thumbDir = $baseDir . '/_thumbs';
    $ignoreFiles = ['index.json', 'build_index.php', '.htaccess'];
    $ignoreDirs = ['.', '..', '_thumbs'];

    $categories = [];
    $total = 0;
    $latestAll = [];

    $rootFiles = puzzle_manifest_collect_files($baseDir, $ignoreDirs, $ignoreFiles, $validExt);
    if ($rootFiles) {
        $catId = $rootCategoryId;
        $puzzles = [];

        foreach ($rootFiles as $file) {
            $full = $baseDir . '/' . $file;
            $mtime = @filemtime($full);
            if ($mtime === false) {
                $mtime = 0;
            }

            $thumbName = preg_replace('/\.(png|jpe?g|gif|webp)$/i', '.jpg', $file);
            $thumbRel = $catalogSlug . '/_thumbs/' . $thumbName;
            $thumbAbs = $thumbDir . '/' . $thumbName;

            if ($generateThumbs && (!file_exists($thumbAbs) || @filemtime($thumbAbs) < $mtime)) {
                puzzle_manifest_build_thumb($full, $thumbAbs, $thumbMaxW, $thumbJpgQuality);
            }

            $item = [
                'name' => puzzle_manifest_safe_name_from_file($file),
                'src' => $catalogSlug . '/' . $file,
                'thumb' => $thumbRel,
                'updated' => $mtime,
            ];

            $puzzles[] = $item;
            $latestAll[] = $item + ['catId' => $catId];
        }

        usort($puzzles, fn($a, $b) => ($b['updated'] <=> $a['updated']) ?: strcmp($a['name'], $b['name']));
        $categories[$catId] = $puzzles;
        $total += count($puzzles);
    }

    foreach (puzzle_manifest_list_category_dirs($baseDir, $ignoreDirs) as $catId) {
        $catPath = $baseDir . '/' . $catId;
        $files = puzzle_manifest_collect_files($catPath, $ignoreDirs, $ignoreFiles, $validExt);
        if (!$files) {
            $categories[$catId] = [];
            continue;
        }

        $puzzles = [];
        foreach ($files as $file) {
            $full = $catPath . '/' . $file;
            $mtime = @filemtime($full);
            if ($mtime === false) {
                $mtime = 0;
            }

            $thumbName = preg_replace('/\.(png|jpe?g|gif|webp)$/i', '.jpg', $file);
            $thumbRel = $catalogSlug . '/_thumbs/' . $catId . '/' . $thumbName;
            $thumbAbs = $thumbDir . '/' . $catId . '/' . $thumbName;

            if ($generateThumbs && (!file_exists($thumbAbs) || @filemtime($thumbAbs) < $mtime)) {
                puzzle_manifest_build_thumb($full, $thumbAbs, $thumbMaxW, $thumbJpgQuality);
            }

            $item = [
                'name' => puzzle_manifest_safe_name_from_file($file),
                'src' => $catalogSlug . '/' . $catId . '/' . $file,
                'thumb' => $thumbRel,
                'updated' => $mtime,
            ];

            $puzzles[] = $item;
            $latestAll[] = $item + ['catId' => $catId];
        }

        usort($puzzles, fn($a, $b) => ($b['updated'] <=> $a['updated']) ?: strcmp($a['name'], $b['name']));
        $categories[$catId] = $puzzles;
        $total += count($puzzles);
    }

    usort($latestAll, fn($a, $b) => ($b['updated'] <=> $a['updated']) ?: strcmp($a['src'], $b['src']));
    $latest5 = array_slice($latestAll, 0, 5);

    $counts = [];
    foreach ($categories as $catId => $list) {
        $counts[$catId] = is_array($list) ? count($list) : 0;
    }

    $payload = [
        'generated_at' => time(),
        'total_puzzles' => $total,
        'counts' => $counts,
        'latest5' => $latest5,
        'categories' => $categories,
    ];

    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) {
        return [
            'ok' => false,
            'message' => 'ERROR: json_encode failed',
        ];
    }

    if (file_put_contents($outFile, $json) === false) {
        return [
            'ok' => false,
            'message' => "ERROR: Could not write: {$outFile}",
        ];
    }

    return [
        'ok' => true,
        'catalog_slug' => $catalogSlug,
        'categories' => count($categories),
        'total' => $total,
        'generated_at' => $payload['generated_at'],
    ];
}
