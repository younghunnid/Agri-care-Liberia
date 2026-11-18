<?php
declare(strict_types=1);

namespace Agri\Migrations;

use PDO;
use RuntimeException;

/**
 * Forward-only migration runner. Checksummed ledger, advisory lock, dry run, engine preflight.
 * MySQL DDL is not transactional: a failed file stops the run and is reported with the failing statement; nothing is rolled back
 * automatically and the ledger records only fully applied files (recovery = restore the pre-migration backup).
 */
final class Runner
{
    public const MIN_MYSQL = '8.0.16';
    public const MIN_MARIADB = '10.4.0';
    public const LOCK_NAME = 'agri_migrate';

    public function __construct(private PDO $pdo, private string $dir, private ?\Closure $log = null) {}

    private function say(string $m): void { if ($this->log) ($this->log)($m); }

    /** @return array{engine:string,version:string,warnings:list<string>} */
    public function preflight(): array
    {
        $ver = (string)$this->pdo->query('SELECT VERSION()')->fetchColumn();
        $isMaria = stripos($ver, 'mariadb') !== false;
        $num = preg_replace('/[^0-9.].*$/', '', preg_replace('/^5\.5\.5-/', '', $ver)) ?? '';
        $min = $isMaria ? self::MIN_MARIADB : self::MIN_MYSQL;
        if (version_compare($num, $min, '<')) {
            throw new RuntimeException(sprintf('%s %s is below the supported minimum %s.', $isMaria ? 'MariaDB' : 'MySQL', $num, $min));
        }
        $warn = [];
        $pk = (int)$this->pdo->query('SELECT @@max_allowed_packet')->fetchColumn();
        if ($pk < 16 * 1048576) $warn[] = sprintf('max_allowed_packet is %.1f MB (< 16 MB): 2.5 MB data URLs may be rejected. Raise it or enable protected file storage.', $pk / 1048576);
        $lc = (int)$this->pdo->query('SELECT @@lower_case_table_names')->fetchColumn();
        if ($lc !== 0) $warn[] = "lower_case_table_names=$lc (case-insensitive host): identifier case errors will not be caught here; the linter enforces lowercase.";
        if ((string)$this->pdo->query('SELECT @@time_zone')->fetchColumn() !== '+00:00') throw new RuntimeException('Session time_zone is not +00:00.');
        return ['engine' => $isMaria ? 'MariaDB' : 'MySQL', 'version' => $num, 'warnings' => $warn];
    }

    /** @return list<array{version:string,path:string,checksum:string}> */
    public function files(): array
    {
        $out = [];
        foreach (glob(rtrim($this->dir, '/') . '/*.sql') ?: [] as $p) {
            if (!preg_match('/^(\d{3})_[a-z0-9_]+\.sql$/', basename($p))) throw new RuntimeException('Bad migration file name: ' . basename($p));
            $out[] = ['version' => basename($p, '.sql'), 'path' => $p, 'checksum' => hash('sha256', (string)file_get_contents($p))];
        }
        usort($out, fn($a, $b) => strcmp($a['version'], $b['version']));
        return $out;
    }

    private function ledgerExists(): bool
    {
        return (int)$this->pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'")->fetchColumn() > 0;
    }

    private function userTableCount(): int
    {
        return (int)$this->pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> 'schema_migrations'")->fetchColumn();
    }

    /** @return array<string,string> version => checksum */
    private function applied(): array
    {
        if (!$this->ledgerExists()) return [];
        $r = [];
        foreach ($this->pdo->query('SELECT version, checksum FROM schema_migrations ORDER BY version') as $row) $r[$row['version']] = $row['checksum'];
        return $r;
    }

    /** @return list<array{version:string,state:string}> state: applied | pending | changed | missing */
    public function status(): array
    {
        $applied = $this->applied();
        $out = [];
        $seen = [];
        foreach ($this->files() as $f) {
            $seen[$f['version']] = true;
            $out[] = ['version' => $f['version'], 'state' => !isset($applied[$f['version']]) ? 'pending' : ($applied[$f['version']] === $f['checksum'] ? 'applied' : 'changed')];
        }
        foreach ($applied as $v => $_) if (!isset($seen[$v])) $out[] = ['version' => $v, 'state' => 'missing'];
        return $out;
    }

    /** @return list<string> statements */
    public static function split(string $sql): array
    {
        $sql = Linter::stripComments($sql);
        $parts = preg_split('/;\s*(?:\R|$)/', $sql) ?: [];
        return array_values(array_filter(array_map('trim', $parts), fn($s) => $s !== ''));
    }

    /** @return list<string> versions applied (or that would be applied on a dry run) */
    public function up(bool $dryRun = false): array
    {
        $pf = $this->preflight();
        foreach ($pf['warnings'] as $w) $this->say("warning: $w");
        $files = $this->files();
        foreach ($files as $f) {
            $viol = Linter::lint($f['path'], (string)file_get_contents($f['path']));
            if ($viol) throw new RuntimeException("Lint failed:\n  " . implode("\n  ", $viol));
        }
        if (!$dryRun) {
            if (!(int)$this->pdo->query("SELECT GET_LOCK('" . self::LOCK_NAME . "', 0)")->fetchColumn()) {
                throw new RuntimeException('Another migration run holds the lock.');
            }
        }
        try {
            $applied = $this->applied();
            foreach ($this->status() as $s) {
                if ($s['state'] === 'changed') throw new RuntimeException("Migration {$s['version']} was modified after it was applied (checksum mismatch). Migrations are forward-only: add a new file.");
                if ($s['state'] === 'missing') throw new RuntimeException("Applied migration {$s['version']} has no file on disk.");
            }
            if (!$applied && $this->userTableCount() > 0) {
                throw new RuntimeException('Target schema is not empty but has no migration ledger. Refusing to run against an unmanaged database.');
            }
            $pending = array_values(array_filter($files, fn($f) => !isset($applied[$f['version']])));
            $done = [];
            if ($dryRun) {
                foreach ($pending as $f) { $this->say(sprintf('[dry-run] would apply %s (%d statements)', $f['version'], count(self::split((string)file_get_contents($f['path']))))); $done[] = $f['version']; }
                return $done;
            }
            if (!$this->ledgerExists()) {
                $this->pdo->exec('CREATE TABLE schema_migrations (
                    version VARCHAR(100) NOT NULL,
                    checksum CHAR(64) NOT NULL,
                    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                    execution_ms INT UNSIGNED NOT NULL DEFAULT 0,
                    PRIMARY KEY (version)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
            }
            foreach ($pending as $f) {
                $t0 = microtime(true);
                foreach (self::split((string)file_get_contents($f['path'])) as $i => $stmt) {
                    try { $this->pdo->exec($stmt); }
                    catch (\Throwable $e) {
                        throw new RuntimeException(sprintf("Migration %s failed at statement %d: %s\n  %s\nNothing is recorded in the ledger for this file; restore the pre-migration backup before retrying.", $f['version'], $i + 1, $e->getMessage(), substr(preg_replace('/\s+/', ' ', $stmt) ?? '', 0, 160)));
                    }
                }
                $ms = (int)round((microtime(true) - $t0) * 1000);
                $this->pdo->prepare('INSERT INTO schema_migrations (version, checksum, execution_ms) VALUES (?, ?, ?)')->execute([$f['version'], $f['checksum'], $ms]);
                $this->say("applied {$f['version']} ({$ms} ms)");
                $done[] = $f['version'];
            }
            return $done;
        } finally {
            if (!$dryRun) $this->pdo->query("SELECT RELEASE_LOCK('" . self::LOCK_NAME . "')")->fetchAll();
        }
    }
}
