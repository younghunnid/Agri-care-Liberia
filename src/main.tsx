import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initOfflineStorage} from './lib/offlineStorage';
import {initOfflineLibrary} from './lib/offlineLibrary';
import {initPwa} from './lib/pwaUpdate';

// Hydrate offline storage (IndexedDB) before the first render so synchronous
// readers see downloaded guides immediately, even when the device is offline.
// A failure here must never block the app from starting.
Promise.all([initOfflineStorage(), initOfflineLibrary()])
  .catch(() => undefined)
  .finally(() => {
    createRoot(document.getElementById('root')!).render(<App />);
  });

// Service worker registration (no-op in the dev server; active in production builds).
initPwa();
