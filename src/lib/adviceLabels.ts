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
