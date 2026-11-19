<?php
declare(strict_types=1);

namespace Agri\Support;

/**
 * Small private file helpers for the cache directory (health cache, deep-check rate limit). Everything is best effort for availability but
 * fail-closed for security decisions: callers decide what an I/O failure means.
 */
final class FileStore
{
    public static function ensureDir(string $dir): bool
    {
        if (is_dir($dir)) return is_writable($dir);
        $old = function_exists('umask') ? umask(0077) : null;
        $ok = @mkdir($dir, 0700, true) || is_dir($dir);
        if ($old !== null) umask($old);
        return $ok && is_writable($dir);
    }

    /** Atomic write (temp file + rename), mode 0600. */
    public static function writeAtomic(string $path, string $data): bool
    {
        $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $old = function_exists('umask') ? umask(0077) : null;
        $ok = @file_put_contents($tmp, $data, LOCK_EX) === strlen($data) && @rename($tmp, $path);
        if ($old !== null) umask($old);
        if (!$ok) @unlink($tmp);
        return $ok;
    }

    /** @return array<mixed>|null decoded JSON object/array, null when absent or corrupt */
    public static function readJson(string $path): ?array
    {
        $raw = @file_get_contents($path, false, null, 0, 65536);
        if ($raw === false || $raw === '') return null;
        $v = json_decode($raw, true);
        return is_array($v) ? $v : null;
    }

    /**
     * Fixed-window counter shared by all PHP workers (exclusive flock on one file). Returns true when the hit is allowed. Any I/O problem,
     * or a table that would grow past $maxKeys live entries, DENIES (fail closed). Keys are stored only as given: pass a hash, never an IP.
     */
    public static function rateHit(string $dir, string $name, string $key, int $limit, int $windowSeconds, ?int $now = null, int $maxKeys = 2000): bool
    {
        if (!self::ensureDir($dir)) return false;
        $now ??= time();
        $path = $dir . '/rl-' . preg_replace('/[^a-z0-9_-]/', '', $name) . '.json';
        $old = function_exists('umask') ? umask(0077) : null;
        $h = @fopen($path, 'c+');
        if ($old !== null) umask($old);
        if ($h === false) return false;
        try {
            if (!flock($h, LOCK_EX)) return false;
            $raw = stream_get_contents($h);
            $data = $raw !== '' && $raw !== false ? json_decode($raw, true) : [];
            if (!is_array($data)) $data = [];
            foreach ($data as $k => $v) if (!is_array($v) || !isset($v[0], $v[1]) || $v[0] + $windowSeconds <= $now) unset($data[$k]);
            if (!isset($data[$key])) {
                if (count($data) >= $maxKeys) return false;
                $data[$key] = [$now, 0];
            }
            $allowed = $data[$key][1] < $limit;
            if ($allowed) $data[$key][1]++;
            $out = json_encode($data);
            ftruncate($h, 0); rewind($h);
            if ($out === false || fwrite($h, $out) !== strlen($out)) return false;
            fflush($h);
            return $allowed;
        } finally {
            flock($h, LOCK_UN);
            fclose($h);
        }
    }
}
