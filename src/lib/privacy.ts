/** Version of the privacy notice a person accepts when registering. Change it whenever the notice text changes in a way that needs new consent. */
export const PRIVACY_VERSION = 'privacy-v1';
export const RECOVERY_METHODS = [
  {value: 'in_person', label: 'In person (met the person and checked who they are)'},
  {value: 'known_number_call', label: 'Phone call to a number already known to the programme (not the number typed at sign-up)'},
  {value: 'extension_office', label: 'Vouched for by a known extension office or community leader'},
  {value: 'other_documented', label: 'Other independent check (describe it)'},
] as const;
export type RecoveryMethod = typeof RECOVERY_METHODS[number]['value'];
