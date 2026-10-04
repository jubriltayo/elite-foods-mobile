/**
 * A minimal async read hook.
 *
 * Exists because two screens needed the same load-then-render shape, and because
 * a fetch belongs in one place: state is only ever set after the await resolves,
 * never synchronously in the effect body, which avoids a cascading render.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { toDisplayMessage } from './api';

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-runs the loader, e.g. pull to refresh. */
  reload: () => void;
}

export function useResource<T>(load: () => Promise<T>, key: string): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The loader is an inline arrow at every call site, so it is a new function on
  // every render and cannot be a dependency. It is read through a ref, kept
  // current in an effect rather than during render, so a refetch always calls
  // the latest closure without causing one.
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  }, [load]);

  const fetchInto = useCallback(async (isRefresh: boolean) => {
    if (!isRefresh) setLoading(true);
    try {
      const result = await loader.current();
      setData(result);
      setError(null);
    } catch (caught) {
      setError(toDisplayMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  // `key` alone decides when to fetch. Changing it means a different thing to
  // load, such as a different category.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await loader.current();
        if (!active) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (!active) return;
        setError(toDisplayMessage(caught));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [key]);

  const reload = useCallback(() => {
    void fetchInto(true);
  }, [fetchInto]);

  return { data, error, loading, reload };
}
