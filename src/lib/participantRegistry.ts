/** Shared enrollment contract: categories describe participation, never account permissions. */
export const PARTICIPANT_CATEGORIES = ['Farmer', 'Buyer', 'Agricultural Expert', 'Cooperative', 'Other'] as const;
export type ParticipantCategory = typeof PARTICIPANT_CATEGORIES[number];
export const REGISTRY_CONSENT_VERSION = 'ussd-demo-v1';
/** Real-user deployments use their own consent text and version (accounts only; a phone number is never verified by this step). */
export const REAL_REGISTRY_CONSENT_VERSION = 'ussd-registry-v1';
export const REAL_REGISTRY_CONSENT_TEXT = 'I agree that Agricare Liberia saves my participant category and county, linked to my account, in the participant registry. Only combined numbers are shown to authorized administrators; small groups are hidden. My phone number is not verified by this step. This handset is a browser simulation: the proposed dial code is not an active telecom service.';
export const REGISTRY_CONSENT_TEXT = 'I consent to saving my synthetic participant category and county in the central Agricare demo registry, identified by this browser’s private device key or my signed-in account. Suppressed totals may be shown to authorized administrators. No phone number is detected or collected. This does not verify professional status.';
export interface Participant {category: ParticipantCategory; county: string; synthetic: boolean; /** Always false in this build: no phone number is verified (no SMS). */ phoneVerified?: boolean; channel: 'ussd-browser'; identity: 'account' | 'device'; consentVersion: string}
export interface RegistryTable {rows: {label: string; participants: number}[]; insufficient: boolean}
export interface RegistryBlock {total: number | null; categories: RegistryTable; counties: RegistryTable; /** Genuine participants only: phone status (suppressed). */ phone?: {unverified: number | null; verified: number | null}}
export interface RegistryAggregates {label: string; note: string; minGroup: number; real: RegistryBlock; anonymous: RegistryBlock; synthetic: RegistryBlock}
