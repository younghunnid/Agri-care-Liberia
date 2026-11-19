/**
 * SMS provider contract. The verification service only knows this interface, so a live provider (aggregator for MTN and Orange Liberia)
 * can be added later as another class without touching the authentication workflow.
 */
export type SmsPurpose = 'phone_confirm' | 'new_device_login' | 'password_reset' | 'phone_change' | 'phone_change_new' | 'phone_claim';

export interface SmsResult {
  accepted: boolean;
  providerMessageId: string;
}

export interface SmsProvider {
  readonly name: 'none' | 'simulated' | 'live';
  send(phoneNumber: string, message: string, purpose: SmsPurpose): Promise<SmsResult>;
}

/** Delivery is not possible (no provider configured, or provider failure). Callers must fail closed. */
export class SmsUnavailableError extends Error {
  constructor(message = 'SMS delivery is unavailable.') { super(message); }
}
/** The provider refused this number (the simulated provider only accepts the synthetic demonstration range). */
export class SmsRejectedError extends Error {
  constructor(message = 'This phone number cannot receive messages in demo mode.') { super(message); }
}
