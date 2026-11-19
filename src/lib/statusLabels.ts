/**
 * One shared vocabulary for "what is this?" labels. Every H1 screen uses these four kinds so the
 * audience can always tell a working feature from simulated data, an unreviewed draft or a future idea.
 */
export type StatusKind = 'working' | 'simulated' | 'draft' | 'future';

export const STATUS_LABELS: Record<StatusKind, {short: string; long: string}> = {
  working: {short: 'Working', long: 'Working: this feature runs for real in this prototype.'},
  simulated: {short: 'Simulated demo data', long: 'Simulated demonstration data: not live and not real.'},
  draft: {
    short: 'Team 8 draft advice',
    long: 'Team 8 draft advice: written by the project team and NOT yet reviewed by an agricultural expert.',
  },
  future: {short: 'Future feature', long: 'Future feature: not built yet.'},
};

export const STATUS_KINDS = Object.keys(STATUS_LABELS) as StatusKind[];
