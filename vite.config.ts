import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

function disableHmrWebSocketClient(): Plugin {
  let shouldDisable = false;
  return {
    name: 'disable-hmr-websocket-client',
    apply: 'serve',
    enforce: 'post',
    configResolved(resolvedConfig) {
      shouldDisable = resolvedConfig.server.hmr === false || resolvedConfig.server.ws === false;
    },
    transform(code, id) {
      if (!shouldDisable) {
        return;
      }
      const cleanId = id.replace(/\\/g, '/').split('?')[0];
      if (!cleanId.endsWith('/vite/dist/client/client.mjs')) {
        return;
      }
      const pattern = /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/;
      if (!pattern.test(code)) {
        return;
      }
      return {
        code: code.replace(
          pattern,
          'const transport = { connect: async () => {}, disconnect: async () => {}, send: async () => {}, invoke: async () => ({}) };',
        ),
        map: null,
      };
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      disableHmrWebSocketClient(),
      react(),
      tailwindcss(),
      VitePWA({
        // 'prompt': a new service worker waits until the user taps "Update now", so an
        // update never reloads the page under a farmer who is mid-way through a form.
        registerType: 'prompt',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/',
          name: 'Agri-Advisory Liberia',
          short_name: 'AgriLiberia',
          description: 'Inclusive agricultural e-advisory platform for Liberian farmers, online and offline.',
          theme_color: '#16803C',
          background_color: '#F3F8F0',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2,jpg,jpeg,webp,m4a}'],
          cleanupOutdatedCaches: true,
          // Take control on the very first install so the first visit is already offline-capable.
          // Updates still wait for the user's "Update now" tap (skipWaiting is NOT enabled).
          clientsClaim: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // Matched on pathname: Workbox tests RegExp routes against the FULL URL (http://host/...),
              // so a `^/path` regex would never match same-origin requests.
              urlPattern: ({url}: {url: URL}) =>
                url.pathname.startsWith('/src/assets/images/') || url.pathname.startsWith('/offline-img/') || url.pathname.startsWith('/images/home/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'agri-local-images',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              // Web fonts: stylesheet revalidates, font files are immutable.
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'agri-google-fonts-css',
                cacheableResponse: {statuses: [0, 200]},
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'agri-google-fonts-files',
                expiration: {maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365},
                cacheableResponse: {statuses: [0, 200]},
              },
            },
            {
              // Never cache auth, private messages, profile, admin, or AI endpoints
              urlPattern: ({url}: {url: URL}) => /^\/api\/v1\/(crops|categories|guides)(\/|$)/.test(url.pathname),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'agri-public-guides-api',
                networkTimeoutSeconds: 4,
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
          ],
        },
        // The service worker is only active in production builds. Offline behavior must be
        // tested with `npm run build && npm start`, never against the Vite dev server.
        devOptions: {
          enabled: false,
        },
      }),
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        // Workbox generates its manifest in closeBundle, so legacy image URLs must
        // already exist in dist before that hook runs, including on a clean build.
        writeBundle(): void {
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: false as const,
      ws: false as const,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
