import {getAuthConfig} from './authConfig.ts';
import {getRuntimeConfig} from './runtime.ts';

/**
 * Which kind of participant registry this server runs:
 *  - 'real'      : a real-user deployment (NODE_ENV=production without APP_ENV=demo/test). Only SIGNED-IN accounts are enrolled and counted as genuine participants.
 *  - 'synthetic' : the protected demo (APP_ENV=demo) or the black-box test server (APP_ENV=test): everything is synthetic, device identities are allowed.
 *  - 'closed'    : any other environment (plain development): enrollment is refused.
 */
export type RegistryMode = 'real' | 'synthetic' | 'closed';
export function registryMode(): RegistryMode {
  if (getAuthConfig().production) return 'real';
  if (getRuntimeConfig().demoEnvironment || process.env.APP_ENV === 'test') return 'synthetic';
  return 'closed';
}
