import {normalizeLiberianPhone} from '../src/lib/phone.ts';
import {getAuthConfig} from './authConfig.ts';

/**
 * The protected demonstration environment (APP_ENV=demo) accepts ONLY synthetic phone numbers (SIMULATED_SMS_ALLOWED_PREFIX, default +23177000xxxx)
 * anywhere a phone number is stored or published: accounts, marketplace seller numbers, buyer numbers. One definition, used by every route.
 */
export const demoEnvironment = (): boolean => getAuthConfig().demoEnvironment;

/** Is this already-normalized E.164 number a synthetic demonstration number? */
export function isSyntheticPhone(normalizedE164: string): boolean {
  return normalizedE164.startsWith(getAuthConfig().simulatedPrefix);
}

export const syntheticOnlyMessage = (what: string): string =>
  `This is a demonstration site. ${what} must be a synthetic test number starting ${getAuthConfig().simulatedPrefix}. Please do not enter a real phone number.`;

/**
 * Returns a refusal message when `raw` is a non-empty phone number that is not allowed in this environment, otherwise null.
 * Outside the demo environment it never refuses (format validation stays with the caller). An unparseable value is refused in the demo environment
 * so that nothing that could be a real number is stored.
 */
export function demoPhoneProblem(raw: unknown, what: string): string | null {
  if (!demoEnvironment()) return null;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  const n = normalizeLiberianPhone(text);
  if (n.valid && isSyntheticPhone(n.normalized)) return null;
  return syntheticOnlyMessage(what);
}
