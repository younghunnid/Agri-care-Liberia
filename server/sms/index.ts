import {getAuthConfig} from '../authConfig.ts';
import {SimulatedSmsProvider} from './SimulatedSmsProvider.ts';
import {SmsUnavailableError, type SmsProvider, type SmsPurpose, type SmsResult} from './SmsProvider.ts';

export * from './SmsProvider.ts';
export {SimulatedSmsProvider} from './SimulatedSmsProvider.ts';

class UnavailableProvider implements SmsProvider {
  readonly name = 'none' as const;
  async send(_to: string, _message: string, _purpose: SmsPurpose, _meta?: {challengeId?: string}): Promise<SmsResult> {
    throw new SmsUnavailableError('No SMS provider is configured.');
  }
}

let provider: SmsProvider | null = null;
export function getSmsProvider(): SmsProvider {
  if (provider) return provider;
  const cfg = getAuthConfig();
  // Fail closed: the simulated provider can only exist outside production, and only when explicitly configured.
  provider = cfg.smsProvider === 'simulated' && !cfg.production ? new SimulatedSmsProvider(cfg.simulatedPrefix) : new UnavailableProvider();
  return provider;
}
export function resetSmsProviderForTests(): void { provider = null; }
