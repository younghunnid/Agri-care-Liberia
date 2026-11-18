#!/usr/bin/env php
<?php
declare(strict_types=1);
/** M3 unit tests (no network, no database). Usage: php backend-php/tests/m3_unit.php */
require __DIR__ . '/../app/autoload.php';

use Agri\Config\Config;
use Agri\Config\ConfigException;
use Agri\Http\Cookie;
use Agri\Http\HttpException;
use Agri\Http\Kernel;
use Agri\Http\Request;
use Agri\Http\Response;
use Agri\Http\Router;
use Agri\Support\Env;
use Agri\Support\Logger;

$root = dirname(__DIR__);
// Remove every scratch directory these tests create (only directories matching these exact prefixes in the system temp dir).
register_shutdown_function(static function (): void {
    foreach (glob(sys_get_temp_dir() . '/agri_{m3k,m3u,m3p,hyg,log}_*', GLOB_BRACE) ?: [] as $d) {
        if (!is_dir($d) || is_link($d)) continue;
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($d, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $f) { $f->isDir() && !$f->isLink() ? @rmdir($f->getPathname()) : @unlink($f->getPathname()); }
        @rmdir($d);
    }
});
$pass = 0; $fail = 0;
function t(string $name, callable $fn): void
{
    global $pass, $fail;
    try { $fn(); $pass++; echo "  ok   $name\n"; } catch (Throwable $e) { $fail++; echo "  FAIL $name: " . $e->getMessage() . "\n"; }
}
function ok(bool $c, string $m = 'assertion failed'): void { if (!$c) throw new RuntimeException($m); }
function eq(mixed $a, mixed $b, string $m = ''): void { if ($a !== $b) throw new RuntimeException(($m ? "$m: " : '') . 'got ' . var_export($a, true) . ', expected ' . var_export($b, true)); }
function throws(callable $f, string $needle, string $class = Throwable::class): void
{
    try { $f(); } catch (Throwable $e) { if (!($e instanceof $class)) throw new RuntimeException('wrong exception ' . $e::class . ': ' . $e->getMessage()); if ($needle !== '' && !str_contains($e->getMessage() . json_encode($e instanceof ConfigException ? $e->problems : []), $needle)) throw new RuntimeException("message lacks '$needle': " . $e->getMessage()); return; }
    throw new RuntimeException('no exception thrown');
}

$strong = fn() => bin2hex(random_bytes(24));
$prod = fn(array $o = []) => $o + ['APP_ENV' => 'production', 'SESSION_SECRET' => $strong(), 'OWNER_KEY_HMAC_SECRET' => $strong(), 'DB_HOST' => 'db.internal', 'DB_NAME' => 'agri', 'DB_USER' => 'agri_app', 'DB_PASS' => $strong(), 'APP_URL' => 'https://agri.example.org'];
$load = fn(array $env) => Config::load(new Env(null, $env), '/srv/agri');

