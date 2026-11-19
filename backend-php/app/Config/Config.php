<?php
declare(strict_types=1);

namespace Agri\Config;

use Agri\Http\TrustedProxies;
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
        public readonly ?TrustedProxies $trustedProxies,
        public readonly int $maxBodyBytes,
        public readonly string $logDir,
        public readonly int $hstsMaxAge,
        public readonly string $geminiKey,
        public readonly string $cacheDir,
        public readonly ?string $ipHashSecret,
        /** @var array{idleMinutes:int,absoluteHours:int,adminIdleMinutes:int,adminAbsoluteHours:int} */
        public readonly array $session,
        /** @var array{scheme:string,rehash:bool,argon2Memory:int,argon2Time:int,argon2Threads:int,bcryptCost:int} */
        public readonly array $password,
        /** @var array{transport:string,host:string,port:int,encryption:string,username:string,password:string,fromAddress:string,fromName:string} */
        public readonly array $mail,
        /** @var array{ttl:int,failTtl:int,deepToken:?string,deepPerMinute:int} */
        public readonly array $health,
    ) {}

    /** Mail transports are validated here but NO sender exists yet: nothing is ever sent by this milestone. */
    public function mailActive(): bool { return false; }

    public function devFeaturesAllowed(): bool { return !$this->strict; }

    /** Safe to log / print: contains no secret values. */
    public function summary(): array
    {
        return ['env' => $this->env, 'strict' => $this->strict, 'cookieMode' => $this->cookieMode, 'trustedProxies' => $this->trustedProxies !== null,
            'session' => $this->session, 'password' => ['scheme' => $this->password['scheme'], 'rehash' => $this->password['rehash']],
            'mail' => ['transport' => $this->mail['transport'], 'active' => $this->mailActive()], 'health' => ['ttl' => $this->health['ttl'], 'deepEnabled' => $this->health['deepToken'] !== null],
            'ipHashSecretSet' => $this->ipHashSecret !== null,
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
        $cacheDir = trim((string)$e->get('CACHE_DIR')) ?: $root . '/storage/cache';

        // --- proxy trust: default none; TRUST_PROXY=1 requires an explicit proxy address list (never assumed) ---
        $proxies = null;
        $tpList = trim((string)$e->get('TRUSTED_PROXY_CIDRS'));
        $tpFlag = self::flag($e, 'TRUST_PROXY', false, $p);
        if ($tpFlag && $tpList === '') $p[] = 'TRUST_PROXY=1 requires TRUSTED_PROXY_CIDRS (the addresses of the proxies allowed to set X-Forwarded-*)';
        elseif (!$tpFlag && $tpList !== '') $p[] = 'TRUSTED_PROXY_CIDRS is set but TRUST_PROXY is not 1 (refusing ambiguous proxy configuration)';
        elseif ($tpFlag) { foreach (TrustedProxies::parse($tpList, $proxies) as $x) $p[] = $x; }

        // --- sessions (windows are validated now; sessions themselves arrive in M4) ---
        $ses = [
            'idleMinutes' => self::int($e, 'SESSION_IDLE_MINUTES', 720, 5, 1440, $p),
            'absoluteHours' => self::int($e, 'SESSION_ABSOLUTE_HOURS', 168, 1, 720, $p),
            'adminIdleMinutes' => self::int($e, 'SESSION_IDLE_MINUTES_ADMIN', 30, 5, 120, $p),
            'adminAbsoluteHours' => self::int($e, 'SESSION_ABSOLUTE_HOURS_ADMIN', 8, 1, 24, $p),
        ];
        if ($ses['idleMinutes'] > $ses['absoluteHours'] * 60) $p[] = 'SESSION_IDLE_MINUTES must not exceed SESSION_ABSOLUTE_HOURS';
        if ($ses['adminIdleMinutes'] > $ses['adminAbsoluteHours'] * 60) $p[] = 'SESSION_IDLE_MINUTES_ADMIN must not exceed SESSION_ABSOLUTE_HOURS_ADMIN';
        if ($ses['adminIdleMinutes'] > $ses['idleMinutes'] || $ses['adminAbsoluteHours'] > $ses['absoluteHours']) $p[] = 'administrator session windows must not be longer than ordinary session windows';

        // --- IP hashing secret (separate from the session secret: domain separation by distinct value) ---
        $ipSecret = (string)$e->get('IP_HASH_SECRET');
        if ($ipSecret === '') {
            if ($strict) $p[] = 'IP_HASH_SECRET is not set (it must be explicit; there is no fallback)';
            $ipSecret = null;
        } elseif (strlen($ipSecret) < $minLen) $p[] = "IP_HASH_SECRET is shorter than $minLen characters";
        elseif (self::weak($ipSecret)) $p[] = 'IP_HASH_SECRET looks like a placeholder or has too little variety';
        elseif ($ipSecret === $session || $ipSecret === $owner) $p[] = 'IP_HASH_SECRET must differ from SESSION_SECRET and OWNER_KEY_HMAC_SECRET';

        // --- password hashing policy ---
        $argonOk = defined('PASSWORD_ARGON2ID');
        $schemeRaw = strtolower(trim((string)$e->get('PASSWORD_HASH_SCHEME')));
        if ($schemeRaw === '') {
            if ($strict) $p[] = 'PASSWORD_HASH_SCHEME is not set (legacy, argon2id or bcrypt; it must be explicit)';
            $schemeRaw = $argonOk ? 'argon2id' : 'bcrypt';
        } elseif (!in_array($schemeRaw, ['legacy', 'argon2id', 'bcrypt'], true)) { $p[] = 'PASSWORD_HASH_SCHEME must be legacy, argon2id or bcrypt'; $schemeRaw = 'bcrypt'; }
        if ($schemeRaw === 'argon2id' && !$argonOk) $p[] = 'PASSWORD_HASH_SCHEME=argon2id but this PHP build has no Argon2id (use bcrypt)';
        $rehashSet = trim((string)$e->get('PASSWORD_REHASH_ENABLED')) !== '';
        if ($strict && !$rehashSet) $p[] = 'PASSWORD_REHASH_ENABLED is not set (it must be explicit)';
        $rehash = self::flag($e, 'PASSWORD_REHASH_ENABLED', false, $p);
        if ($rehash && $schemeRaw === 'legacy') $p[] = 'PASSWORD_REHASH_ENABLED=1 contradicts PASSWORD_HASH_SCHEME=legacy (nothing to upgrade to)';
        $pw = ['scheme' => $schemeRaw, 'rehash' => $rehash,
            'argon2Memory' => self::int($e, 'PASSWORD_ARGON2_MEMORY_KIB', 19456, 8192, 262144, $p),
            'argon2Time' => self::int($e, 'PASSWORD_ARGON2_TIME', 2, 1, 10, $p),
            'argon2Threads' => self::int($e, 'PASSWORD_ARGON2_THREADS', 1, 1, 4, $p),
            'bcryptCost' => self::int($e, 'PASSWORD_BCRYPT_COST', 12, 10, 15, $p)];

        // --- mail (validated only; SMTP stays inactive: no sender exists in this milestone) ---
        $mt = strtolower(trim((string)($e->get('MAIL_TRANSPORT') ?: 'null')));
        $allowedMail = $strict ? ['null', 'smtp'] : ['null', 'log', 'capture', 'smtp'];
        if (!in_array($mt, ['null', 'log', 'capture', 'smtp'], true)) { $p[] = 'MAIL_TRANSPORT must be null, log, capture or smtp'; $mt = 'null'; }
        elseif (!in_array($mt, $allowedMail, true)) { $p[] = "MAIL_TRANSPORT=$mt is a test-only transport and is refused in a production-like environment"; $mt = 'null'; }
        $mail = ['transport' => $mt, 'host' => trim((string)$e->get('MAIL_HOST')), 'port' => 0, 'encryption' => strtolower(trim((string)$e->get('MAIL_ENCRYPTION'))),
            'username' => (string)$e->get('MAIL_USERNAME'), 'password' => (string)$e->get('MAIL_PASSWORD'),
            'fromAddress' => trim((string)$e->get('MAIL_FROM_ADDRESS')), 'fromName' => trim((string)$e->get('MAIL_FROM_NAME'))];
        $verify = trim((string)$e->get('MAIL_VERIFY_PEER'));
        if ($verify !== '' && !in_array(strtolower($verify), ['1', 'true', 'yes', 'on'], true)) $p[] = 'MAIL_VERIFY_PEER cannot be disabled (certificate and hostname verification are always on)';
        if ($mt === 'smtp') {
            if (!preg_match('/^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/', $mail['host'])) $p[] = 'MAIL_HOST is missing or not a valid hostname';
            $mail['port'] = self::int($e, 'MAIL_PORT', 0, 1, 65535, $p);
            if ($mail['port'] === 0) $p[] = 'MAIL_PORT is required for MAIL_TRANSPORT=smtp';
            if (!in_array($mail['encryption'], ['tls', 'starttls'], true)) $p[] = 'MAIL_ENCRYPTION must be tls or starttls (plain-text SMTP is not allowed)';
            if ($mail['username'] === '' || $mail['password'] === '') $p[] = 'MAIL_USERNAME and MAIL_PASSWORD are required for MAIL_TRANSPORT=smtp';
            if (preg_match('/[\x00-\x1f\x7f]/', $mail['username'] . $mail['password'])) $p[] = 'MAIL_USERNAME/MAIL_PASSWORD contain control characters';
            if ($mail['fromAddress'] === '' || filter_var($mail['fromAddress'], FILTER_VALIDATE_EMAIL) === false || preg_match('/[\r\n]/', $mail['fromAddress'])) $p[] = 'MAIL_FROM_ADDRESS is missing or not a valid email address';
            if ($mail['fromName'] !== '' && (preg_match('/[\x00-\x1f\x7f<>"]/', $mail['fromName']) || mb_strlen($mail['fromName']) > 80)) $p[] = 'MAIL_FROM_NAME is invalid (no control characters, quotes or angle brackets; max 80)';
            if ($strict && $mail['host'] !== '' && (in_array(strtolower($mail['host']), ['localhost'], true) || filter_var($mail['host'], FILTER_VALIDATE_IP) !== false)) $p[] = 'MAIL_HOST must be a real hostname (not localhost or an IP literal) in a production-like environment';
        } else {
            $mail['port'] = 0;
        }

        // --- health endpoint: short cache for the public contract, token + rate limit for the deep check ---
        $ttl = self::int($e, 'HEALTH_CACHE_TTL_SECONDS', 15, $strict ? 1 : 0, 60, $p);
        $failTtl = self::int($e, 'HEALTH_FAIL_CACHE_TTL_SECONDS', 3, 0, 15, $p);
        if ($failTtl > $ttl) $failTtl = $ttl;
        $deep = (string)$e->get('HEALTH_DEEP_TOKEN');
        if ($deep === '') $deep = null;
        elseif (strlen($deep) < $minLen) $p[] = "HEALTH_DEEP_TOKEN is shorter than $minLen characters";
        elseif (self::weak($deep)) $p[] = 'HEALTH_DEEP_TOKEN looks like a placeholder or has too little variety';
        elseif (in_array($deep, [$session, $owner, (string)$ipSecret], true)) $p[] = 'HEALTH_DEEP_TOKEN must differ from the application secrets';
        $health = ['ttl' => $ttl, 'failTtl' => $failTtl, 'deepToken' => $deep, 'deepPerMinute' => self::int($e, 'HEALTH_DEEP_RATE_PER_MINUTE', 10, 1, 60, $p)];

        if ($p) throw new ConfigException($p);

        return new self($env, $strict, !$strict && $e->bool('APP_DEBUG'), $appUrl, $origins, $session, $owner, $db, $cookieMode, $proxies,
            $max, $logDir, $hsts, trim((string)$e->get('GEMINI_API_KEY')), $cacheDir, $ipSecret, $ses, $pw, $mail, $health);
    }

    /** Strict integer setting: digits only, inside [min,max]; unset -> default. A bad value is reported (by name) and the default returned. */
    private static function int(Env $e, string $key, int $default, int $min, int $max, array &$p): int
    {
        $v = trim((string)$e->get($key));
        if ($v === '') return $default;
        if (!preg_match('/^\d{1,9}$/', $v) || (int)$v < $min || (int)$v > $max) { $p[] = "$key must be a whole number between $min and $max"; return $default; }
        return (int)$v;
    }

    /** Strict boolean: 1/true/yes/on or 0/false/no/off; anything else (typo) is a configuration error, never silently false. */
    private static function flag(Env $e, string $key, bool $default, array &$p): bool
    {
        $v = strtolower(trim((string)$e->get($key)));
        if ($v === '') return $default;
        if (in_array($v, ['1', 'true', 'yes', 'on'], true)) return true;
        if (in_array($v, ['0', 'false', 'no', 'off'], true)) return false;
        $p[] = "$key must be 1/true/yes/on or 0/false/no/off";
        return $default;
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
