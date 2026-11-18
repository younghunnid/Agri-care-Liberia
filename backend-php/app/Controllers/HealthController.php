<?php
declare(strict_types=1);

namespace Agri\Controllers;

use Agri\Http\App;
use Agri\Http\Request;
use Agri\Http\Response;

/** GET /api/v1/health — same fields and order as the Node reference; failures never expose database error text. */
final class HealthController
{
    public function __construct(private App $app) {}

    public function __invoke(Request $req, array $params = []): Response
    {
        try {
            $pdo = $this->app->pdo();
            $mig = $pdo->query('SELECT version FROM schema_migrations ORDER BY applied_at DESC, version DESC LIMIT 1')->fetchColumn();
            $guides = (int)$pdo->query("SELECT COUNT(*) FROM agricultural_guides WHERE is_published = 1 AND review_status = 'approved'")->fetchColumn();
            $ms = (int)floor(fmod(microtime(true), 1) * 1000);
            $key = $this->app->config->geminiKey;
            return Response::json(200, [
                'status' => 'ok',
                'service' => 'agri-advisory-liberia-api',
                'apiVersion' => 'v1',
                'database' => 'connected',
                'latestMigration' => $mig === false ? null : (string)$mig,
                'publishedGuides' => $guides,
                'aiConfigured' => $key !== '' && $key !== 'MY_GEMINI_API_KEY' && strlen($key) > 10,
                'timestamp' => gmdate('Y-m-d\TH:i:s') . sprintf('.%03dZ', $ms),
            ]);
        } catch (\Throwable $e) {
            $this->app->logger->error('health check failed', ['type' => $e::class, 'message' => $e->getMessage()]);
            return Response::json(500, ['status' => 'error', 'error' => ['code' => 'HEALTH_CHECK_FAILED', 'message' => 'Database error']]);
        }
    }
}
