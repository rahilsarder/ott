'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthResponse, AuthUser, Profile } from '@ott/shared';
import { api, refreshSession, setAccessToken } from './api';

const ACTIVE_PROFILE_KEY = 'ott.activeProfile';

interface SessionState {
  user: AuthUser | null;
  profile: Profile | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  /** Applies an already-issued session (e.g. from an approved device/QR pairing) without another API call. */
  applySession: (res: AuthResponse) => void;
  signOut: () => Promise<void>;
  selectProfile: (profile: Profile) => Promise<void>;
  clearProfile: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  // On boot the access token lives only in memory (deliberately — it is never
  // written to localStorage), so restore it from the refresh cookie.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await refreshSession();
      if (cancelled) return;

      if (token) {
        try {
          const me = await api<AuthUser>('/auth/me');
          if (cancelled) return;
          setUser(me);

          const storedId = localStorage.getItem(ACTIVE_PROFILE_KEY);
          if (storedId) {
            const profiles = await api<Profile[]>('/profiles');
            const match = profiles.find((p) => p.id === storedId);
            if (match && !cancelled) await applyProfile(match);
          }
        } catch {
          setUser(null);
        }
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyProfile = useCallback(async (next: Profile) => {
    // Swap the account token for a profile-scoped one; the API reads the
    // profile from the token, never from a request parameter.
    const scoped = await api<AuthResponse>(`/profiles/${next.id}/select`, { method: 'POST' });
    setAccessToken(scoped.accessToken);
    setProfile(next);
    localStorage.setItem(ACTIVE_PROFILE_KEY, next.id);
  }, []);

  const applySession = useCallback((res: AuthResponse) => {
    setAccessToken(res.accessToken);
    setUser(res.user);
    setProfile(null);
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
        retryOnUnauthorized: false,
      });
      applySession(res);
    },
    [applySession],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: { name, email, password },
        retryOnUnauthorized: false,
      });
      applySession(res);
    },
    [applySession],
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      const res = await api<AuthResponse>('/auth/google', {
        method: 'POST',
        body: { idToken },
        retryOnUnauthorized: false,
      });
      applySession(res);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    await api<void>('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setProfile(null);
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    router.push('/login');
  }, [router]);

  const clearProfile = useCallback(() => {
    setProfile(null);
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    router.push('/profiles');
  }, [router]);

  const value = useMemo<SessionState>(
    () => ({
      user,
      profile,
      ready,
      signIn,
      signUp,
      signInWithGoogle,
      applySession,
      signOut,
      selectProfile: applyProfile,
      clearProfile,
    }),
    [user, profile, ready, signIn, signUp, signInWithGoogle, applySession, signOut, applyProfile, clearProfile],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