echo "Config / environment\n";
t('valid production configuration loads', function () use ($prod, $load) { $c = $load($prod()); ok($c->strict && !$c->devFeaturesAllowed() && $c->env === 'production'); });
foreach (['SESSION_SECRET', 'OWNER_KEY_HMAC_SECRET', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'APP_URL', 'APP_ENV'] as $k) {
    t("production fails closed when $k is missing", function () use ($prod, $load, $k) { $e = $prod(); unset($e[$k]); throws(fn() => $load($e), $k, ConfigException::class); });
}
t('APP_ENV unset is validated as production, never lenient', function () use ($load) { throws(fn() => $load(['SESSION_SECRET' => str_repeat('a1', 16)]), 'APP_ENV', ConfigException::class); });
t('unknown APP_ENV is rejected', function () use ($prod, $load) { throws(fn() => $load($prod(['APP_ENV' => 'prod'])), 'APP_ENV', ConfigException::class); });
t('short session secret rejected', function () use ($prod, $load) { throws(fn() => $load($prod(['SESSION_SECRET' => 'abc123'])), 'SESSION_SECRET', ConfigException::class); });
t('placeholder session secret rejected', function () use ($prod, $load) { throws(fn() => $load($prod(['SESSION_SECRET' => 'change-me-change-me-change-me-12345'])), 'placeholder', ConfigException::class); });
t('low-variety secret rejected', function () use ($prod, $load) { throws(fn() => $load($prod(['OWNER_KEY_HMAC_SECRET' => str_repeat('ab', 20)])), 'OWNER_KEY_HMAC_SECRET', ConfigException::class); });
t('owner key secret has no silent dev fallback', function () use ($prod, $load) { $e = $prod(); unset($e['OWNER_KEY_HMAC_SECRET']); throws(fn() => $load($e + ['APP_ENV' => 'development']), 'OWNER_KEY_HMAC_SECRET', ConfigException::class); });
t('Node dev constant refused in production unless explicitly allowed', function () use ($prod, $load) {
    throws(fn() => $load($prod(['OWNER_KEY_HMAC_SECRET' => Config::DEV_OWNER_KEY_CONSTANT])), 'development constant', ConfigException::class);
    $c = $load($prod(['OWNER_KEY_HMAC_SECRET' => Config::DEV_OWNER_KEY_CONSTANT, 'ALLOW_LEGACY_OWNER_KEY_SECRET' => '1'])); ok($c->ownerKeySecret === Config::DEV_OWNER_KEY_CONSTANT);
});
t('production refuses root DB user and empty DB password', function () use ($prod, $load) { throws(fn() => $load($prod(['DB_USER' => 'root'])), 'root', ConfigException::class); throws(fn() => $load($prod(['DB_PASS' => ''])), 'DB_PASS', ConfigException::class); });
t('production requires an https APP_URL', function () use ($prod, $load) { throws(fn() => $load($prod(['APP_URL' => 'http://agri.example.org'])), 'APP_URL', ConfigException::class); });
t('wildcard CORS origin rejected in every environment', function () use ($prod, $load) {
    foreach (['*', 'https://*.example.org', 'https://ok.example.org,*'] as $o) { throws(fn() => $load($prod(['CORS_ALLOWED_ORIGINS' => $o])), 'wildcard', ConfigException::class); throws(fn() => $load($prod(['APP_ENV' => 'development', 'CORS_ALLOWED_ORIGINS' => $o])), 'wildcard', ConfigException::class); }
});
t('CORS origins must be bare https origins in production', function () use ($prod, $load) {
    throws(fn() => $load($prod(['CORS_ALLOWED_ORIGINS' => 'http://staging.example.org'])), 'https://', ConfigException::class);
    throws(fn() => $load($prod(['CORS_ALLOWED_ORIGINS' => 'https://staging.example.org/path'])), 'invalid origin', ConfigException::class);
    $c = $load($prod(['CORS_ALLOWED_ORIGINS' => 'https://staging.example.org'])); eq($c->allowedOrigins, ['https://staging.example.org', 'https://agri.example.org']);
});
t('localhost dev origins exist only outside production', function () use ($prod, $load) { ok(!in_array('http://localhost:3000', $load($prod())->allowedOrigins, true)); ok(in_array('http://localhost:3000', $load($prod(['APP_ENV' => 'development']))->allowedOrigins, true)); });
t('cross_site cookies refused in production, allowed in development', function () use ($prod, $load) { throws(fn() => $load($prod(['COOKIE_MODE' => 'cross_site'])), 'COOKIE_MODE', ConfigException::class); eq($load($prod(['APP_ENV' => 'development', 'COOKIE_MODE' => 'cross_site']))->cookieMode, 'cross_site'); });
foreach (['TEST_FIXTURE_TOKEN' => 'x1x1x1x1x1x1x1x1x1', 'APP_DEBUG' => '1', 'ENABLE_TEST_FIXTURES' => 'true', 'ENABLE_DEMO_SEED' => '1', 'AGRI_DISPOSABLE_DB_OK' => '1', 'DEMO_FARMER_PASSWORD' => 'whatever-demo-pass'] as $k => $v) {
    t("$k cannot be set in production or staging", function () use ($prod, $load, $k, $v) { throws(fn() => $load($prod([$k => $v])), $k, ConfigException::class); throws(fn() => $load($prod([$k => $v, 'APP_ENV' => 'staging'])), $k, ConfigException::class); });
}
t('APP_DEBUG works only in development/test', function () use ($prod, $load) { ok($load($prod(['APP_ENV' => 'development', 'APP_DEBUG' => '1']))->debug); ok(!$load($prod(['APP_ENV' => 'development']))->debug); });
t('ConfigException lists names and never values', function () use ($prod, $load) { $s = 'SuperSecretValue' . bin2hex(random_bytes(8)); try { $load($prod(['SESSION_SECRET' => 'x', 'DB_PASS' => $s, 'APP_URL' => 'http://x', 'OWNER_KEY_HMAC_SECRET' => $s . 'a'])); } catch (ConfigException $e) { ok(!str_contains($e->getMessage() . json_encode($e->problems), $s), 'secret value leaked'); return; } throw new RuntimeException('expected failure'); });
t('summary() contains no secrets', function () use ($prod, $load) { $c = $load($prod()); $j = json_encode($c->summary()); ok(!str_contains($j, $c->sessionSecret) && !str_contains($j, $c->db['pass']) && !str_contains($j, $c->ownerKeySecret)); });
t('MAX_BODY_BYTES bounds enforced', function () use ($prod, $load) { throws(fn() => $load($prod(['MAX_BODY_BYTES' => '99999999999'])), 'MAX_BODY_BYTES', ConfigException::class); eq($load($prod())->maxBodyBytes, 4194304); });
t('real environment variables win over the .env file', function () { $f = tempnam(sys_get_temp_dir(), 'env'); file_put_contents($f, "A_TEST_KEY_X=fromfile\nB_TEST_KEY_X='quoted value'\n# c\n"); putenv('A_TEST_KEY_X=fromenv'); $e = new Env($f); eq($e->get('A_TEST_KEY_X'), 'fromenv'); eq($e->get('B_TEST_KEY_X'), 'quoted value'); putenv('A_TEST_KEY_X'); eq($e->get('A_TEST_KEY_X'), 'fromfile'); unlink($f); });

