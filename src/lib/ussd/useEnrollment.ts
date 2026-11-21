import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {enrollmentPress, newEnrollment, type EnrollmentState} from './enrollment';
import type {Key} from './engine';
import {registryClient} from './registryClient';
/** `real`: null while the server mode is still unknown. */
export function useEnrollment(options: {userId: number | null; loadingAuth: boolean; real: boolean | null; online: boolean; timeoutSeconds: number; open: () => void; voice: (enabled: boolean) => void}) {
  const [state, setState] = useState(newEnrollment);
  const current = useRef(state); const opts = useRef(options); opts.current = options;
  const lastActivity = useRef(Date.now());
  const client = useMemo(() => registryClient(options.userId, () => opts.current.online, options.real === true), [options.userId, options.real]);
  const commit = useCallback((next: EnrollmentState) => { current.current = next; setState(next); }, []);
  // A change of account (or of server mode) restarts the handset, EXCEPT right after the secure form signed the person in: keep the category and county they chose and continue.
  useEffect(() => {
    const before = current.current; const real = options.real === true; const signedIn = options.userId !== null;
    if (before.stage === 'form' && signedIn && real) commit({...before, stage: 'checking', input: '', notice: '', signedIn: true, formMode: null});
    else commit(newEnrollment(real, signedIn));
  }, [options.userId, options.real, commit]);
  const handle = useCallback((key: Key): boolean => {
    if (current.current.stage === 'ready') return false;
    lastActivity.current = Date.now();
    const result = enrollmentPress(current.current, key); commit(result.state);
    if (result.action === 'voice-on' || result.action === 'voice-off') opts.current.voice(result.action === 'voice-on');
    if (result.action === 'open') opts.current.open();
    return true;
  }, [commit]);
  useEffect(() => {
    if (!['checking', 'saving'].includes(state.stage) || options.loadingAuth || options.real === null) return;
    let valid = true;
    const saving = state.stage === 'saving';
    const request = saving ? client.enroll(state.category!, state.county) : client.lookup();
    void request.then((participant) => {
      if (!valid) return;
      if (participant) { commit({...current.current, stage: 'ready', participant, publicOnly: false, notice: ''}); opts.current.open(); }
      else { const c = current.current; commit({...c, stage: c.real && c.signedIn && c.category && c.county ? 'consent' : 'category', input: '', notice: ''}); }
    }).catch(() => {
      if (!valid) return;
      commit({...current.current, stage: saving ? 'consent' : 'category', notice: opts.current.online ? 'Not confirmed. Retry or use public advice.' : 'Offline. Registration was not sent.'});
    });
    return () => { valid = false; };
  }, [state.stage, options.loadingAuth, options.real, client, commit]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!['dial', 'ready', 'checking', 'saving'].includes(current.current.stage) && Date.now() - lastActivity.current >= opts.current.timeoutSeconds * 1000) commit({...newEnrollment(opts.current.real === true, opts.current.userId !== null), notice: 'Session timed out. Dial again.'});
    }, 1000);
    return () => clearInterval(timer);
  }, [commit]);
  const publicAdvice = useCallback(() => { commit({...newEnrollment(opts.current.real === true, opts.current.userId !== null), stage: 'ready', publicOnly: true}); opts.current.open(); }, [commit]);
  const restart = useCallback(() => { commit(newEnrollment(opts.current.real === true, opts.current.userId !== null)); lastActivity.current = Date.now(); }, [commit]);
  return {state, handle, publicAdvice, restart};
}
