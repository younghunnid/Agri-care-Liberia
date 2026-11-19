<?php
declare(strict_types=1);

namespace Agri\Controllers;

use Agri\Http\App;
use Agri\Http\HttpException;
use Agri\Http\Request;
use Agri\Http\Response;
use Agri\Support\FileStore;

/**
 * GET /api/v1/health — same fields and order as the Node reference.
 *
 *  - Public contract response: the database-derived part is served from a short private file cache (default 15 s; failures 3 s) so that
 *    many phones polling every 30 s cost at most a few database checks per minute. `timestamp` is always the response time. The `_`
 *    cache-buster query parameter is ignored.
 *  - GET /api/v1/health?deep=1: live checks, no cache, only with the `X-Health-Token` header (HEALTH_DEEP_TOKEN, constant-time compare),
 *    rate limited per client (counted BEFORE the token is checked, so guessing is throttled too). If no token is configured the deep
 *    check does not exist (404). The token is never accepted in the URL (URLs are logged).
 *  - Neither response ever contains database error text, hostnames, paths, versions or credentials; details go to the private log only.
 */
final class HealthController
{
    public function __construct(private App $app) {}

    public function __invoke(Request $req, array $params = []): Response
    {
        parse_str($req->queryString, $q);
        if (array_key_exists('deep', $q)) return $this->deep($req);
        return $this->public();
    }

    private function public(): Response
    {
        $cfg = $this->app->config;
        $ttl = $cfg->health['ttl'];
        $file = $cfg->cacheDir . '/health-' . substr(hash('sha256', $cfg->db['host'] . '|' . $cfg->db['port'] . '|' . $cfg->db['name']), 0, 16) . '.json';
        $now = time();
        if ($ttl > 0) {
            $hit = $this->fresh($file, $now);
            if ($hit !== null) return $this->render($hit, 'HIT');
        }
        // Single refresher at a time; the others serve a slightly stale entry (<= 60 s) instead of piling onto the database.
        $lock = null;
        if ($ttl > 0 && FileStore::ensureDir($cfg->cacheDir)) {
            $old = function_exists('umask') ? umask(0077) : null;
            $lock = @fopen($file . '.lock', 'c');
            if ($old !== null) umask($old);
            if ($lock !== false && !flock($lock, LOCK_EX | LOCK_NB)) {
                fclose($lock);
                $lock = null;
                $stale = $this->read($file);
                if ($stale !== null && $now - $stale['t'] <= 60) return $this->render($stale, 'STALE');
            } elseif ($lock !== false) {
                $again = $this->fresh($file, $now);   // someone refreshed while we waited for the lock
                if ($again !== null) { flock($lock, LOCK_UN); fclose($lock); return $this->render($again, 'HIT'); }
            } else $lock = null;
        }
        try {
            $entry = ['t' => $now, 'ok' => false, 'data' => $this->check(false)];
            $entry['ok'] = $entry['data'] !== null;
            if ($ttl > 0) FileStore::writeAtomic($file, json_encode($entry) ?: '');
            return $this->render($entry, 'MISS');
        } finally {
            if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
        }
    }

    private function deep(Request $req): Response
    {
        $cfg = $this->app->config;
        $token = $cfg->health['deepToken'];
        if ($token === null) throw new HttpException(404, 'NOT_FOUND', 'The requested resource was not found.');
        $key = hash_hmac('sha256', 'health-deep|' . $req->clientIp, $cfg->ipHashSecret ?? $cfg->sessionSecret);
        if (!FileStore::rateHit($cfg->cacheDir, 'health-deep', $key, $cfg->health['deepPerMinute'], 60)) {
            throw new HttpException(429, 'RATE_LIMITED', 'Too many requests. Try again later.', ['Retry-After' => '60', 'Cache-Control' => 'no-store']);
        }
        $given = $req->header('x-health-token') ?? '';
        if (!hash_equals(hash('sha256', $token), hash('sha256', $given))) {
            $this->app->logger->warning('deep health check refused: bad or missing token');
            throw new HttpException(403, 'FORBIDDEN', 'Access denied.', ['Cache-Control' => 'no-store']);
        }
        $t0 = microtime(true);
        $data = $this->check(true);
        $r = $data === null ? ['status' => 'error', 'error' => ['code' => 'HEALTH_CHECK_FAILED', 'message' => 'Database error']]
            : $data + ['deep' => true, 'dbLatencyMs' => (int)round((microtime(true) - $t0) * 1000), 'cacheDirWritable' => FileStore::ensureDir($cfg->cacheDir), 'logDirWritable' => is_dir($cfg->logDir) && is_writable($cfg->logDir)];
        return Response::json($data === null ? 500 : 200, $r, ['Cache-Control' => 'no-store']);
    }

