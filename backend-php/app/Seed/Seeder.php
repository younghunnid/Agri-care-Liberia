<?php
declare(strict_types=1);

namespace Agri\Seed;

use PDO;
use RuntimeException;

/** Reference seed (safe everywhere) and prototype/demo seed (only APP_ENV=test|development; refuses in production or when unset). */
final class Seeder
{
    private const REFERENCE_ORDER = ['roles', 'crops', 'guide_categories', 'agricultural_guides', 'guide_translations', 'platform_settings'];
    private const PROTOTYPE_ORDER = ['users', 'user_roles', 'farmer_profiles', 'expert_profiles', 'language_preferences', 'advisory_questions', 'advisory_messages', 'expert_assignments', 'marketplace_listings', 'marketplace_inquiries', 'local_language_recordings', 'demo_expert_requests'];
    private const DEMO_PASSWORD_ENV = [1 => 'DEMO_FARMER_PASSWORD', 2 => 'DEMO_EXPERT_PASSWORD'];

    public function __construct(private PDO $pdo, private string $seedDir) {}

    /** Matches the Node scrypt format `salt:hex` (N=16384,r=8,p=1; the 32-char hex salt is used as its UTF-8 bytes). */
    public static function hashPassword(string $password): string
    {
        $salt = bin2hex(random_bytes(16));
        $raw = sodium_crypto_pwhash_scryptsalsa208sha256(64, $password, $salt, SODIUM_CRYPTO_PWHASH_SCRYPTSALSA208SHA256_OPSLIMIT_INTERACTIVE, SODIUM_CRYPTO_PWHASH_SCRYPTSALSA208SHA256_MEMLIMIT_INTERACTIVE);
        return $salt . ':' . bin2hex($raw);
    }

    public static function verifyPassword(string $password, string $stored): bool
    {
        [$salt, $hex] = array_pad(explode(':', $stored, 2), 2, '');
        if (strlen($salt) !== 32 || $hex === '') return false;
        $raw = sodium_crypto_pwhash_scryptsalsa208sha256(64, $password, $salt, SODIUM_CRYPTO_PWHASH_SCRYPTSALSA208SHA256_OPSLIMIT_INTERACTIVE, SODIUM_CRYPTO_PWHASH_SCRYPTSALSA208SHA256_MEMLIMIT_INTERACTIVE);
        return hash_equals($hex, bin2hex($raw));
    }

    public static function assertNonProduction(?string $appEnv = null): void
    {
        $env = $appEnv ?? (getenv('APP_ENV') ?: '');
        if (!in_array($env, ['test', 'development'], true)) {
            throw new RuntimeException('Prototype/demo data and demo accounts can only be seeded when APP_ENV is explicitly "test" or "development" (current: "' . $env . '"). Refusing.');
        }
    }

    /** @return array<string,int> rows processed per table */
    public function reference(): array
    {
        return $this->load('reference.json', self::REFERENCE_ORDER, false);
    }

    /** @return array<string,int> */
    public function prototype(?string $appEnv = null): array
    {
        self::assertNonProduction($appEnv);
        foreach (self::DEMO_PASSWORD_ENV as $name) {
            if (strlen((string)getenv($name)) < 12) throw new RuntimeException("$name must be set (12+ characters) to seed demo accounts; demo passwords are never stored in the repository.");
        }
        $this->pdo->beginTransaction();
        try {
            $r = $this->load('prototype.json', self::PROTOTYPE_ORDER, true);
            $this->pdo->commit();
            return $r;
        } catch (\Throwable $e) { $this->pdo->rollBack(); throw $e; }
    }

    /** @return array<string,int> */
    private function load(string $file, array $order, bool $demo): array
    {
        $data = json_decode((string)file_get_contents(rtrim($this->seedDir, '/') . '/' . $file), true, 512, JSON_THROW_ON_ERROR);
        $counts = [];
        foreach ($order as $table) {
            $rows = $data[$table] ?? [];
            foreach ($rows as $row) {
                if ($demo && $table === 'users') $row['password_hash'] = self::hashPassword((string)getenv(self::DEMO_PASSWORD_ENV[(int)$row['id']] ?? 'DEMO_FARMER_PASSWORD'));
                $cols = array_keys($row);
                $sql = sprintf('INSERT INTO `%s` (%s) VALUES (%s) ON DUPLICATE KEY UPDATE %s', $table,
                    implode(',', array_map(fn($c) => "`$c`", $cols)), implode(',', array_fill(0, count($cols), '?')),
                    $demo ? '`' . $cols[0] . '` = `' . $cols[0] . '`' : implode(',', array_map(fn($c) => "`$c` = VALUES(`$c`)", $cols)));
                $this->pdo->prepare($sql)->execute(array_values($row));
            }
            $counts[$table] = count($rows);
        }
        return $counts;
    }

    /** Secure initial administrator from environment-supplied credentials (no password on argv, none stored in files). */
    public function bootstrapAdmin(): int
    {
        $phone = trim((string)getenv('ADMIN_BOOTSTRAP_PHONE'));
        $pass = (string)getenv('ADMIN_BOOTSTRAP_PASSWORD');
        $name = trim((string)(getenv('ADMIN_BOOTSTRAP_NAME') ?: 'Platform Administrator'));
        $email = trim((string)getenv('ADMIN_BOOTSTRAP_EMAIL')) ?: null;
        if (!preg_match('/^\+?[0-9]{7,15}$/', $phone)) throw new RuntimeException('ADMIN_BOOTSTRAP_PHONE must be 7-15 digits (optional leading +).');
        if (strlen($pass) < 12) throw new RuntimeException('ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters.');
        $roleId = $this->pdo->query("SELECT id FROM roles WHERE name = 'admin'")->fetchColumn();
        if ($roleId === false) throw new RuntimeException('Role "admin" not found: run the reference seed first.');
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare("INSERT INTO users (display_name, phone, email, password_hash, status) VALUES (?,?,?,?, 'active')")->execute([$name, $phone, $email, self::hashPassword($pass)]);
            $uid = (int)$this->pdo->lastInsertId();
            $this->pdo->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)')->execute([$uid, $roleId]);
            $this->pdo->prepare("INSERT INTO audit_logs (actor_user_id, actor_role, action, target_type, target_id, details_json) VALUES (NULL,'cli_bootstrap','admin_bootstrapped','user',?, '{}')")->execute([(string)$uid]);
            $this->pdo->commit();
            return $uid;
        } catch (\Throwable $e) { $this->pdo->rollBack(); throw $e; }
    }
}
