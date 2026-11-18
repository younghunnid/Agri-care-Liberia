<?php
declare(strict_types=1);

namespace Agri\Http;

final class Cookie
{
    public const SESSION = 'agri_session';
    public const ANON = 'agri_anon';
    public const CSRF = 'agri_csrf';
    public const MAX_AGE = 604800; // 7 days, as in the Node reference

    /**
     * Builds one Set-Cookie value.
     * first_party: SameSite=Lax; Secure whenever the request is HTTPS (always Secure in production-like environments).
     * cross_site (non-production only): SameSite=None; Secure; Partitioned on HTTPS, exactly like the Node preview behaviour.
     */
    public static function build(string $name, string $value, bool $httpOnly, bool $https, bool $strictEnv, string $mode, int $now): string
    {
        $parts = [$name . '=' . rawurlencode($value), 'Max-Age=' . self::MAX_AGE, 'Path=/', 'Expires=' . gmdate('D, d M Y H:i:s', $now + self::MAX_AGE) . ' GMT'];
        if ($httpOnly) $parts[] = 'HttpOnly';
        if ($mode === 'cross_site' && $https) {
            array_push($parts, 'Secure', 'SameSite=None', 'Partitioned');
        } else {
            if ($https || $strictEnv) $parts[] = 'Secure';
            $parts[] = 'SameSite=Lax';
        }
        return implode('; ', $parts);
    }
}
