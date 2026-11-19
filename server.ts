import {assertSafeTestEnvironment} from './server/testGuard.ts';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import {createServer as createViteServer} from 'vite';
import {getDb} from './server/db.ts';
import {seedInitialData} from './server/seed.ts';
import {sessionMiddleware} from './server/security.ts';
import {getAuthConfig} from './server/authConfig.ts';
import {v1Router} from './server/routes/v1.ts';

export async function createApp() {
  // Initialize isolated database, run migrations, and seed sample demonstration dataset
  assertSafeTestEnvironment(); // refuses APP_ENV=test on the default database BEFORE anything is opened
  const authCfg = getAuthConfig(); // fails fast on unsafe SMS/OTP settings (e.g. the simulated provider in production)
  if (authCfg.smsProvider === 'none') console.warn('[auth] SMS_PROVIDER=none: sign-in from a NEW device and SMS password recovery are unavailable (fail closed). Trusted devices still work.');
  else console.warn(`[auth] SMS_PROVIDER=simulated: DEMO MODE${authCfg.demoEnvironment ? ' (APP_ENV=demo, protected hackathon environment)' : ''}. Verification messages are simulated and nothing is sent.${authCfg.demoInlineInbox ? ' The in-website Demo SMS Inbox is ON.' : ''}`);
  getDb();
  seedInitialData();

  const app = express();
  app.set('trust proxy', 1);

  // Security headers (preserve iframe compatibility in preview environments)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // CORS allowlist
  const allowedOrigins = new Set(
    [process.env.APP_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'].filter(Boolean)
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const host = req.get('host');
    const isSameHost =
      Boolean(origin && host) &&
      (origin === `https://${host}` || origin === `http://${host}`);
    if (origin && (allowedOrigins.has(origin) || isSameHost)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({limit: '4mb'}));
  app.use(cookieParser());
  app.use(sessionMiddleware);

  // Versioned API routes
  app.use('/api/v1', v1Router);

  // Test-only fixture API for the black-box test harness. Mounted only when APP_ENV=test (see server/testFixtures.ts).
  if (process.env.APP_ENV === 'test') {
    const {mountTestFixtures} = await import('./server/testFixtures.ts');
    mountTestFixtures(app);
  }

  // Vite dev middleware or production static build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  return app;
}

const isDirectEntry =
  process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectEntry) {
  const port = Number(process.env.PORT || 3000);
  createApp().then((app) => {
    const host = process.env.HOST || '0.0.0.0';
    app.listen(port, host, () => {
      console.log(`Agri-Advisory Liberia server running on http://${host}:${port}`);
    });
  });
}