echo "Cookies\n";
t('first_party over http: Lax, no Secure (development)', function () { $c = Cookie::build('agri_csrf', 'abc', false, false, false, 'first_party', 1000); ok(str_contains($c, 'SameSite=Lax') && !str_contains($c, 'Secure') && !str_contains($c, 'HttpOnly') && str_contains($c, 'Max-Age=604800') && str_contains($c, 'Path=/')); });
t('first_party over https: Lax + Secure, no SameSite=None/Partitioned', function () { $c = Cookie::build('agri_anon', 'abc', true, true, true, 'first_party', 1000); ok(str_contains($c, 'Secure') && str_contains($c, 'SameSite=Lax') && str_contains($c, 'HttpOnly') && !str_contains($c, 'None') && !str_contains($c, 'Partitioned')); });
t('production is always Secure even if https was not detected', function () { ok(str_contains(Cookie::build('x', 'y', true, false, true, 'first_party', 1), 'Secure')); });
t('cross_site over https equals the Node preview cookie', function () { $c = Cookie::build('agri_csrf', 'abc', false, true, false, 'cross_site', 1); ok(str_contains($c, 'SameSite=None') && str_contains($c, 'Secure') && str_contains($c, 'Partitioned')); });
t('cookie values are URL-encoded', function () { ok(str_contains(Cookie::build('n', 'a b;c', true, false, false, 'first_party', 1), 'n=a%20b%3Bc')); });

