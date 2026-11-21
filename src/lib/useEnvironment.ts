import {useEffect, useState} from 'react';

/** What kind of server is this? One cached, read-only request (no secrets). `demo` = protected synthetic demonstration; `real` = real-user deployment. */
export interface ServerEnvironment {demoEnvironment: boolean; registryMode: 'real' | 'synthetic' | 'closed' | null}
let cached: Promise<ServerEnvironment> | null = null;
const load = (): Promise<ServerEnvironment> => (cached ??= fetch('/api/v1/environment').then((r) => (r.ok ? r.json() : null)).then((j: {demoEnvironment?: boolean; registryMode?: string} | null) => ({demoEnvironment: j?.demoEnvironment === true, registryMode: (j?.registryMode as ServerEnvironment['registryMode']) ?? null})).catch(() => ({demoEnvironment: false, registryMode: null})));
export function useEnvironment(): ServerEnvironment | null {
  const [env, setEnv] = useState<ServerEnvironment | null>(null);
  useEffect(() => { let live = true; void load().then((e) => { if (live) setEnv(e); }); return () => { live = false; }; }, []);
  return env;
}
