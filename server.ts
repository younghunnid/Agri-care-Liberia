import {assertSafeTestEnvironment} from './server/testGuard.ts';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import {getDb} from './server/db.ts';
import {seedInitialData} from './server/seed.ts';
import {sessionMiddleware} from './server/security.ts';
import {getAuthConfig} from './server/authConfig.ts';
import {checkStorage, getRuntimeConfig} from './server/runtime.ts';
import {findKnownDemoCredentials} from './server/demoGuard.ts';
import {markSharedDemoAccounts} from './server/security.ts';
import {seedDemoMarketData} from './server/demoMarket.ts';
import {stagingRouter} from './server/routes/staging.ts';
import {v1Router} from './server/routes/v1.ts';
import {registryMode} from './server/registryMode.ts';

// The application folder is where this file lives (works for `tsx server.ts` and for the built `server.js`, whatever the working directory is).
process.env.APP_ROOT ??= path.dirname(fileURLToPath(import.meta.url));

export async function createApp() {
  // Initialize isolated database, run migrations, and seed sample demonstration dataset
  assertSafeTestEnvironment(); // refuses APP_ENV=test on the default database BEFORE anything is opened
  const rt = getRuntimeConfig(); // fails fast on an unsafe deployment (secrets, database location, cookies, demo accounts)
  const authCfg = getAuthConfig(); // fails fast on unsafe SMS/OTP settings (e.g. the simulated provider in production)
  if (!authCfg.requireSms) console.warn('[auth] Phone number + password sign-in, NO SMS codes (AUTH_REQUIRE_SMS off). Phone numbers are stored as UNVERIFIED; password recovery needs verified assistance.');
  else if (authCfg.smsProvider === 'none') console.warn('[auth] SMS_PROVIDER=none: sign-in from a NEW device and SMS password recovery are unavailable (fail closed). Trusted devices still work.');
  else console.warn(`[auth] SMS_PROVIDER=simulated: DEMO MODE${authCfg.demoEnvironment ? ' (APP_ENV=demo, protected hackathon environment)' : ''}. Verification messages are simulated and nothing is sent.${authCfg.demoInlineInbox ? ' The in-website Demo SMS Inbox is ON.' : ''}`);
  if (rt.strict) checkStorage(rt.dbPath); // production/demo: the database folder must be writable and persistent
  getDb();
  if (rt.strict) {
    // Never serve a real or public deployment that contains accounts with PUBLISHED passwords (also in the demo environment: anyone could sign in).
    const known = findKnownDemoCredentials();
    if (known.length) throw new Error(`Refusing to start: this database contains demo accounts with published passwords (${known.join(', ')}). Use a fresh database or remove those accounts.`);
  }
  seedInitialData({demoAccounts: rt.enableDemoSeed, demoPasswords: rt.demoSeedPasswords ?? undefined});
  markSharedDemoAccounts();
  if (rt.enableDemoMarketData) seedDemoMarketData(); // SYNTHETIC farm-to-market demonstration data (never in production) // databases seeded before the flag existed: permanently flag accounts that still have the published passwords

  const app = express();
  app.set('trust proxy', rt.trustProxy);
  app.disable('x-powered-by');

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

  // Everything under /api is dynamic and may hold personal data (sessions, requests with photos, inquiries): never store it in a browser or shared cache.
  // The service worker's own offline cache for public guides is separate (Cache API) and unaffected.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Which kind of server is this? (lets the interface label a demonstration environment). No secrets, no account data.
  app.get('/api/v1/environment', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({demoEnvironment: rt.demoEnvironment, simulatedSms: authCfg.requireSms && authCfg.smsProvider === 'simulated', phoneVerification: authCfg.requireSms ? 'sms' : 'none', registryMode: registryMode(), syntheticAccountsOnly: rt.demoEnvironment});
  });

  // Staging diagnostics: exist ONLY when STAGING_DIAG_TOKEN is set (remove it after the staging tests).
  if (rt.stagingDiagToken) app.use('/api/v1/__staging', stagingRouter(rt));

  // Versioned API routes
  app.use('/api/v1', v1Router);

  // Test-only fixture API for the black-box test harness. Mounted only when APP_ENV=test (see server/testFixtures.ts).
  if (process.env.APP_ENV === 'test') {
    const {mountTestFixtures} = await import('./server/testFixtures.ts');
    mountTestFixtures(app);
  }

  // Unknown API paths are a JSON 404, never the single-page app.
  app.use('/api', (_req, res) => {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Unknown API endpoint.'}});
  });

  // Vite dev middleware or production static build
  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite'); // development only: not loaded in production
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
    const distDir = path.resolve(rt.appRoot, 'dist');
    // Hashed build files never change: cache them for a year. Shell and worker files bypass HTTP caches; other static resources are revalidated.
    app.use('/assets', express.static(path.join(distDir, 'assets'), {maxAge: '365d', immutable: true, fallthrough: false}));
    app.use(express.static(distDir, {setHeaders(res, file) {
      // The shell and worker control files must not remain stale at the CDN/browser.
      // Hashed /assets above retain their immutable cache policy.
      if (['index.html', 'sw.js', 'sw-update.js'].includes(path.basename(file))) {
        res.setHeader('Cache-Control', 'no-store');
      }
    }}));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  // Errors: JSON for the API (no stack, no internals), plain text elsewhere.
  app.use((err: Error & {status?: number; statusCode?: number; type?: string}, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) { next(err); return; }
    const status = err.status ?? err.statusCode ?? 500;
    const tooLarge = err.type === 'entity.too.large';
    const badJson = err.type === 'entity.parse.failed';
    const code = tooLarge ? 'PAYLOAD_TOO_LARGE' : badJson ? 'INVALID_JSON' : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
    const message = tooLarge ? 'Request body is too large.' : badJson ? 'Request body is not valid JSON.' : status === 404 ? 'Not found.' : status >= 500 ? 'An unexpected error occurred.' : 'Bad request.';
    if (status >= 500) console.error(`[error] ${req.method} ${req.path}: ${err.name}: ${err.message}`);
    if (req.path.startsWith('/api')) res.status(status >= 400 && status < 600 ? status : 500).json({error: {code, message}});
    else res.status(status >= 400 && status < 600 ? status : 500).type('text/plain').send(message);
  });

  return app;
}

// Start listening when this file is the process entry (`tsx server.ts`, `node server.js`). Some hosts start apps through their own loader script, in which
// case process.argv[1] is not this file: START_SERVER=1 forces listening there. Tests import createApp() and never listen.
const isDirectEntry =
  process.env.START_SERVER === '1' || Boolean(process.argv[1] && /server\.(ts|js|mjs|cjs)$/.test(process.argv[1]));

if (isDirectEntry) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  // The test mode mounts fixture routes and relaxes production checks: it must never be reachable from the network.
  if (process.env.APP_ENV === 'test' && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    console.error('Refusing to start: APP_ENV=test is only allowed on a loopback HOST (127.0.0.1, localhost or ::1).');
    process.exit(1);
  }
  createApp()
    .then((app) => {
      app.listen(port, host, () => {
        console.log(`Agricare Liberia server running on http://${host}:${port}`);
      });
    })
    .catch((e: Error) => {
      // A clear one-line reason (setting names, never values); no stack trace in the host log.
      console.error(`Server did not start: ${e.message}`);
      process.exit(1);
    });
}