echo "Request\n";
$mkReq = fn(string $method = 'POST', array $h = [], string $body = '', string $path = '/api/v1/x') => new Request($method, $path, '', $h, [], $body, '127.0.0.1', false, 'h.test');
t('cookie header parsing (first value wins, decoded)', function () { eq(Request::parseCookies('a=1; b=hello%20world; a=2; broken'), ['a' => '1', 'b' => 'hello world']); });
t('empty body is []', fn() => eq($mkReq()->json(), []));
t('valid JSON object parsed', fn() => eq($mkReq('POST', ['content-type' => 'application/json; charset=utf-8'], '{"a":1}')->json(), ['a' => 1]));
t('malformed JSON -> 400 INVALID_JSON', function () use ($mkReq) { try { $mkReq('POST', ['content-type' => 'application/json'], '{bad')->json(); } catch (HttpException $e) { eq([$e->status, $e->errorCode], [400, 'INVALID_JSON']); return; } throw new RuntimeException('no exception'); });
t('scalar JSON -> 400', function () use ($mkReq) { try { $mkReq('POST', ['content-type' => 'application/json'], '"x"')->json(); } catch (HttpException $e) { eq($e->status, 400); return; } throw new RuntimeException('no exception'); });
t('wrong media type -> 415', function () use ($mkReq) { try { $mkReq('POST', ['content-type' => 'text/plain'], '{}')->json(); } catch (HttpException $e) { eq($e->status, 415); return; } throw new RuntimeException('no exception'); });
t('excessive JSON depth rejected', function () use ($mkReq) { try { $mkReq('POST', ['content-type' => 'application/json'], str_repeat('[', 100) . str_repeat(']', 100))->json(); } catch (HttpException $e) { eq($e->status, 400); return; } throw new RuntimeException('no exception'); });
t('Content-Length above the limit -> 413 before the body is read', function () { $_SERVER = ['REQUEST_METHOD' => 'POST', 'REQUEST_URI' => '/api/v1/x', 'CONTENT_LENGTH' => '5000', 'CONTENT_TYPE' => 'application/json']; try { Request::fromGlobals(1024, false, ''); } catch (HttpException $e) { eq($e->status, 413); return; } throw new RuntimeException('no exception'); });
t('actual body above the limit -> 413 (no Content-Length)', function () { $_SERVER = ['REQUEST_METHOD' => 'POST', 'REQUEST_URI' => '/api/v1/x']; try { Request::fromGlobals(1024, false, str_repeat('a', 2000)); } catch (HttpException $e) { eq($e->status, 413); return; } throw new RuntimeException('no exception'); });
t('invalid Content-Length / control chars in path rejected', function () { $_SERVER = ['REQUEST_METHOD' => 'POST', 'REQUEST_URI' => '/api/v1/x', 'CONTENT_LENGTH' => '-1']; try { Request::fromGlobals(1024, false, ''); throw new RuntimeException('cl accepted'); } catch (HttpException) {} $_SERVER = ['REQUEST_METHOD' => 'GET', 'REQUEST_URI' => '/api/%00x']; try { Request::fromGlobals(1024, false, ''); throw new RuntimeException('nul accepted'); } catch (HttpException) {} });
t('X-Forwarded-* are ignored unless TRUST_PROXY', function () { $_SERVER = ['REQUEST_METHOD' => 'GET', 'REQUEST_URI' => '/', 'REMOTE_ADDR' => '10.0.0.1', 'HTTP_X_FORWARDED_PROTO' => 'https', 'HTTP_X_FORWARDED_FOR' => '203.0.113.9']; $a = Request::fromGlobals(1024, false); ok(!$a->isHttps && $a->clientIp === '10.0.0.1'); $b = Request::fromGlobals(1024, true); ok($b->isHttps && $b->clientIp === '203.0.113.9'); });

