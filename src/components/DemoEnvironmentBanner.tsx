import React, {useEffect, useState} from 'react';

/**
 * Shown only when the server says it is the protected hackathon demonstration environment (APP_ENV=demo): simulated SMS, synthetic accounts only.
 * Asks the server once, silently ignores any failure (offline, older server, production), and shows nothing on a normal deployment.
 */
export function DemoEnvironmentBanner() {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const ctrl = new AbortController();
    fetch('/api/v1/environment', {signal: ctrl.signal, headers: {Accept: 'application/json'}})
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
      .then((j: {demoEnvironment?: boolean} | null) => { if (j?.demoEnvironment === true) setDemo(true); })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  if (!demo) return null;
  return (
    <div role="note" className="bg-[#FFF1C2] text-[#4A2F00] border-b border-[#4A2F00]/20 px-4 py-2 text-sm text-center font-medium">
      Demonstration environment: simulated SMS, synthetic accounts only. Please do not enter real personal information or real phone numbers.
    </div>
  );
}