    /** Live check. @return array<string,mixed>|null the contract body (without timestamp) or null on failure */
    private function check(bool $deep): ?array
    {
        try {
            $pdo = $this->app->pdo();
            $mig = $pdo->query('SELECT version FROM schema_migrations ORDER BY applied_at DESC, version DESC LIMIT 1')->fetchColumn();
            $guides = (int)$pdo->query("SELECT COUNT(*) FROM agricultural_guides WHERE is_published = 1 AND review_status = 'approved'")->fetchColumn();
            $key = $this->app->config->geminiKey;
            $d = [
                'status' => 'ok',
                'service' => 'agri-advisory-liberia-api',
                'apiVersion' => 'v1',
                'database' => 'connected',
                'latestMigration' => $mig === false ? null : (string)$mig,
                'publishedGuides' => $guides,
                'aiConfigured' => $key !== '' && $key !== 'MY_GEMINI_API_KEY' && strlen($key) > 10,
            ];
            if ($deep) $d['appliedMigrations'] = (int)$pdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn();
            return $d;
        } catch (\Throwable $e) {
            $this->app->logger->error('health check failed', ['type' => $e::class, 'message' => $e->getMessage()]);
            return null;
        }
    }

    /** @return array{t:int,ok:bool,data:?array}|null */
    private function read(string $file): ?array
    {
        $c = FileStore::readJson($file);
        if ($c === null || !isset($c['t'], $c['ok']) || !is_int($c['t']) || !is_bool($c['ok'])) return null;
        if ($c['ok']) {
            $d = $c['data'] ?? null;
            if (!is_array($d) || ($d['status'] ?? null) !== 'ok' || ($d['service'] ?? null) !== 'agri-advisory-liberia-api' || !is_int($d['publishedGuides'] ?? null)) return null;
        } else $c['data'] = null;
        return ['t' => $c['t'], 'ok' => $c['ok'], 'data' => $c['data']];
    }

    private function fresh(string $file, int $now): ?array
    {
        $c = $this->read($file);
        if ($c === null || $c['t'] > $now + 2) return null;      // unreadable, or from the future (clock change / tampering)
        $age = $now - $c['t'];
        $limit = $c['ok'] ? $this->app->config->health['ttl'] : $this->app->config->health['failTtl'];
        return $age < $limit ? $c : null;
    }

    private function render(array $entry, string $state): Response
    {
        $h = ['X-Health-Cache' => $state];
        if (!$entry['ok']) return Response::json(500, ['status' => 'error', 'error' => ['code' => 'HEALTH_CHECK_FAILED', 'message' => 'Database error']], $h);
        $ms = (int)floor(fmod(microtime(true), 1) * 1000);
        $d = $entry['data'];
        // Only the contract fields, in contract order (a tampered cache file cannot inject extra output).
        $out = [];
        foreach (['status', 'service', 'apiVersion', 'database', 'latestMigration', 'publishedGuides', 'aiConfigured'] as $k) $out[$k] = $d[$k] ?? null;
        $out['timestamp'] = gmdate('Y-m-d\TH:i:s') . sprintf('.%03dZ', $ms);
        return Response::json(200, $out, $h);
    }
}