echo "Router\n";
$r = new Router();
$r->add('GET', '/api/v1/a', fn() => 'a'); $r->add('POST', '/api/v1/a', fn() => 'a2'); $r->add('GET', '/api/v1/items/:id', fn($q, $p) => $p['id']);
t('static, param and trailing-slash matching', function () use ($r) { [$h, $p] = $r->dispatch('GET', '/api/v1/items/42/'); eq($h(null, $p), '42'); [$h2] = $r->dispatch('GET', '/api/v1/a'); eq($h2(), 'a'); });
t('HEAD maps to GET', function () use ($r) { [$h] = $r->dispatch('HEAD', '/api/v1/a'); eq($h(), 'a'); });
t('unknown path -> 404', function () use ($r) { try { $r->dispatch('GET', '/api/v1/zzz'); } catch (HttpException $e) { eq($e->status, 404); return; } throw new RuntimeException('no exception'); });
t('wrong method -> 405 with Allow', function () use ($r) { try { $r->dispatch('DELETE', '/api/v1/a'); } catch (HttpException $e) { eq($e->status, 405); ok(str_contains($e->headers['Allow'], 'GET') && str_contains($e->headers['Allow'], 'POST') && str_contains($e->headers['Allow'], 'OPTIONS')); return; } throw new RuntimeException('no exception'); });
t('param does not span slashes', function () use ($r) { try { $r->dispatch('GET', '/api/v1/items/1/2'); } catch (HttpException $e) { eq($e->status, 404); return; } throw new RuntimeException('no exception'); });

echo "Route table\n";
t('manifest holds all 61 Node routes; only health and csrf-token are implemented', function () use ($root) {
    $m = require $root . '/config/route_manifest.php'; eq(count($m), 61); ok(in_array(['GET', '/api/v1/health'], $m, true) && in_array(['GET', '/api/v1/csrf-token'], $m, true));
    $logDir = sys_get_temp_dir() . '/agri_m3u_' . bin2hex(random_bytes(3));
    $cfg = Config::load(new Env(null, ['APP_ENV' => 'development', 'SESSION_SECRET' => bin2hex(random_bytes(16)), 'OWNER_KEY_HMAC_SECRET' => bin2hex(random_bytes(16)), 'DB_HOST' => 'h', 'DB_NAME' => 'd', 'DB_USER' => 'u', 'LOG_DIR' => $logDir]), $root);
    $app = new Agri\Http\App($cfg, new Logger($logDir), fn() => throw new RuntimeException('no DB in unit tests')); $router = new Router(); (require $root . '/config/routes.php')($router, $app, $root);
    $kernel = Kernel::make($cfg, $router, new Logger($logDir));
    $csrf = bin2hex(random_bytes(24)); $implemented = 0;
    foreach ($m as [$method, $path]) {
        $url = preg_replace('#:[A-Za-z_]+#', '1', $path);
        $req = new Request($method, $url, '', ['cookie' => "agri_csrf=$csrf", 'x-csrf-token' => $csrf], ['agri_csrf' => $csrf], '', '127.0.0.1', false, 'h');
        $res = $kernel->handle($req, 'rid');
        if ($res->status !== 501) { $implemented++; ok(in_array($path, ['/api/v1/health', '/api/v1/csrf-token'], true), "$method $path answered {$res->status} but must not be implemented in M3"); }
    }
    eq($implemented, 2, 'implemented routes');
});

