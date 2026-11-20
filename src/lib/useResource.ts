import {useCallback, useEffect, useRef, useState} from 'react';

export interface Resource<T> {data: T | null; loading: boolean; error: string | null; reload: () => void}

/** Loads one resource and keeps loading and error visible, so a failed request is never shown as zero. */
export function useResource<T>(load: () => Promise<T>, deps: ReadonlyArray<unknown>, enabled = true): Resource<T> {
  const [state, setState] = useState<{data: T | null; loading: boolean; error: string | null}>({data: null, loading: enabled, error: null});
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!enabled) { setState((s) => ({...s, loading: false})); return; }
    let live = true;
    setState((s) => ({...s, loading: true, error: null}));
    loadRef.current()
      .then((data) => { if (live) setState({data, loading: false, error: null}); })
      .catch((e: unknown) => { if (live) setState((s) => ({data: s.data, loading: false, error: e instanceof Error ? e.message : 'Could not load this information.'})); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, enabled, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return {...state, reload};
}
