#!/usr/bin/env node
/**
 * HTTPS front door for testing the production build from an Android phone.
 *
 *   NODE_ENV=production HOST=127.0.0.1 PORT=3000 DB_PATH=/tmp/agri-test.db npx tsx server.ts   # the app (loopback only)
 *   node scripts/dev-https-proxy.mjs                                                           # https://<LAN-IP>:3443
 *
 * - Terminates TLS with the certificate from scripts/make-dev-cert.sh and forwards to the app.
 * - Only the public app is reachable: administrative, expert-queue and demo-reset endpoints are refused here,
 *   so the phone (or anyone on the Wi-Fi) cannot reach them even though the app itself would let them be tried.
 * - Use a throwaway database (DB_PATH) - never the real data/ folder.
 * - `--http` listens on plain http://127.0.0.1:3080 instead (no certificate) for use behind a tunnel that
 *   provides its own trusted HTTPS. Do not expose that port any other way.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const upstream = new URL(process.env.UPSTREAM || 'http://127.0.0.1:3000');
const httpOnly = process.argv.includes('--http');
const port = Number(process.env.PROXY_PORT || (httpOnly ? 3080 : 3443));
const host = process.env.PROXY_HOST || (httpOnly ? '127.0.0.1' : '0.0.0.0');
const certDir = path.resolve(process.env.CERT_DIR || '.dev-certs');

/** Paths that must never be reachable through this proxy. */
const BLOCKED = [/^\/api\/v1\/admin(\/|$)/i, /^\/api\/v1\/expert(\/|$)/i, /^\/api\/v1\/demo\/reset(\/|$)/i];
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']);

function handler(req, res) {
  let pathname;
  let search = '';
  try {
    // Prefix the host ourselves: new URL('//x/y', base) would treat '//x' as a hostname and drop it from the path.
    const url = new URL('http://x' + ((req.url || '/').startsWith('/') ? req.url : '/' + req.url));
    // Normalise BEFORE matching and forward the normalised path, so the app cannot interpret the URL
    // differently from this filter (encoding, repeated slashes, dot segments, letter case).
    pathname = path.posix.normalize(decodeURIComponent(url.pathname).replace(/\/{2,}/g, '/'));
    search = url.search;
  } catch {
    res.writeHead(400, {'Content-Type': 'text/plain'});
    res.end('Bad request');
    return;
  }
  if (!ALLOWED_METHODS.has(req.method || '') || BLOCKED.some((re) => re.test(pathname))) {
    res.writeHead(403, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: {code: 'BLOCKED_BY_DEV_PROXY', message: 'This endpoint is not available through the test proxy.'}}));
    return;
  }
  const headers = {...req.headers, host: upstream.host, 'x-forwarded-proto': httpOnly ? req.headers['x-forwarded-proto'] || 'https' : 'https', 'x-forwarded-for': req.socket.remoteAddress || ''};
  const proxied = http.request({host: upstream.hostname, port: upstream.port, method: req.method, path: encodeURI(pathname) + search, headers}, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  proxied.on('error', () => {
    if (!res.headersSent) res.writeHead(502, {'Content-Type': 'text/plain'});
    res.end('The app is not running on ' + upstream.origin);
  });
  req.pipe(proxied);
}

let server;
if (httpOnly) {
  server = http.createServer(handler);
} else {
  const key = path.join(certDir, 'server.key');
  const cert = path.join(certDir, 'server.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    console.error(`No certificate in ${certDir}. Run: scripts/make-dev-cert.sh`);
    process.exit(1);
  }
  server = https.createServer({key: fs.readFileSync(key), cert: fs.readFileSync(cert)}, handler);
}
server.listen(port, host, () => {
  console.log(`${httpOnly ? 'HTTP (for a tunnel)' : 'HTTPS'} proxy on ${host}:${port} -> ${upstream.origin}`);
  console.log('Blocked: /api/v1/admin/*, /api/v1/expert/*, /api/v1/demo/reset');
});