echo "Kernel: CORS, CSRF, errors, headers\n";
$kernelFor = function (array $over = [], ?Closure $extra = null) use ($root) {
    $logDir = sys_get_temp_dir() . '/agri_m3k_' . bin2hex(random_bytes(3));
    $env = $over + ['APP_ENV' => 'development', 'SESSION_SECRET' => bin2hex(random_bytes(16)), 'OWNER_KEY_HMAC_SECRET' => bin2hex(random_bytes(16)), 'DB_HOST' => 'h', 'DB_NAME' => 'd', 'DB_USER' => 'u', 'LOG_DIR' => $logDir, 'CORS_ALLOWED_ORIGINS' => 'https://app.example.org'];
    $cfg = Config::load(new Env(null, $env), $root);
    $router = new Router(); $router->add('GET', '/api/v1/boom', function () { throw new RuntimeException('SQLSTATE[HY000] password=hunter2 at /srv/secret/path.php'); });
    $router->add('POST', '/api/v1/echo', fn(Request $q) => Response::json(200, $q->json()));
    if ($extra) $extra($router);
    return [Kernel::make($cfg, $router, new Logger($logDir)), $logDir, $cfg];
};
$req = fn(string $m, string $p, array $h = [], string $body = '', bool $https = false, array $cookies = []) => new Request($m, $p, '', array_change_key_case($h, CASE_LOWER), $cookies, $body, '127.0.0.1', $https, 'h.test');
t('unhandled exception -> generic 500, trace only in the log, secrets redacted', function () use ($kernelFor, $req) {
    [$k, $logDir] = $kernelFor(); $res = $k->handle($req('GET', '/api/v1/boom'), 'rid123');
    eq($res->status, 500); $b = (string)$res->body; ok(str_contains($b, 'INTERNAL_ERROR') && str_contains($b, 'rid123'));
    foreach (['hunter2', 'SQLSTATE', '/srv/secret', '.php', 'Stack', '#0', 'RuntimeException'] as $bad) ok(!str_contains($b, $bad), "response leaks $bad");
    $log = (string)file_get_contents(glob($logDir . '/app-*.log')[0]); ok(str_contains($log, 'RuntimeException') && str_contains($log, 'rid123') && !str_contains($log, 'hunter2'), 'log should hold detail but not the password');
});
t('APP_DEBUG adds type/message in development only, still no trace', function () use ($kernelFor, $req) { [$k] = $kernelFor(['APP_DEBUG' => '1']); $b = (string)$k->handle($req('GET', '/api/v1/boom'), 'r')->body; ok(str_contains($b, '"debug"') && !str_contains($b, 'hunter2') && !str_contains($b, '#0')); });
t('security headers on success, errors and 404', function () use ($kernelFor, $req) {
    [$k] = $kernelFor(); foreach ([$req('GET', '/api/v1/boom'), $req('GET', '/api/v1/none'), $req('GET', '/nope'), $req('OPTIONS', '/api/v1/x')] as $q) {
        $res = $k->handle($q, 'r'); foreach (['X-Content-Type-Options' => 'nosniff', 'Referrer-Policy' => 'strict-origin-when-cross-origin', 'X-Frame-Options' => 'DENY'] as $h => $v) eq($res->getHeader($h), $v, "$h on {$q->path}");
        ok($res->getHeader('X-Request-Id') === 'r' && $res->getHeader('Cache-Control') === 'no-store');
    }
});
t('HSTS only over https and when configured', function () use ($kernelFor, $req) { [$k] = $kernelFor(['HSTS_MAX_AGE' => '31536000']); ok($k->handle($req('GET', '/api/v1/none', [], '', true), 'r')->getHeader('Strict-Transport-Security') === 'max-age=31536000'); ok($k->handle($req('GET', '/api/v1/none'), 'r')->getHeader('Strict-Transport-Security') === null); [$k2] = $kernelFor(); ok($k2->handle($req('GET', '/api/v1/none', [], '', true), 'r')->getHeader('Strict-Transport-Security') === null); });
t('CORS: allow-listed origin echoed with credentials; never *', function () use ($kernelFor, $req) {
    [$k] = $kernelFor(); $res = $k->handle($req('OPTIONS', '/api/v1/x', ['Origin' => 'https://app.example.org']), 'r');
    eq($res->status, 204); eq($res->getHeader('Access-Control-Allow-Origin'), 'https://app.example.org'); eq($res->getHeader('Access-Control-Allow-Credentials'), 'true'); ok(str_contains((string)$res->getHeader('Access-Control-Allow-Headers'), 'X-CSRF-Token')); ok($res->getHeader('Vary') === 'Origin');
});
t('CORS: unknown origin, "null" origin and look-alikes get no CORS headers (also on GET)', function () use ($kernelFor, $req) {
    [$k] = $kernelFor(); foreach (['https://evil.example', 'null', 'https://app.example.org.evil.example', 'http://app.example.org', 'https://APP.example.org.'] as $o) foreach (['OPTIONS', 'GET'] as $m) {
        $res = $k->handle($req($m, '/api/v1/none', ['Origin' => $o]), 'r'); ok($res->getHeader('Access-Control-Allow-Origin') === null && $res->getHeader('Access-Control-Allow-Credentials') === null, "origin $o got CORS headers");
    }
});
t('CORS: same-host origin allowed (Node parity)', function () use ($kernelFor, $req) { [$k] = $kernelFor(); eq($k->handle($req('GET', '/api/v1/none', ['Origin' => 'http://h.test']), 'r')->getHeader('Access-Control-Allow-Origin'), 'http://h.test'); });
t('OPTIONS never needs CSRF and issues no cookies', function () use ($kernelFor, $req) { [$k] = $kernelFor(); $res = $k->handle($req('OPTIONS', '/api/v1/echo'), 'r'); eq($res->status, 204); eq($res->cookies, []); });
t('session cookies issued once; valid existing cookies are kept', function () use ($kernelFor, $req) {
    [$k] = $kernelFor(); $res = $k->handle($req('GET', '/api/v1/none'), 'r'); eq(count($res->cookies), 2);
    $anon = bin2hex(random_bytes(16)); $csrf = bin2hex(random_bytes(24)); $res2 = $k->handle($req('GET', '/api/v1/none', [], '', false, ['agri_anon' => $anon, 'agri_csrf' => $csrf]), 'r'); eq($res2->cookies, []);
    $res3 = $k->handle($req('GET', '/api/v1/none', [], '', false, ['agri_anon' => 'not-hex!', 'agri_csrf' => 'short']), 'r'); eq(count($res3->cookies), 2, 'invalid cookies are replaced');
});
t('CSRF: missing, mismatched and valid tokens', function () use ($kernelFor, $req) {
    [$k] = $kernelFor(); $tok = bin2hex(random_bytes(24));
    $a = $k->handle($req('POST', '/api/v1/echo'), 'r'); eq($a->status, 403); ok(str_contains((string)$a->body, 'Invalid or missing CSRF token.'));
    $b = $k->handle($req('POST', '/api/v1/echo', ['x-csrf-token' => 'other-token-of-some-length'], '', false, ['agri_csrf' => $tok]), 'r'); eq($b->status, 403); ok(str_contains((string)$b->body, 'CSRF token mismatch.'));
    $c = $k->handle($req('POST', '/api/v1/echo', ['x-csrf-token' => $tok, 'content-type' => 'application/json'], '{"a":1}', false, ['agri_csrf' => $tok]), 'r'); eq($c->status, 200); eq((string)$c->body, '{"a":1}');
    $d = $k->handle($req('POST', '/api/v1/echo', ['x-csrf-token' => 'short'], '', false, ['agri_csrf' => 'short']), 'r'); eq($d->status, 403, 'tokens shorter than 16 are never valid');
    foreach (['PATCH', 'DELETE'] as $m) eq($k->handle($req($m, '/api/v1/echo'), 'r')->status, 403, "$m needs CSRF");
});
t('malformed JSON is rejected before any cookie is issued', function () use ($kernelFor, $req) { [$k] = $kernelFor(); $res = $k->handle($req('POST', '/api/v1/echo', ['content-type' => 'application/json'], '{nope'), 'r'); eq($res->status, 400); eq($res->cookies, []); ok(str_contains((string)$res->body, 'INVALID_JSON')); });
t('unsupported method TRACE/CONNECT -> 405', function () use ($kernelFor, $req) { [$k] = $kernelFor(); foreach (['TRACE', 'CONNECT', 'PROPFIND'] as $m) eq($k->handle($req($m, '/api/v1/echo'), 'r')->status, 405); });
t('paths outside /api and traversal-looking paths -> 404 JSON', function () use ($kernelFor, $req) { [$k] = $kernelFor(); foreach (['/', '/index.html', '/.env', '/api/../.env', '/apix/v1/health'] as $p) { $r = $k->handle($req('GET', $p), 'r'); eq($r->status, 404, $p); ok(str_contains((string)$r->getHeader('Content-Type'), 'application/json')); } });
t('HEAD returns no body', function () use ($kernelFor, $req) { [$k] = $kernelFor(); $r = $k->handle($req('HEAD', '/api/v1/none'), 'r'); ok($r->body === null); });
t('production kernel always marks cookies Secure', function () use ($root, $req) {
    $logDir = sys_get_temp_dir() . '/agri_m3p_' . bin2hex(random_bytes(3)); $s = fn() => bin2hex(random_bytes(24));
    $cfg = Config::load(new Env(null, ['APP_ENV' => 'production', 'SESSION_SECRET' => $s(), 'OWNER_KEY_HMAC_SECRET' => $s(), 'DB_HOST' => 'h', 'DB_NAME' => 'd', 'DB_USER' => 'app', 'DB_PASS' => $s(), 'APP_URL' => 'https://agri.example.org', 'LOG_DIR' => $logDir]), $root);
    $k = Kernel::make($cfg, new Router(), new Logger($logDir)); $res = $k->handle($req('GET', '/api/v1/none'), 'r'); eq(count($res->cookies), 2); foreach ($res->cookies as $c) ok(str_contains($c, 'Secure') && str_contains($c, 'SameSite=Lax'), $c);
});

