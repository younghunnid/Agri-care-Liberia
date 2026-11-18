import React, {useEffect, useState} from 'react';
import {AlertTriangle, CheckCircle2, XCircle} from 'lucide-react';
import {canWorkOfflineAsApp, detectCapabilities, limitationMessages, type DeviceCapabilities} from '../lib/capabilities';
import {PWAInstallButton} from './PWAInstallButton';

const Row: React.FC<{ok: boolean; label: string; why?: string}> = ({ok, label, why}) => (
  <li className="flex items-start gap-2 text-base">
    {ok ? (
      <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-[#16803C]" aria-label="Yes" />
    ) : (
      <XCircle className="w-5 h-5 mt-0.5 shrink-0 text-red-600" aria-label="No" />
    )}
    <span>
      <span className="font-semibold">{label}</span>
      {!ok && why ? <span className="block text-sm text-[#183B2B]/75">{why}</span> : null}
    </span>
  </li>
);

/** Tells the farmer (and testers) exactly what this phone/address can and cannot do offline. */
export const DeviceReadinessCard: React.FC = () => {
  const [caps, setCaps] = useState<DeviceCapabilities>(() => detectCapabilities());
  const [controlled, setControlled] = useState(false);

  useEffect(() => {
    setCaps(detectCapabilities());
    setControlled(Boolean(navigator.serviceWorker?.controller));
    const onChange = () => setControlled(Boolean(navigator.serviceWorker?.controller));
    navigator.serviceWorker?.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', onChange);
  }, []);

  const appReady = canWorkOfflineAsApp(caps);
  const messages = limitationMessages(caps);

  return (
    <section aria-labelledby="readiness-title" className={`rounded-3xl border-2 p-5 space-y-3 ${appReady ? 'bg-white border-[#16803C]/30' : 'bg-amber-50 border-amber-400'}`}>
      <h2 id="readiness-title" className="font-display text-xl font-bold text-[#183B2B] flex items-center gap-2">
        {!appReady && <AlertTriangle className="w-6 h-6 text-amber-700" aria-hidden="true" />}
        Can this phone use the app offline?
      </h2>
      {!appReady ? (
        <div role="alert" className="space-y-2 text-base text-[#183B2B]">
          <p className="font-bold">Not fully. Open the app from its secure https:// address to install it and use it without internet.</p>
          {messages.map((m) => (
            <p key={m} className="text-sm">
              {m}
            </p>
          ))}
          <p className="text-sm">
            Guides, pictures, audio and drafts you save are still kept on the phone, but this page will not open without internet until you use the
            https:// address and install the app.
          </p>
        </div>
      ) : (
        <p className="text-base text-[#183B2B]">
          {controlled
            ? 'Yes. The app is installed in this browser and will open without internet.'
            : 'Almost. Reload this page once so the offline app engine can take control.'}
        </p>
      )}
      <ul className="space-y-2">
        <Row ok={caps.secureContext} label="Secure address (https)" why="Needed for install and offline opening." />
        <Row ok={caps.serviceWorker && controlled} label="Offline app engine running" why={caps.serviceWorker ? 'Reload once, or wait a moment.' : 'Needs a secure address.'} />
        <Row ok={caps.cacheStorage} label="Cache Storage" why="Needs a secure address. Pictures still save to the phone database." />
        <Row ok={caps.indexedDB} label="Phone database (IndexedDB)" why="Without it nothing can be saved offline." />
        <Row ok={caps.persistentStorage} label="Protected storage can be requested" />
        <Row ok={caps.microphone} label="Microphone available for voice notes" why="Needs a secure address." />
        <Row ok={caps.standalone} label="Opened as an installed app" why="Optional. Use the install button or Chrome's menu → Install app." />
      </ul>
      {appReady && !caps.standalone && <PWAInstallButton />}
      <p className="text-xs text-[#183B2B]/60 break-all">Address: {caps.origin}</p>
    </section>
  );
};
