/**
 * Session state: who is signed in, and the bearer token every request uses.
 *
 * Holds no authority of its own. The token is read from secure-store by the API
 * client; role is display-only and never gates a screen, because the server
 * re-reads it per request and the token does not even carry it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { setTokenProvider, setUnauthorizedHandler } from './api';
import { CancelledSignIn, configureGoogleSignIn, hasStoredToken, remintAccessToken, signInWithGoogle, signOut as endSignOut } from './auth';
import { readProfileCache, readToken } from './credentials';
import type { CachedProfile } from './credentials';
import type { Profile } from './types';

export type SessionStatus = 'loading' | 'signed-out' | 'signed-in';

export interface Session {
  status: SessionStatus;
  /**
   * The live profile from the last exchange, or the cached display details after
   * a cold start. Null when nothing is known, which the account screen renders
   * as a generic signed-in state rather than inventing details.
   */
  profile: Profile | null;
  /** True when profile details came from cache and are not yet confirmed. */
  isProvisional: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Set when a sign-in attempt failed, so a screen can show it. */
  error: string | null;
  clearError: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cached, setCached] = useState<CachedProfile | null>(null);
  const [isProvisional, setIsProvisional] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The API client needs a token and a way to recover from a 401. Both are
  // installed here because the session owns the credential; api.ts stays free of
  // any Google or storage knowledge.
  useEffect(() => {
    setTokenProvider(readToken);

    setUnauthorizedHandler(async () => {
      // One re-mint and one replay. Returning false means the request is not
      // retried and the session ends up signed out.
      const recovered = await remintAccessToken();
      if (!recovered) setStatus('signed-out');
      return recovered;
    });
  }, []);

  // Restore on launch. A stored token is treated as signed-in optimistically and
  // the first authenticated request confirms it; a 401 re-mints or signs out.
  useEffect(() => {
    let active = true;

    void (async () => {
      configureGoogleSignIn();

      const [hasToken, cache] = await Promise.all([hasStoredToken(), readProfileCache()]);
      if (!active) return;

      if (cache) setCached(cache);

      if (hasToken) {
        setStatus('signed-in');
        setIsProvisional(true);
      } else {
        setStatus('signed-out');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);

    try {
      const next = await signInWithGoogle();
      setProfile(next);
      setCached({ email: next.email, fullName: next.fullName });
      setIsProvisional(false);
      setStatus('signed-in');
    } catch (caught) {
      if (caught instanceof CancelledSignIn) {
        // The user chose to back out. Not a failure, so no message.
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Please try again.');
    }
  }, []);

  const signOut = useCallback(async () => {
    await endSignOut();
    setProfile(null);
    setCached(null);
    setIsProvisional(false);
    setError(null);
    setStatus('signed-out');
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<Session>(
    () => ({
      status,
      profile: profile ?? (cached ? { id: '', email: cached.email, fullName: cached.fullName, role: '' } : null),
      isProvisional: profile === null && isProvisional,
      signIn,
      signOut,
      error,
      clearError,
    }),
    [status, profile, cached, isProvisional, signIn, signOut, error, clearError],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside a SessionProvider');
  return session;
}
