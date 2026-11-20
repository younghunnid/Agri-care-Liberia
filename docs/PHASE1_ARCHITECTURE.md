# Phase 1 Architecture — Agriccare Liberia (Team 8)

## System Overview

Agriccare Liberia uses a decoupled client-server architecture with strict isolation from any external marketplace systems:

1. **Frontend SPA + PWA (`src/`, `vite.config.ts`)**
   - Built with React 19, TypeScript, React Router, Tailwind CSS v4, Lucide icons, and `vite-plugin-pwa` (Workbox).
   - Serves 28 routes organized by access boundary: 11 public pages, 5 authenticated farmer pages, 4 expert pages, and 8 administrator pages.
   - Offline guide caching uses `localStorage` + browser Cache API (`agri-offline-guide-assets-v1`) strictly for public, approved agricultural guides—never caching authentication tokens or private expert messages.

2. **Server-Side API (`/api/v1/*`)**
   - **Active Node.js Runtime (`server.ts`, `server/`)**: Express server on port `3000` with `node:sqlite` WAL storage (`./data/agri_advisory.db`), scrypt password hashing, HMAC-signed HTTP-only session cookies, CSRF header validation, rate limiting, and `@google/genai` (`gemini-4-hydrogen`) server-side AI orchestration.
   - **PHP 8.3+ & MySQL 8 Companion (`php-backend/`, `database/mysql/`)**: Mirrors the `/api/v1/` contract using PDO prepared statements (`ATTR_EMULATE_PREPARES => false`), Argon2id/bcrypt password hashing, hardened PHP sessions, and MySQL 8 `InnoDB` tables.

3. **Progressive Voice & Localization**
   - Voice input detects `SpeechRecognition` / `webkitSpeechRecognition`, previews transcripts for user confirmation before submission, and discloses that browser speech engines may not support Liberian English or local languages.
   - Text-to-speech uses `window.speechSynthesis` with explicit stop controls.
   - Localization supports Standard English (`en`), Reviewed Liberian English preview (`lre`), and upcoming Kpelle (`kpe`) / Bassa (`bas`) with safe fallback to English and zero invented translations.
