import {LIBERIA_COUNTIES} from '../../../server/constants';
import {PARTICIPANT_CATEGORIES, REGISTRY_CONSENT_TEXT, type Participant, type ParticipantCategory} from '../participantRegistry';
import {paginate, type Key} from './engine';
export const PROPOSED_USSD_CODE = '*440#';
export type EnrollmentStage = 'dial' | 'welcome' | 'checking' | 'category' | 'county' | 'consent' | 'saving' | 'ready';
export interface EnrollmentState {stage: EnrollmentStage; input: string; notice: string; category: ParticipantCategory | null; county: string; page: number; participant: Participant | null; publicOnly: boolean}
export const newEnrollment = (): EnrollmentState => ({stage: 'dial', input: '', notice: '', category: null, county: '', page: 0, participant: null, publicOnly: false});
const consentPages = paginate([REGISTRY_CONSENT_TEXT], 80);
export function enrollmentText(s: EnrollmentState): string {
  const nav = '\n0 Back';
  const texts: Record<EnrollmentStage, string> = {
    dial: `Agricare demo\nDial ${PROPOSED_USSD_CODE}, then Send.\nProposed code for this browser only. No telecom service.`,
    welcome: 'Welcome to Agricare\n1 Enable screen reading\n2 Continue without voice\nHold 0 to mute voice.\nBrowser demonstration only.',
    checking: 'Checking this browser or signed-in account…\nNo phone number is detected.\nPlease wait.',
    category: `Choose demo category:\n${PARTICIPANT_CATEGORIES.map((c, i) => `${i + 1} ${c}`).join('\n')}${nav}`,
    county: `Demo county ${s.page + 1}/3\n${LIBERIA_COUNTIES.slice(s.page * 5, s.page * 5 + 5).map((c, i) => `${i + 1} ${c}`).join('\n')}\n${s.page < 2 ? '99 More\n' : ''}0 Back`,
    consent: `Registry consent ${s.page + 1}/${consentPages.length}\n${consentPages[s.page] ?? ''}\n${s.page < consentPages.length - 1 ? '1 Next' : '1 Agree & register\n2 Decline'}${nav}`,
    saving: 'Saving consented demo registration…\nNot confirmed until the server replies.\nPlease wait.',
    ready: '',
  };
  return (s.notice ? s.notice + '\n' : '') + texts[s.stage];
}
export type EnrollmentAction = 'check' | 'save' | 'open' | 'voice-on' | 'voice-off' | null;
export function enrollmentPress(s: EnrollmentState, key: Key): {state: EnrollmentState; action: EnrollmentAction} {
  const stay = (state: EnrollmentState = s, action: EnrollmentAction = null) => ({state, action});
  if (key === 'cancel' || key === 'end') return stay(newEnrollment());
  if (s.stage === 'checking' || s.stage === 'saving') return stay();
  if (key === 'home') return stay(newEnrollment());
  if (key === 'back') {
    const previous: Partial<Record<EnrollmentStage, EnrollmentStage>> = {welcome: 'dial', category: 'welcome', county: 'category', consent: 'county'};
    return stay({...s, stage: previous[s.stage] ?? 'dial', page: 0, input: '', notice: ''});
  }
  if (key === 'del') return stay({...s, input: s.input.slice(0, -1), notice: ''});
  if (key !== 'send') return /^[0-9*#]$/.test(key) ? stay({...s, input: (s.input + key).slice(0, s.stage === 'dial' ? 8 : 2), notice: ''}) : stay();
  const value = s.input; const clean = {...s, input: '', notice: ''};
  if (value === '0' && s.stage !== 'dial') return enrollmentPress(clean, 'back');
  if (s.stage === 'dial') return value === PROPOSED_USSD_CODE ? stay({...clean, stage: 'welcome'}) : stay({...clean, notice: 'Type the proposed code first.'});
  if (s.stage === 'welcome' && ['1', '2'].includes(value)) return stay({...clean, stage: 'checking'}, value === '1' ? 'voice-on' : 'voice-off');
  if (s.stage === 'category' && /^[1-5]$/.test(value)) return stay({...clean, category: PARTICIPANT_CATEGORIES[Number(value) - 1], stage: 'county', page: 0});
  if (s.stage === 'county') {
    if (value === '99' && s.page < 2) return stay({...clean, page: s.page + 1});
    if (/^[1-5]$/.test(value)) return stay({...clean, county: LIBERIA_COUNTIES[s.page * 5 + Number(value) - 1], stage: 'consent', page: 0});
  }
  if (s.stage === 'consent' && value === '1') return s.page < consentPages.length - 1 ? stay({...clean, page: s.page + 1}) : stay({...clean, stage: 'saving'}, 'save');
  if (s.stage === 'consent' && value === '2' && s.page === consentPages.length - 1) return stay({...clean, stage: 'ready', publicOnly: true, participant: null}, 'open');
  return stay({...clean, notice: 'Invalid choice. Try again.'});
}
