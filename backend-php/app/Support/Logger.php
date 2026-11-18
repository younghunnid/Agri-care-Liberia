<?php
declare(strict_types=1);

namespace Agri\Support;

/** Structured JSON-lines logger writing to a private directory. Secrets are redacted by key name and by value shape. */
final class Logger
{
    private const SENSITIVE = '/pass|secret|token|key|authorization|cookie|csrf|session|hash|credential|dsn/i';

    public function __construct(private string $dir, private string $requestId = '') {}

    public function withRequestId(string $id): self { $c = clone $this; $c->requestId = $id; return $c; }

    public function error(string $msg, array $ctx = []): void { $this->write('error', $msg, $ctx); }
    public function warning(string $msg, array $ctx = []): void { $this->write('warning', $msg, $ctx); }
    public function info(string $msg, array $ctx = []): void { $this->write('info', $msg, $ctx); }

    /** @return array<mixed> */
    public static function redact(array $ctx): array
    {
        $out = [];
        foreach ($ctx as $k => $v) {
            if (is_string($k) && preg_match(self::SENSITIVE, $k)) { $out[$k] = '[redacted]'; continue; }
            if (is_array($v)) $out[$k] = self::redact($v);
            elseif (is_string($v)) $out[$k] = self::scrub($v);
            else $out[$k] = $v;
        }
        return $out;
    }

    public static function scrub(string $s): string
    {
        $s = preg_replace('/\b(pass(?:word)?|pwd|secret|token|api[_-]?key)\s*[=:]\s*\S+/i', '$1=[redacted]', $s) ?? $s;
        $s = preg_replace('/\b[0-9a-f]{32}:[0-9a-f]{64,}\b/i', '[redacted-hash]', $s) ?? $s;
        $s = preg_replace('/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{20,}\b/', '[redacted-token]', $s) ?? $s;
        return $s;
    }

    private function write(string $level, string $msg, array $ctx): void
    {
        $line = json_encode(['ts' => gmdate('Y-m-d\TH:i:s\Z'), 'level' => $level, 'request_id' => $this->requestId, 'msg' => self::scrub($msg), 'ctx' => self::redact($ctx)],
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR) . "\n";
        if ($this->dir !== '' && (is_dir($this->dir) || @mkdir($this->dir, 0700, true))) {
            $file = rtrim($this->dir, '/') . '/app-' . gmdate('Y-m-d') . '.log';
            $old = umask(0077); // the file is created 0600 from the start (no window where it is world-readable)
            $ok = @file_put_contents($file, $line, FILE_APPEND | LOCK_EX) !== false;
            umask($old);
            if ($ok) { @chmod($file, 0600); return; }
        }
        error_log(rtrim($line));
    }
}
