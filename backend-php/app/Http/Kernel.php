<?php
declare(strict_types=1);

namespace Agri\Http;

use Agri\Config\Config;
use Agri\Support\Logger;

/**
 * Request pipeline, in the same order as the Node reference: security headers -> CORS (OPTIONS answered here) -> body parsing (errors before
 * cookies are issued) -> cookie session (agri_anon / agri_csrf) -> CSRF (all /api/v1 state-changing methods) -> router.
 */
final class Kernel
{
    public function __construct(private Config $config, private Router $router, private Logger $logger, private ?\Closure $now = null) {}

    public static function make(Config $config, Router $router, Logger $logger): self
    {
        return new self($config, $router, $logger);
    }

    public function handle(Request $req, string $requestId): Response
    {
        $res = null;
        $cors = null;
        try {
            $cors = $this->corsHeaders($req);
            if ($req->method === 'OPTIONS') {
                $res = new Response(204);
            } else {
                if (!in_array($req->method, ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) throw new HttpException(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', ['Allow' => 'GET, HEAD, POST, PATCH, DELETE, OPTIONS']);
                if (!str_starts_with($req->path, '/api/')) throw new HttpException(404, 'NOT_FOUND', 'The requested resource was not found.');
                $req->json(); // malformed JSON / oversize / wrong media type are rejected before any cookie is issued
                $this->session($req);
                if (str_starts_with($req->path, '/api/v1')) $this->csrf($req);
                [$handler, $params] = $this->router->dispatch($req->method, $req->path);
                $res = $handler($req, $params);
            }
        } catch (HttpException $e) {
            $res = Response::error($e->status, $e->errorCode, $e->getMessage(), $e->headers);
        } catch (\Throwable $e) {
            $this->logger->error('unhandled exception', ['type' => $e::class, 'message' => $e->getMessage(), 'where' => basename($e->getFile()) . ':' . $e->getLine(), 'trace' => $e->getTraceAsString(), 'path' => $req->path, 'method' => $req->method]);
            $extra = $this->config->debug ? ['debug' => ['type' => $e::class, 'message' => Logger::scrub($e->getMessage())]] : [];
            $res = Response::error(500, 'INTERNAL_ERROR', 'An unexpected error occurred.', [], ['requestId' => $requestId] + $extra);
        }
        return $this->finish($req, $res, $cors ?? [], $requestId);
    }

    /** @return array<string,string> */
    private function corsHeaders(Request $req): array
    {
        $origin = $req->header('origin');
        if ($origin === null || $origin === '' || $origin === 'null') return [];
        $host = $req->host;
        $same = $host !== null && ($origin === 'https://' . $host || $origin === 'http://' . $host);
        if (!in_array($origin, $this->config->allowedOrigins, true) && !$same) return [];
        return ['Access-Control-Allow-Origin' => $origin, 'Access-Control-Allow-Credentials' => 'true',
            'Access-Control-Allow-Headers' => 'Content-Type, X-CSRF-Token, Idempotency-Key, X-Listing-Key, X-Requester-Key',
            'Access-Control-Allow-Methods' => 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Max-Age' => '600'];
    }

    private function session(Request $req): void
    {
        $now = $this->now ? ($this->now)() : time();
        $secure = fn(string $n, string $v, bool $httpOnly) => Cookie::build($n, $v, $httpOnly, $req->isHttps, $this->config->strict, $this->config->cookieMode, $now);
        $pending = [];
        $anon = $req->cookie(Cookie::ANON);
        if ($anon === null || !preg_match('/^[a-f0-9]{24,64}$/', $anon)) { $anon = bin2hex(random_bytes(16)); $pending[] = $secure(Cookie::ANON, $anon, true); }
        $csrf = $req->cookie(Cookie::CSRF);
        if ($csrf === null || strlen($csrf) < 16) { $csrf = bin2hex(random_bytes(24)); $pending[] = $secure(Cookie::CSRF, $csrf, false); }
        $req->attributes['anonToken'] = $anon;
        $req->attributes['csrfToken'] = $csrf;
        $req->attributes['pendingCookies'] = $pending;
        $req->attributes['user'] = null; // authentication (agri_session) arrives in M4
    }

    private function csrf(Request $req): void
    {
        if (in_array($req->method, ['GET', 'HEAD', 'OPTIONS'], true)) return;
        $cookie = $req->cookie(Cookie::CSRF);
        $header = $req->header('x-csrf-token');
        if ($cookie === null || $header === null || strlen($cookie) < 16) throw new HttpException(403, 'CSRF_INVALID', 'Invalid or missing CSRF token.');
        if (!hash_equals($cookie, $header)) throw new HttpException(403, 'CSRF_INVALID', 'CSRF token mismatch.');
    }

    /** @param array<string,string> $cors */
    private function finish(Request $req, Response $res, array $cors, string $requestId): Response
    {
        foreach (self::securityHeaders($this->config, $req->isHttps) as $k => $v) $res->headers[$k] = $v;
        foreach ($cors as $k => $v) $res->headers[$k] = $v;
        $res->headers['Vary'] = 'Origin';
        $res->headers['X-Request-Id'] = $requestId;
        if (!isset($res->headers['Cache-Control'])) $res->headers['Cache-Control'] = 'no-store';
        foreach ($req->attributes['pendingCookies'] ?? [] as $c) $res->cookies[] = $c;
        if ($req->method === 'HEAD') $res->body = null;
        return $res;
    }

    /** @return array<string,string> */
    public static function securityHeaders(Config $c, bool $https): array
    {
        $h = ['X-Content-Type-Options' => 'nosniff', 'Referrer-Policy' => 'strict-origin-when-cross-origin', 'X-Frame-Options' => 'DENY',
            'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'", 'Permissions-Policy' => 'microphone=(self), camera=(self), geolocation=()',
            'Cross-Origin-Opener-Policy' => 'same-origin'];
        if ($https && $c->hstsMaxAge > 0) $h['Strict-Transport-Security'] = 'max-age=' . $c->hstsMaxAge;
        return $h;
    }
}
