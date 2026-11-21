#!/usr/bin/env node
/**
 * Builds the production server entry and the operator tools as plain JavaScript (Hostinger needs a .js entry file; tsx is a development tool).
 *
 *   node scripts/build-server.mjs [--out <dir>]
 *
 * Outputs (default: project root, next to package.json):  server.js, backup-db.js, restore-db.js, bootstrap-admin.js, recover-account.js, real-mode-prep.js
 * Packages stay external (node_modules is deployed with the app). `server.js` defaults NODE_ENV to production when it is not set.
 */
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outIdx = process.argv.indexOf('--out');
const outDir = outIdx !== -1 ? path.resolve(process.argv[outIdx + 1]) : root;
fs.mkdirSync(outDir, {recursive: true});

const appRootBanner = "import {fileURLToPath as __agriF} from 'node:url'; import {dirname as __agriD} from 'node:path'; process.env.APP_ROOT ??= __agriD(__agriF(import.meta.url));";
const common = {bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', logLevel: 'warning', legalComments: 'none'};

await build({...common, entryPoints: [path.join(root, 'server.ts')], outfile: path.join(outDir, 'server.js'), banner: {js: `${appRootBanner} process.env.NODE_ENV ??= 'production';`}});
for (const name of ['backup-db', 'restore-db', 'bootstrap-admin', 'recover-account', 'real-mode-prep']) {
  await build({...common, entryPoints: [path.join(root, 'scripts', `${name}.ts`)], outfile: path.join(outDir, `${name}.js`), banner: {js: appRootBanner}});
}
console.log(`Built server.js and tools into ${outDir}`);
