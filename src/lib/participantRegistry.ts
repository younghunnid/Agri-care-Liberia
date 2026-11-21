/** Shared enrollment contract: categories describe participation, never account permissions. */
export const PARTICIPANT_CATEGORIES = ['Farmer', 'Buyer', 'Agricultural Expert', 'Cooperative', 'Other'] as const;
export type ParticipantCategory = typeof PARTICIPANT_CATEGORIES[number];
export const REGISTRY_CONSENT_VERSION = 'ussd-demo-v1';
export const REGISTRY_CONSENT_TEXT = 'I consent to saving my synthetic participant category and county in the central Agricare demo registry, identified by this browser’s private device key or my signed-in account. Suppressed totals may be shown to authorized administrators. No phone number is detected or collected. This does not verify professional status.';
export interface Participant {category: ParticipantCategory; county: string; synthetic: boolean; channel: 'ussd-browser'; identity: 'account' | 'device'; consentVersion: string}
export interface RegistryTable {rows: {label: string; participants: number}[]; insufficient: boolean}
export interface RegistryBlock {total: number | null; categories: RegistryTable; counties: RegistryTable}
export interface RegistryAggregates {label: string; note: string; minGroup: number; real: RegistryBlock; synthetic: RegistryBlock}
