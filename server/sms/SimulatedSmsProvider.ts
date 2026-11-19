import crypto from 'node:crypto';
import {SmsRejectedError, type SmsProvider, type SmsPurpose, type SmsResult} from './SmsProvider.ts';

export interface SimulatedMessage {
  id: string;
  to: string;
  message: string;
  purpose: SmsPurpose;
  createdAt: string;
  expiresAtMs: number;
}

const TTL_MS = 10 * 60 * 1000;
const MAX_KEPT = 200;

/**
 * Sends NOTHING. Messages are kept in process memory only (never in the database, never logged), expire after 10 minutes and vanish on restart.
 * It accepts only synthetic demonstration numbers (default +23177000xxxx), so a real person's number can never be used in demo mode.
 * The only way to read them is the operator-token-protected inbox route (development/test only; see routes/authSecurity.ts).
 */
export class SimulatedSmsProvider implements SmsProvider {
  readonly name = 'simulated' as const;
  private messages: SimulatedMessage[] = [];

  constructor(private readonly allowedPrefix: string) {}

  isAllowed(phone: string): boolean {
    return /^\+231[2-9]\d{8}$/.test(phone) && phone.startsWith(this.allowedPrefix);
  }

  async send(phoneNumber: string, message: string, purpose: SmsPurpose): Promise<SmsResult> {
    if (!this.isAllowed(phoneNumber)) throw new SmsRejectedError(`In demo mode only synthetic test numbers (${this.allowedPrefix}xxxx) can receive verification messages.`);
    this.prune();
    const id = crypto.randomBytes(8).toString('hex');
    this.messages.push({id, to: phoneNumber, message: `${message} [DEMO: simulated SMS, nothing was sent]`, purpose, createdAt: new Date().toISOString(), expiresAtMs: Date.now() + TTL_MS});
    if (this.messages.length > MAX_KEPT) this.messages.splice(0, this.messages.length - MAX_KEPT);
    return {accepted: true, providerMessageId: `sim-${id}`};
  }

  /** Newest first. Only called by the guarded inbox route. */
  list(): SimulatedMessage[] {
    this.prune();
    return [...this.messages].reverse();
  }

  clear(): void { this.messages = []; }

  private prune(): void {
    const now = Date.now();
    this.messages = this.messages.filter((m) => m.expiresAtMs > now);
  }
}
