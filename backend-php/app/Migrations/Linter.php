<?php
declare(strict_types=1);

namespace Agri\Migrations;

/** Static portability rules so one SQL file behaves the same on MySQL 8.0 and MariaDB 10.4+. */
final class Linter
{
    private const RESERVED = ['key', 'rank', 'groups', 'system', 'row', 'rows', 'function', 'window', 'lead', 'lag', 'cume_dist', 'dense_rank', 'empty', 'except', 'grouping', 'json_table', 'lateral', 'of', 'over', 'percent_rank', 'recursive', 'row_number', 'virtual'];

    /** @return list<string> violations */
    public static function lint(string $file, string $sql): array
    {
        $v = [];
        $clean = self::stripComments($sql);
        $at = static fn(string $m): string => basename($file) . ': ' . $m;
        $rules = [
            '/\bIF\s+NOT\s+EXISTS\b(?!\s*\(?\s*`?[a-z_]+`?\s*\()/i' => null, // placeholder, handled below
        ];
        unset($rules);
        if (preg_match('/\bCREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/i', $clean)) $v[] = $at('CREATE INDEX IF NOT EXISTS is not portable (MySQL rejects it)');
        if (preg_match('/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/i', $clean)) $v[] = $at('ADD COLUMN IF NOT EXISTS is not portable (MySQL rejects it)');
        if (preg_match('/\bTIMESTAMP\b/i', $clean)) $v[] = $at('TIMESTAMP is forbidden; use DATETIME(3) UTC');
        if (preg_match('/\bON\s+UPDATE\b/i', $clean)) $v[] = $at('ON UPDATE is forbidden; updated_at is set by application code only on real edits');
        if (preg_match('/\bJSON\b(?!_)/i', $clean)) $v[] = $at('native JSON type is forbidden; use LONGTEXT + CHECK (JSON_VALID(col))');
        if (preg_match('/\bRETURNING\b/i', $clean)) $v[] = $at('RETURNING is not portable');
        if (preg_match('/\bSKIP\s+LOCKED\b/i', $clean)) $v[] = $at('SKIP LOCKED is not portable');
        if (preg_match('/\b(DROP\s+(TABLE|DATABASE|COLUMN|INDEX)|TRUNCATE)\b/i', $clean)) $v[] = $at('destructive statements are forbidden (forward-only, non-destructive migrations)');
        if (preg_match_all('/COLLATE[=\s]+([a-z0-9_]+)/i', $clean, $m)) {
            foreach ($m[1] as $c) if (strtolower($c) !== 'utf8mb4_unicode_ci') $v[] = $at("collation $c is not portable (only utf8mb4_unicode_ci)");
        }
        // Every table must declare engine, charset and collation.
        foreach (preg_split('/;\s*(?:\R|$)/', $clean) ?: [] as $stmt) {
            if (!preg_match('/^\s*CREATE\s+(?:TEMPORARY\s+)?TABLE\s+`?([A-Za-z0-9_]+)`?/i', $stmt, $x)) continue;
            $tail = (string)substr($stmt, (int)strrpos($stmt, ')'));
            if (!preg_match('/ENGINE\s*=\s*InnoDB/i', $tail) || !preg_match('/CHARSET\s*=\s*utf8mb4/i', $tail) || !preg_match('/COLLATE\s*=\s*utf8mb4_unicode_ci/i', $tail)) {
                $v[] = $at("table {$x[1]} must be ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            }
        }
        if (preg_match_all('/CREATE\s+TABLE\s+`?([A-Za-z0-9_]+)`?/i', $clean, $tn)) {
            foreach ($tn[1] as $n) if ($n !== strtolower($n)) $v[] = $at("table name $n must be lowercase (Linux hosts are case-sensitive)");
        }
        // Column lines: lowercase identifiers, reserved words, literal TEXT defaults.
        foreach (preg_split('/\R/', $clean) as $line) {
            if (!preg_match('/^\s*`?([A-Za-z_][A-Za-z0-9_]*)`?\s+(TINYTEXT|TEXT|MEDIUMTEXT|LONGTEXT|BIGINT|INT|SMALLINT|TINYINT|VARCHAR|CHAR|DATETIME|ENUM|DECIMAL)\b(.*)$/i', $line, $c)) continue;
            [$all, $name, $type, $rest] = $c;
            if ($name !== strtolower($name)) $v[] = $at("column $name must be lowercase");
            if (in_array(strtolower($name), self::RESERVED, true)) $v[] = $at("column $name is a reserved word on MySQL 8 and/or MariaDB");
            if (preg_match('/TEXT$/i', $type) && preg_match("/\bDEFAULT\s+'/i", $rest)) $v[] = $at("TEXT column $name has a literal default (rejected by MySQL); use DEFAULT ('') expression");
            if (preg_match('/^DATETIME$/i', $type) && !preg_match('/^\(3\)/', ltrim($rest))) $v[] = $at("column $name must be DATETIME(3)");
        }
        return array_values(array_unique($v));
    }

    public static function stripComments(string $sql): string
    {
        $sql = preg_replace('#/\*.*?\*/#s', '', $sql) ?? $sql;
        return preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
    }
}
