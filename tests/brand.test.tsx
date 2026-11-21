import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BrandLogo} from '../src/components/BrandLogo.tsx';

const root = new URL('../', import.meta.url);
const read = (p: string) => fs.readFileSync(new URL(p, root), 'utf8');
const bytes = (p: string) => fs.readFileSync(new URL(p, root));
const walk = (dir: string): string[] => fs.readdirSync(new URL(dir, root), {withFileTypes: true}).flatMap((e) => e.isDirectory() ? walk(`${dir}${e.name}/`) : [`${dir}${e.name}`]);
const pngSize = (b: Buffer) => ({w: b.readUInt32BE(16), h: b.readUInt32BE(20)});

test('the two original images are kept as sources and the previous brand files are kept as a backup', () => {
  for (const f of ['assets-source/brand/hero.JPG', 'assets-source/brand/logo.JPG', 'assets-source/previous-brand/icon.svg', 'assets-source/previous-brand/pwa-512x512.png']) assert.ok(fs.existsSync(new URL(f, root)), f);
});

test('logo emblem is a real transparent WebP (alpha built from the logo, not assumed from the JPEG)', () => {
  for (const h of [128, 256, 512]) {
    const b = bytes(`src/assets/brand/logo-emblem-${h}.webp`);
    assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WEBP');
    assert.equal(b.toString('ascii', 12, 16), 'VP8X', 'extended format carries the alpha flag'); assert.ok((b[20] & 0x10) !== 0, `emblem-${h} has alpha`);
  }
  const full = bytes('src/assets/brand/logo-full-1024.webp'); assert.equal(full.toString('ascii', 8, 12), 'WEBP');
});

test('favicons and PWA icons exist at the declared sizes; maskable and apple icons are opaque', () => {
  const want: Record<string, number> = {'favicon-16x16.png': 16, 'favicon-32x32.png': 32, 'apple-touch-icon.png': 180, 'pwa-192x192.png': 192, 'pwa-512x512.png': 512, 'pwa-maskable-512x512.png': 512};
  for (const [f, n] of Object.entries(want)) { const s = pngSize(bytes(`public/${f}`)); assert.deepEqual(s, {w: n, h: n}, f); }
  for (const f of ['apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png']) assert.notEqual(bytes(`public/${f}`)[25], 6, `${f} must not be RGBA`);
});

test('index.html and the PWA manifest use the Agricare Liberia name and the new icons', () => {
  const html = read('index.html'); assert.match(html, /<title>Agricare Liberia/); assert.match(html, /favicon-32x32\.png/); assert.match(html, /apple-touch-icon\.png/); assert.ok(!/icon\.svg/.test(html));
  const cfg = read('vite.config.ts'); assert.match(cfg, /name: 'Agricare Liberia'/); assert.match(cfg, /short_name: 'Agricare'/);
  for (const m of cfg.matchAll(/src: '\/(pwa-[^']+)'/g)) assert.ok(fs.existsSync(new URL(`public/${m[1]}`, root)), m[1]);
  assert.equal(JSON.parse(read('metadata.json')).name, 'Agricare Liberia');
});

test('no retired product name remains in application source, server code, or the HTML shell', () => {
  const files = [...walk('src/'), ...walk('server/'), 'server.ts', 'index.html', 'vite.config.ts'].filter((f) => /\.(tsx?|html|css|json)$/.test(f));
  const bad = files.filter((f) => /Agriccare|Agri-Advisory|Agri-Care|AgriLiberia/.test(read(f)));
  assert.deepEqual(bad, []);
});

test('BrandLogo keeps the image ratio, is decorative beside the written name and labelled elsewhere', () => {
  const dec = renderToStaticMarkup(<BrandLogo decorative />); assert.match(dec, /alt=""/); assert.match(dec, /width="232"[^>]*height="256"|height="256"[^>]*width="232"/);
  const lab = renderToStaticMarkup(<BrandLogo />); assert.match(lab, /alt="Agricare Liberia logo"/);
  const full = renderToStaticMarkup(<BrandLogo variant="full" />); assert.match(full, /alt="Agricare Liberia logo"/); assert.match(full, /object-contain/); assert.match(full, /h-auto/);
});

test('service worker precaches the new images and no longer caches a fixed /images/home path', () => {
  const cfg = read('vite.config.ts'); assert.match(cfg, /webp/); assert.ok(!cfg.includes('/images/home/'));
});

test('advice-card detail page has an h1 (the card title); the crop-check embed keeps its h2', () => {
  assert.match(read('src/pages/public/AdviceCardPage.tsx'), /<AdviceCardView[^>]*headingLevel=\{1\}/);
  assert.ok(!/headingLevel=\{1\}/.test(read('src/pages/public/CropCheckPage.tsx')));
  assert.match(read('src/components/advice/AdviceCardView.tsx'), /headingLevel = 2/);
});

test('the advisor fallback never calls bundled demonstration guidance verified or approved', () => {
  assert.ok(!/Verified Static|matching approved guides/i.test(read('src/pages/public/AdvisorPage.tsx') + read('server/ai.ts')));
  assert.match(read('src/pages/public/AdvisorPage.tsx'), /Demonstration Guidance \(not reviewed\)/);
});
