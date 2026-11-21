import {apiFetch} from '../api';
import {getRequesterKey} from '../listingKeys';
import {REGISTRY_CONSENT_VERSION, type Participant, type ParticipantCategory} from '../participantRegistry';
import {PARTICIPANT_CATEGORIES} from '../participantRegistry';
import {LIBERIA_COUNTIES} from '../../../server/constants';
const CACHE = 'agri_ussd_participant_v1';
export function registryClient(userId: number | null, online: () => boolean) {
  const key = () => { const k = getRequesterKey(); if (k !== getRequesterKey()) throw new Error('Identity storage unavailable'); return k; };
  const identityTag = async () => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key()))), (b) => b.toString(16).padStart(2, '0')).join('');
  const remember = async (participant: Participant | null) => {
    // Account identity is authenticated only by the server, never recovered from localStorage.
    try { if (!userId && participant?.identity === 'device') localStorage.setItem(CACHE, JSON.stringify({identityTag: await identityTag(), participant})); else localStorage.removeItem(CACHE); } catch { /* optional offline metadata */ }
  };
  const readSaved = async (): Promise<Participant | null> => {
    if (userId) return null;
    try { const saved = JSON.parse(localStorage.getItem(CACHE) || 'null'); const p = saved?.participant; return saved?.identityTag === await identityTag() && p?.identity === 'device' && p?.synthetic === true && p?.channel === 'ussd-browser' && p?.consentVersion === REGISTRY_CONSENT_VERSION && PARTICIPANT_CATEGORIES.includes(p?.category) && LIBERIA_COUNTIES.includes(p?.county) ? p : null; } catch { return null; }
  };
  const request = async (category?: ParticipantCategory, county?: string) => {
    const signal = AbortSignal.timeout(12000);
    const response = await apiFetch<{participant: Participant | null}>(category ? '/participants/enroll' : '/participants/me', {method: category ? 'POST' : 'GET', signal, headers: {'X-Requester-Key': key()}, ...(category ? {body: JSON.stringify({category, county, consent: true, consentVersion: REGISTRY_CONSENT_VERSION})} : {})});
    await remember(response.participant); return response.participant;
  };
  return {lookup: async () => online() ? request() : readSaved(), enroll: (category: ParticipantCategory, county: string) => { if (!online()) return Promise.reject(new Error('Offline')); return request(category, county); }};
}
