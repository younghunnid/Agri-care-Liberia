/** Farmer-friendly wording for the expert request statuses the server already uses (Submitted / Assigned / Answered). No new states. */
export type ServerStatus = 'Submitted' | 'Assigned' | 'Answered';

export interface StatusInfo {
  label: string;
  /** 1 = sent, 2 = with an expert, 3 = answered. */
  step: 1 | 2 | 3;
  hint: string;
  answered: boolean;
}

export function describeStatus(status: string | undefined | null): StatusInfo {
  switch (status) {
    case 'Answered': return {label: 'Answered', step: 3, hint: 'A reply is shown below.', answered: true};
    case 'Assigned': return {label: 'An expert is looking at it', step: 2, hint: 'Check back later for the reply.', answered: false};
    case 'Submitted': return {label: 'Waiting for an expert', step: 1, hint: 'Your question was sent. A reply can take time.', answered: false};
    default: return {label: 'Waiting for an expert', step: 1, hint: 'Status not known yet.', answered: false};
  }
}

export const STEP_LABELS = ['Sent', 'With an expert', 'Answered'] as const;

/**
 * Every reply in this prototype comes from the demonstration dashboard (a person types it using a demo or test account).
 * It is never presented as verified advice from a real agricultural expert.
 */
export const SIMULATED_REPLY_NOTICE =
  'Simulated demonstration reply. In this hackathon prototype the reply is typed in a demo dashboard. It is not verified advice from a real agricultural expert. Do not use it to decide on chemicals, doses or treatment.';

export const SIMULATED_REPLY_SHORT = 'Simulated demo reply, not verified expert advice';
