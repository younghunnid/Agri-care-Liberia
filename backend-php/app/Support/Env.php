<?php
declare(strict_types=1);

namespace Agri\Support;

/** Read-only view of configuration: real environment variables win over the optional .env file (which lives above the web root). */
final class Env
{
    /** @var array<string,string> */
    private array $file = [];

    /** @param array<string,string> $override used by tests */
    public function __construct(?string $envFile = null, private ?array $override = null)
    {
        if ($envFile !== null && is_file($envFile) && is_readable($envFile)) {
            foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
                [$k, $v] = explode('=', $line, 2);
                $k = trim($k); $v = trim($v);
                if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && substr($v, -1) === $v[0]) $v = substr($v, 1, -1);
                if (preg_match('/^[A-Z][A-Z0-9_]*$/', $k)) $this->file[$k] = $v;
            }
        }
    }

    public function get(string $key): ?string
    {
        if ($this->override !== null) return array_key_exists($key, $this->override) ? (string)$this->override[$key] : null;
        $v = getenv($key);
        if ($v !== false) return (string)$v;
        return $this->file[$key] ?? null;
    }

    public function bool(string $key): bool
    {
        return in_array(strtolower(trim((string)$this->get($key))), ['1', 'true', 'yes', 'on'], true);
    }
}
