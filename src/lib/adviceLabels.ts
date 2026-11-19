/**
 * How advice review is shown to farmers. A guide seeded for the demonstration carries a *workflow* status ("approved") and a placeholder reviewer
 * ("Sample Demo Reviewer (Unverified Demonstration)") so the review screens can be demonstrated. Neither is a professional review, so the farmer-facing
 * text must never present them as one: no "approved", no reviewer name, no "reviewed on <date>" for demonstration content.
 */
export interface ReviewFields {
  isSampleDemo?: boolean;
  reviewStatus?: string | null;
  reviewedByName?: string | null;
  lastReviewedAt?: string | null;
}

export const DEMO_ADVICE_LABEL = 'Demonstration advice: NOT reviewed by a qualified agronomist';
export const DEMO_ADVICE_DETAIL =
  'This text is sample content prepared for the Team 8 demonstration. No qualified agronomist or Ministry officer has approved it. Do not rely on it for spraying, dosing or treatment. Ask an agricultural extension officer.';

/** A reviewer name that is a placeholder, not a real person (matches the seeded "Sample Demo Reviewer (Unverified Demonstration)"). */
export function isPlaceholderReviewer(name: string | null | undefined): boolean {
  return Boolean(name && /\b(demo|demonstration|sample|synthetic|unverified|fictional|simulated|placeholder|test)\b/i.test(name));
}

/** True only for content that is not marked as demonstration AND names a non-placeholder reviewer. Never true on a status word alone. */
export function isProfessionallyReviewed(g: ReviewFields): boolean {
  if (g.isSampleDemo) return false;
  if (!g.reviewedByName || isPlaceholderReviewer(g.reviewedByName)) return false;
  return g.reviewStatus === 'approved';
}

export interface ReviewLine {
  /** Short badge text. */
  badge: string;
  /** One sentence for the footer. */
  text: string;
  /** Whether a real, named, non-placeholder reviewer approved it. */
  reviewed: boolean;
}

export function reviewLine(g: ReviewFields): ReviewLine {
  if (isProfessionallyReviewed(g)) {
    return {
      badge: 'Reviewed',
      text: `Reviewed by ${g.reviewedByName}${g.lastReviewedAt ? ` on ${g.lastReviewedAt}` : ''}.`,
      reviewed: true,
    };
  }
  if (g.isSampleDemo || isPlaceholderReviewer(g.reviewedByName)) {
    return {badge: DEMO_ADVICE_LABEL, text: DEMO_ADVICE_DETAIL, reviewed: false};
  }
  return {badge: 'Not reviewed', text: 'This advice has not been reviewed by a named, qualified reviewer. Ask an agricultural extension officer before acting on it.', reviewed: false};
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Advice CARDS (Phase 1A): each version carries a verification level. Only `verified` (named reviewer, organisation and date, enforced by the server
// and by a database constraint) is ever shown as reviewed. Seeded and team-written cards are always shown as NOT reviewed.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export type CardLevel = 'demo_sample' | 'team_draft' | 'pending_review' | 'verified';

export interface CardVerificationInput {
  level: string;
  reviewerName?: string | null;
  reviewerOrg?: string | null;
  reviewedAt?: string | null;
}
export interface CardVerification {
  level: CardLevel;
  reviewed: boolean;
  badge: string;
  text: string;
}

export function cardVerification(v: CardVerificationInput): CardVerification {
  const level = (['demo_sample', 'team_draft', 'pending_review', 'verified'] as const).find((l) => l === v.level) ?? 'team_draft';
  if (level === 'verified' && v.reviewerName && v.reviewerOrg && v.reviewedAt && !isPlaceholderReviewer(v.reviewerName) && !isPlaceholderReviewer(v.reviewerOrg)) {
    return {level, reviewed: true, badge: `Reviewed by ${v.reviewerName}, ${v.reviewerOrg}, on ${v.reviewedAt}`, text: `A named reviewer recorded this review on ${v.reviewedAt}. Still ask an extension officer about your own field or flock.`};
  }
  if (level === 'pending_review') {
    return {level, reviewed: false, badge: 'Waiting for review: NOT yet reviewed', text: 'This card has been sent for review but no qualified reviewer has approved it yet. Treat it as a team draft.'};
  }
  if (level === 'team_draft') {
    return {level, reviewed: false, badge: 'Team draft: NOT reviewed', text: 'Written by the project team. No qualified agronomist or veterinary officer has reviewed it. Ask an agricultural extension officer before acting on it.'};
  }
  return {level: level === 'verified' ? 'team_draft' : level, reviewed: false, badge: DEMO_ADVICE_LABEL, text: DEMO_ADVICE_DETAIL};
}
