import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {enrollmentPress, newEnrollment, type EnrollmentState} from './enrollment';
import type {Key} from './engine';
import {registryClient} from './registryClient';
export function useEnrollment(options: {userId: number | null; loadingAuth: boolean; online: boolean; timeoutSeconds: number; open: () => void; voice: (enabled: boolean) => void}) {
  const [state, setState] = useState(newEnrollment);
  const current = useRef(state); const opts = useRef(options); opts.current = options;
  const lastActivity = useRef(Date.now());
  const client = useMemo(() => registryClient(options.userId, () => opts.current.online), [options.userId]);
  const commit = useCallback((next: EnrollmentState) => { current.current = next; setState(next); }, []);
  useEffect(() => { commit(newEnrollment()); }, [options.userId, commit]);
  const handle = useCallback((key: Key): boolean => {
    if (current.current.stage === 'ready') return false;
    lastActivity.current = Date.now();
    const result = enrollmentPress(current.current, key); commit(result.state);
    if (result.action === 'voice-on' || result.action === 'voice-off') opts.current.voice(result.action === 'voice-on');
    if (result.action === 'open') opts.current.open();
    return true;
  }, [commit]);
  useEffect(() => {
    if (!['checking', 'saving'].includes(state.stage) || options.loadingAuth) return;
    let valid = true;
    const saving = state.stage === 'saving';
    const request = saving ? client.enroll(state.category!, state.county) : client.lookup();
    void request.then((participant) => {
      if (!valid) return;
      if (participant) { commit({...current.current, stage: 'ready', participant, publicOnly: false, notice: ''}); opts.current.open(); }
      else commit({...current.current, stage: 'category', input: '', notice: ''});
    }).catch(() => {
      if (!valid) return;
      commit({...current.current, stage: saving ? 'consent' : 'category', notice: opts.current.online ? 'Not confirmed. Retry or use public advice.' : 'Offline. Registration was not sent.'});
    });
    return () => { valid = false; };
  }, [state.stage, options.loadingAuth, client, commit]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!['dial', 'ready', 'checking', 'saving'].includes(current.current.stage) && Date.now() - lastActivity.current >= opts.current.timeoutSeconds * 1000) commit({...newEnrollment(), notice: 'Session timed out. Dial again.'});
    }, 1000);
    return () => clearInterval(timer);
  }, [commit]);
  const publicAdvice = useCallback(() => { commit({...newEnrollment(), stage: 'ready', publicOnly: true}); opts.current.open(); }, [commit]);
  const restart = useCallback(() => { commit(newEnrollment()); lastActivity.current = Date.now(); }, [commit]);
  return {state, handle, publicAdvice, restart};
}
