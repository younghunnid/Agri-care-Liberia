<?php
declare(strict_types=1);

namespace Agri\Config;

use Agri\Support\Env;

/**
 * Validated, immutable application configuration. Fail-closed: anything missing/weak in a production-like environment makes load() throw
 * (the front controller then answers every request with a generic 500). There are no silent development fallbacks for secrets.
 */
final class Config
{
    public const DEV_OWNER_KEY_CONSTANT = 'agri-owner-key-dev-fallback';
    private const PLACEHOLDER = '/^(change.?me|your[-_ ]|example|placeholder|replace|todo|dev[-_]|test[-_]?secret|password|secret|insecure|default|xxx)/i';

    /** @param list<string> $allowedOrigins */
    private function __construct(
        public readonly string $env,
        public readonly bool $strict,
        public readonly bool $debug,
        public readonly ?string $appUrl,
        public readonly array $allowedOrigins,
        public readonly string $sessionSecret,
        public readonly string $ownerKeySecret,
        public readonly array $db,
        public readonly string $cookieMode,
        public readonly bool $trustProxy,
        public readonly int $maxBodyBytes,
        public readonly string $logDir,
        public readonly int $hstsMaxAge,
        public readonly string $geminiKey,
    ) {}

    public function devFeaturesAllowed(): bool { return !$this->strict; }

    /** Safe to log / print: contains no secret values. */
    public function summary(): array
    {
        return ['env' => $this->env, 'strict' => $this->strict, 'cookieMode' => $this->cookieMode, 'trustProxy' => $this->trustProxy,
            'maxBodyBytes' => $this->maxBodyBytes, 'allowedOrigins' => $this->allowedOrigins, 'db' => ['host' => $this->db['host'], 'name' => $this->db['name']]];
    }