echo "Logger\n";
t('redaction by key and by value shape', function () {
    $r = Logger::redact(['password' => 'p', 'api_key' => 'k', 'nested' => ['Authorization' => 'Bearer x', 'ok' => 'fine'], 'msg' => 'login failed password=abc123 for u', 'h' => 'a' . str_repeat('b', 31) . ':' . str_repeat('c', 128)]);
    eq($r['password'], '[redacted]'); eq($r['api_key'], '[redacted]'); eq($r['nested']['Authorization'], '[redacted]'); eq($r['nested']['ok'], 'fine'); ok(!str_contains($r['msg'], 'abc123')); ok(str_contains($r['h'], 'redacted-hash'), $r['h']);
});
t('log files are private (0600) and JSON lines', function () { $d = sys_get_temp_dir() . '/agri_log_' . bin2hex(random_bytes(3)); (new Logger($d, 'rq1'))->error('x', ['a' => 1]); $f = glob($d . '/app-*.log')[0]; eq(substr(sprintf('%o', fileperms($f)), -4), '0600'); $j = json_decode(trim((string)file_get_contents($f)), true); eq($j['request_id'], 'rq1'); });

echo "Deployment hygiene\n";
t('hygiene flags a world-readable .env, a log dir and an app dir inside the web root', function () use ($prod, $load) {
    $d = sys_get_temp_dir() . '/agri_hyg_' . bin2hex(random_bytes(3)); mkdir($d . '/app/logs', 0700, true); file_put_contents($d . '/.env', 'X=1'); chmod($d . '/.env', 0644);
    $cfg = $load($prod(['LOG_DIR' => $d . '/app/logs']));
    $w = implode('|', Agri\Bootstrap::hygiene($cfg, $d, $d));
    ok(str_contains($w, '.env is readable') && str_contains($w, 'LOG_DIR is inside the web root') && str_contains($w, 'application directory is inside'), $w);
    chmod($d . '/.env', 0600); $ok = Agri\Bootstrap::hygiene($cfg, $d, $d . '/elsewhere'); ok(!str_contains(implode('|', $ok), '.env is readable'), 'chmod 600 .env must pass');
    $cfgDev = $load($prod(['APP_ENV' => 'development', 'LOG_DIR' => $d . '/app/logs'])); chmod($d . '/.env', 0644); ok(!str_contains(implode('|', Agri\Bootstrap::hygiene($cfgDev, $d, '')), '.env is readable'), 'development is not nagged');
});
t('front controller refuses PHP < 8.2 with a clean JSON error', function () use ($root) { $src = (string)file_get_contents($root . '/public/index.php'); ok(str_contains($src, 'PHP_VERSION_ID < 80200') && strpos($src, 'PHP_VERSION_ID') < strpos($src, 'autoload.php')); });
t('httpoxy variable is removed at boot', function () use ($root) { $src = (string)file_get_contents($root . '/app/Bootstrap.php'); ok(str_contains($src, "putenv('HTTP_PROXY')")); $ht = (string)file_get_contents($root . '/public/.htaccess'); ok(str_contains($ht, 'RequestHeader unset Proxy early')); });

echo "\nM3 unit tests: $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
