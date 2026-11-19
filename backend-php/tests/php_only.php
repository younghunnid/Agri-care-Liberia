<?php
declare(strict_types=1);
/**
 * Explicit allow-list of tables that exist ONLY in the PHP/MySQL schema (no SQLite counterpart in the Node reference).
 * The M2 structure-parity check subtracts exactly these tables and nothing else; every other difference still fails.
 *
 * Rules (enforced by tests/run.php checks 12b-12d):
 *  - names are lower-case and must NOT exist in the Node/SQLite schema;
 *  - each entry names the migration file that introduces it, which must be 002 or later (001_schema.sql is never edited and never
 *    contains an allow-listed table);
 *  - an entry is documentation + permission: adding a table to a migration without listing it here still fails the parity check.
 *
 * Currently EMPTY on purpose: M3.1 only prepares the mechanism. M4 will add 'user_sessions' (and any further auth tables) here together
 * with 002_auth.sql, after approval.
 */
return [
    // 'user_sessions' => ['migration' => '002_auth', 'reason' => 'server-side sessions (M4)'],
];
