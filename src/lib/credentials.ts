/**
 * Credential storage.
 *
 * The bearer token lives in expo-secure-store and nowhere else. It is never
 * written to AsyncStorage and never logged (AGENTS.md rules 4 and 5).
 *
 * There is no GET /me, so the display name and email from the last
 * /auth/token response are cached here alongside the token. Without it a cold
 * start could show nothing about the signed-in user until the next exchange.
 */

import * as SecureStore from 'expo-secure-store';

import type { Profile } from './types';

const TOKEN_KEY = 'efs_access_token';
const PROFILE_KEY = 'efs_profile_cache';

/**
 * SecureStore values must be strings. The profile cache is stored as JSON and
 * read defensively: a corrupt or truncated value must not stop the app booting.
 */
export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Nothing to do: the value is gone either way, and a failure here must not
    // block signing out.
  }
}

export async function saveProfileCache(profile: Profile): Promise<void> {
  try {
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify({ email: profile.email, fullName: profile.fullName }));
  } catch {
    // A cache miss only costs a less detailed account screen.
  }
}

export interface CachedProfile {
  email: string;
  fullName: string;
}

/**
 * Returns the cached display details, or null when there are none.
 *
 * Only the display fields are cached. The id and role are deliberately not
 * persisted: role is re-read server-side per request and is never trusted here.
 */
export async function readProfileCache(): Promise<CachedProfile | null> {
  try {
    const raw = await SecureStore.getItemAsync(PROFILE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { email, fullName } = parsed as Partial<CachedProfile>;
    if (typeof email !== 'string' || typeof fullName !== 'string') return null;

    return { email, fullName };
  } catch {
    return null;
  }
}

export async function clearProfileCache(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PROFILE_KEY);
  } catch {
    // As above: a cache clear failure must not block signing out.
  }
}

/** Removes every credential this app stored. */
export async function clearCredentials(): Promise<void> {
  await clearToken();
  await clearProfileCache();
}