    public static function load(Env $e, string $root): self
    {
        $p = [];
        $raw = trim((string)$e->get('APP_ENV'));
        $known = ['production', 'staging', 'development', 'test'];
        if ($raw === '') $p[] = 'APP_ENV is not set (must be production, staging, development or test); validating as production';
        elseif (!in_array($raw, $known, true)) $p[] = 'APP_ENV has an unknown value; validating as production';
        $env = in_array($raw, $known, true) ? $raw : 'production';
        $strict = in_array($env, ['production', 'staging'], true);

        // Development/test switches can never be enabled in a production-like environment.
        if ($strict) {
            foreach (['TEST_FIXTURE_TOKEN', 'APP_DEBUG', 'ENABLE_TEST_FIXTURES', 'ENABLE_DEMO_SEED', 'AGRI_DISPOSABLE_DB_OK', 'DEMO_FARMER_PASSWORD', 'DEMO_EXPERT_PASSWORD'] as $k) {
                $v = trim((string)$e->get($k));
                if ($v !== '' && !in_array(strtolower($v), ['0', 'false', 'no', 'off'], true)) $p[] = "$k must not be set in a production-like environment";
            }
        }

        $minLen = $strict ? 32 : 16;
        $session = (string)$e->get('SESSION_SECRET');
        if (strlen($session) < $minLen) $p[] = "SESSION_SECRET is missing or shorter than $minLen characters";
        elseif (self::weak($session)) $p[] = 'SESSION_SECRET looks like a placeholder or has too little variety';

        $owner = (string)$e->get('OWNER_KEY_HMAC_SECRET');
        if ($owner === '') $p[] = 'OWNER_KEY_HMAC_SECRET is not set (it must be explicit; there is no fallback)';
        elseif ($owner === self::DEV_OWNER_KEY_CONSTANT) {
            // The Node reference hashed owner keys with this constant when SESSION_SECRET was unset. Existing hashes can only be honoured with the same
            // value, so it is accepted in a production-like environment ONLY with an explicit, documented migration flag.
            if ($strict && !$e->bool('ALLOW_LEGACY_OWNER_KEY_SECRET')) $p[] = 'OWNER_KEY_HMAC_SECRET equals the Node development constant; set ALLOW_LEGACY_OWNER_KEY_SECRET=1 only for the documented migration case';
        } elseif (strlen($owner) < $minLen) $p[] = "OWNER_KEY_HMAC_SECRET is shorter than $minLen characters";
        elseif (self::weak($owner)) $p[] = 'OWNER_KEY_HMAC_SECRET looks like a placeholder or has too little variety';

        $db = ['host' => trim((string)$e->get('DB_HOST')), 'port' => (int)($e->get('DB_PORT') ?: 3306), 'name' => trim((string)$e->get('DB_NAME')),
            'user' => trim((string)$e->get('DB_USER')), 'pass' => (string)$e->get('DB_PASS'), 'socket' => ($e->get('DB_SOCKET') ?: null)];
        foreach (['host' => 'DB_HOST', 'name' => 'DB_NAME', 'user' => 'DB_USER'] as $k => $name) if ($db[$k] === '') $p[] = "$name is not set";
        if ($db['port'] < 1 || $db['port'] > 65535) $p[] = 'DB_PORT is invalid';
        if ($strict && $db['pass'] === '') $p[] = 'DB_PASS is empty';
        if ($strict && strtolower($db['user']) === 'root') $p[] = 'DB_USER must not be root (use a least-privilege user)';

        $appUrl = trim((string)$e->get('APP_URL')) ?: null;
        if ($appUrl !== null && !self::isOrigin($appUrl)) $p[] = 'APP_URL must be an origin like https://example.org (no path)';
        if ($strict && ($appUrl === null || !str_starts_with($appUrl, 'https://'))) $p[] = 'APP_URL must be set to an https:// origin';

        $origins = [];
        foreach (array_filter(array_map('trim', explode(',', (string)$e->get('CORS_ALLOWED_ORIGINS')))) as $o) {
            if ($o === '*' || str_contains($o, '*')) { $p[] = 'CORS_ALLOWED_ORIGINS must not contain a wildcard (cookies/credentials are used)'; continue; }
            if (!self::isOrigin($o)) { $p[] = 'CORS_ALLOWED_ORIGINS contains an invalid origin'; continue; }
            if ($strict && !str_starts_with($o, 'https://')) { $p[] = 'CORS_ALLOWED_ORIGINS must be https:// origins in a production-like environment'; continue; }
            $origins[] = rtrim($o, '/');
        }
        if ($appUrl !== null && self::isOrigin($appUrl)) $origins[] = rtrim($appUrl, '/');
        if (!$strict) foreach (['http://localhost:3000', 'http://127.0.0.1:3000'] as $o) $origins[] = $o;
        $origins = array_values(array_unique($origins));

        $cookieMode = strtolower(trim((string)($e->get('COOKIE_MODE') ?: 'first_party')));
        if (!in_array($cookieMode, ['first_party', 'cross_site'], true)) { $p[] = 'COOKIE_MODE must be first_party or cross_site'; $cookieMode = 'first_party'; }
        if ($strict && $cookieMode === 'cross_site') $p[] = 'COOKIE_MODE=cross_site (SameSite=None) is not allowed in a production-like environment';

        $max = (int)($e->get('MAX_BODY_BYTES') ?: 4 * 1024 * 1024);
        if ($max < 1024 || $max > 16 * 1024 * 1024) { $p[] = 'MAX_BODY_BYTES must be between 1024 and 16777216'; $max = 4 * 1024 * 1024; }
        $hsts = (int)($e->get('HSTS_MAX_AGE') ?: 0);
        if ($hsts < 0 || $hsts > 63072000) $p[] = 'HSTS_MAX_AGE is out of range';

        $logDir = trim((string)$e->get('LOG_DIR')) ?: $root . '/storage/logs';
        if ($p) throw new ConfigException($p);

        return new self($env, $strict, !$strict && $e->bool('APP_DEBUG'), $appUrl, $origins, $session, $owner, $db, $cookieMode, $e->bool('TRUST_PROXY'),
            $max, $logDir, $hsts, trim((string)$e->get('GEMINI_API_KEY')));
    }

    private static function isOrigin(string $v): bool
    {
        return (bool)preg_match('#^https?://[A-Za-z0-9.-]+(:\d{1,5})?/?$#', $v) && !str_contains(rtrim($v, '/'), '..');
    }

    private static function weak(string $s): bool
    {
        return (bool)preg_match(self::PLACEHOLDER, $s) || count(array_unique(str_split($s))) < 8;
    }
}
