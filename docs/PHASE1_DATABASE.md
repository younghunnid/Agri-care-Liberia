# Phase 1 Database Design — Agriccare Liberia

## Schema Isolation & Standards

- Dedicated database (`./data/agri_advisory.db` for Node/SQLite runtime; `team8_agri_advisory` for MySQL 8 / MariaDB).
- `utf8mb4` character set and `InnoDB` engine in MySQL; `PRAGMA foreign_keys = ON` and WAL mode in SQLite.
- Versioned migrations tracked in `schema_migrations`.

## Normalized Tables

| Table | Purpose |
| :--- | :--- |
| `users`, `roles`, `user_roles` | Core identity and multi-role RBAC (`farmer`, `expert`, `admin`) |
| `farmer_profiles`, `language_preferences` | 15-county location, preferred language, and crops of interest |
| `expert_profiles` | Extension specialty, county, bio, and admin approval status |
| `crops`, `guide_categories` | 6 Liberian staple/vegetable crops and 9 advisory categories |
| `agricultural_guides`, `guide_translations`, `guide_reviews` | Versioned guides, per-language reviewed variants, and editorial audit trail |
| `advisory_questions`, `advisory_messages`, `expert_assignments` | End-to-end human expert consultation workflow |
| `advisor_conversations`, `saved_advice` | Logged AI queries and farmer-bookmarked advice |
| `feedback`, `password_resets`, `rate_limit_attempts`, `audit_logs`, `platform_settings` | Community feedback, secure reset hashes, throttling, audit trail, and runtime config |
