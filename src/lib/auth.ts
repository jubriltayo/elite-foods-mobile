/**
 * Google sign-in and the bearer-token exchange.
 *
 * Google is the only trust anchor. The app never decides who the user is: it
 * hands the server a Google ID token and the server resolves the profile.
 */

import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

import { ApiError, post, toDisplayMessage } from './api';
import { clearCredentials, readToken, saveProfileCache, saveToken } from './credentials';
import type { AuthToken, Profile } from './types';

const DEFAULT_WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

/**
 * The web OAuth client id, which is a public identifier that ships in the bundle
 * anyway. It is the audience of the ID token we exchange, which is why the API
 * needs no extra configuration to accept it.
 */
export function getWebClientId(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? DEFAULT_WEB_CLIENT_ID;
}

let configured = false;

/**
 * Configures the SDK once per app launch.
 *
 * `webClientId` is what makes the returned ID token carry the web client as its
 * audience. No offlineAccess: this app has no refresh token and never calls a
 * Google API on the user's behalf, so an authorization code would be unused
 * surface.
 */
export function configureGoogleSignIn(): void {
  if (configured) return;
  configured = true;

  GoogleSignin.configure({
    webClientId: getWebClientId(),
    offlineAccess: false,
  });
}

function nativeCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * True when the user dismissed the account chooser, which is not a failure.
 *
 * The cancellation code is a native constant, so it is read from the SDK rather
 * than guessed as a literal.
 */
export function isSignInCancelled(error: unknown): boolean {
  return nativeCode(error) === statusCodes.SIGN_IN_CANCELLED;
}

/**
 * The standard Google Play services status code for a developer error, which on
 * Android means the app's package name or signing SHA-1 does not match the
 * Android OAuth client. It is a numeric status from the Play services library
 * rather than one of this SDK's string constants.
 */
const DEVELOPER_ERROR_STATUS = 10;

function describeSignInFailure(error: unknown): string {
  const code = nativeCode(error);

  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return 'Google Play Services is not available on this device.';
  }

  // The SDK reports some native failures as a plain number, so both shapes are
  // checked. This is by far the most common setup mistake and deserves a real
  // message rather than "something went wrong".
  const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
  if (code === 'DEVELOPER_ERROR' || status === DEVELOPER_ERROR_STATUS) {
    return 'This app is not set up for Google sign-in yet. Please contact Elite Foods.';
  }

  return toDisplayMessage(error);
}

/**
 * Exchanges a Google ID token for our bearer token.
 *
 * A failure here is deliberately not retried: the contract is explicit that a
 * 401 from this endpoint means the Google token was not acceptable, and
 * retrying in a loop would only look like abuse.
 */
export async function exchangeGoogleIdToken(idToken: string): Promise<AuthToken> {
  const result = await post<AuthToken>('/auth/token', { idToken });

  await saveToken(result.accessToken);
  await saveProfileCache(result.profile);

  return result;
}

/** Interactive sign-in: chooser, then exchange. */
export async function signInWithGoogle(): Promise<Profile> {
  configureGoogleSignIn();

  const hasPlayServices = await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  if (!hasPlayServices) {
    throw new ApiError('INTERNAL', 'Google Play Services is not available on this device.', 0);
  }

  let idToken: string;
  try {
    const response = await GoogleSignin.signIn();

    if (response.type === 'cancelled') {
      throw new CancelledSignIn();
    }

    // getTokens is the documented way to obtain the ID token; response.data.idToken
    // is populated by the same native call.
    const tokens = await GoogleSignin.getTokens();
    idToken = tokens.idToken;
  } catch (error) {
    if (error instanceof CancelledSignIn) throw error;
    if (isSignInCancelled(error)) throw new CancelledSignIn();
    throw new ApiError('INTERNAL', describeSignInFailure(error), 0);
  }

  try {
    const result = await exchangeGoogleIdToken(idToken);
    return result.profile;
  } catch (error) {
    // The Google credential was fine but the exchange failed. Sign the Google
    // session out so the next attempt starts clean rather than reusing a
    // credential the server just refused.
    await GoogleSignin.signOut().catch(() => undefined);
    throw error;
  }
}

/** Thrown when the user dismisses the chooser. Not an error to display. */
export class CancelledSignIn extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledSignIn';
  }
}

/**
 * Produces a fresh Google ID token without user interaction.
 *
 * Used by the 401 path. Returns null when there is no usable saved credential,
 * which is the signal to send the user back to the sign-in screen rather than
 * retry.
 */
async function fetchSilentIdToken(): Promise<string | null> {
  configureGoogleSignIn();

  if (!GoogleSignin.hasPreviousSignIn()) return null;

  try {
    const response = await GoogleSignin.signInSilently();

    if (response.type === 'noSavedCredentialFound') return null;

    const tokens = await GoogleSignin.getTokens();
    return tokens.idToken ?? null;
  } catch {
    // Revoked on the device, Play Services unavailable, or no credential. Any of
    // these means a visible re-sign-in, not a retry.
    return null;
  }
}

/**
 * Re-mints the bearer token after a 401, with no user interaction.
 *
 * There is no refresh token, so this is the entire refresh story: one silent
 * Google sign-in, one exchange. Concurrent callers share a single attempt, so
 * several parallel requests failing at once cannot each mint a token.
 */
let remintInFlight: Promise<boolean> | null = null;

export async function remintAccessToken(): Promise<boolean> {
  if (remintInFlight) return remintInFlight;

  remintInFlight = (async () => {
    try {
      const idToken = await fetchSilentIdToken();
      if (!idToken) return false;

      await exchangeGoogleIdToken(idToken);
      return true;
    } catch {
      // The exchange failed, so the old token is useless. Clear it rather than
      // leaving an expired credential to fail every later request.
      await clearCredentials();
      return false;
    } finally {
      remintInFlight = null;
    }
  })();

  return remintInFlight;
}

/** True when a stored token exists. Does not prove it is still valid. */
export async function hasStoredToken(): Promise<boolean> {
  return (await readToken()) !== null;
}

/**
 * Signs out.
 *
 * Local only: the API has no revocation endpoint and its tokens are stateless,
 * so a leaked token stays valid until it expires. The one-hour lifetime is what
 * bounds that.
 */
export async function signOut(): Promise<void> {
  configureGoogleSignIn();
  await clearCredentials();
  await GoogleSignin.signOut().catch(() => undefined);
}
