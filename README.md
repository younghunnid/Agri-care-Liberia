# Agricare Liberia — Team 8 Inclusive Agricultural e-Advisory Platform (Phase 1)

**Problem Statement:** Timely, accessible farm advice for Liberian farmers, including those offline or in local languages.

**Isolation Notice:** This codebase (`Agricare Liberia`) is completely independent—with its own schema, credentials, migrations, and routes, and zero marketplace, payment, or inventory modules.

## Quick Start (Live Node.js + React 19 Full-Stack Preview)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
3. Bootstrap an initial Administrator account securely via CLI (never hardcoded):
   ```bash
   npm run db:bootstrap-admin -- --phone +231770000900 --name "Team 8 Admin" --password "<your-strong-password>"
   ```
4. Start the full-stack server on port 3000:
   ```bash
   npm run dev
   ```
5. Run automated checks:
   ```bash
   npm run lint
   npm run build
   npm run test:api
   ```

## Local macOS / XAMPP PHP 8.3+ & MySQL 8 Companion Setup

A normalized MySQL 8 / MariaDB schema and PHP 8.3+ PDO REST backend are included in `database/mysql/` and `php-backend/`.

1. Detect PHP >= 8.3 without modifying global system PATH:
   ```bash
   PHP_BIN="$(bash scripts/detect-php.sh)"
   ```
2. Create isolated MySQL database and apply schema:
   ```sql
   CREATE DATABASE team8_agri_advisory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
   ```bash
   mysql -u root team8_agri_advisory < database/mysql/001_initial_schema.sql
   ```
3. Bootstrap an admin user in PHP:
   ```bash
   "$PHP_BIN" php-backend/bin/bootstrap_admin.php +231770000900 "<your-strong-password>"
   ```
4. Start the PHP API server and Vite frontend:
   ```bash
   "$PHP_BIN" -S 127.0.0.1:8080 -t php-backend/public
   npm run dev
   ```

## Project Structure

- `src/` — React 19 + TypeScript + Tailwind CSS v4 + Vite PWA frontend (28 pages across public, farmer, expert, and admin roles)
- `server/` — Express + Node `node:sqlite` + `@google/genai` server-side `/api/v1/` runtime backend
- `php-backend/` — PHP 8.3+ PDO REST API companion backend
- `database/mysql/` — MySQL 8 / MariaDB `utf8mb4` `InnoDB` migrations
- `scripts/` — CLI admin bootstrap, PWA PNG generator, and macOS/XAMPP PHP detector
- `tests/` — Automated API & security verification tests
- `docs/` — Phase 1 architecture, database, security, UI/UX, test results, demo guide, and known issues
