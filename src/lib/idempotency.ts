/**
 * Idempotency keys for order placement.
 *
 * The key, not the body, is the retry boundary. The server answers a repeated
 * key with the original order and ignores a new body, so reusing a key for a
 * genuinely new order would silently return the older one. Getting this wrong is
 * the way to place one order twice, or to be unable to place a second one at all.
 *
 * The rules, which this module exists to make mechanical:
 *
 *  - Mint a fresh key when the customer taps Place order.
 *  - Reuse that key ONLY when retrying the same attempt after a network error, a
 *    timeout or a 5xx, where the outcome is genuinely unknown.
 *  - Mint a new key after a success, after a definite server rejection (4xx),
 *    after any edit to the form, and when the screen is left and revisited.
 *
 * `randomUUID` comes from expo-crypto, backed by the platform's secure random.
 * React Native exposes no crypto RNG of its own, so a hand-rolled generator would
 * be Math.random, which is not strong enough for the value that stands between a
 * retry and a duplicate order.
 */

import { randomUUID } from 'expo-crypto';

export function newIdempotencyKey(): string {
  return randomUUID();
}

/**
 * Holds the key for the attempt currently in flight.
 *
 * Kept in a ref rather than state because it is not rendered: it must survive
 * re-renders without causing them, and it must be readable the instant a retry is
 * pressed.
 */
export interface IdempotencyKeyRef {
  current: string | null;
}

export function createKeyRef(): IdempotencyKeyRef {
  return { current: null };
}

/**
 * Returns the key for a new attempt, replacing any previous one.
 *
 * Called when the customer taps Place order, and whenever the attempt is known to
 * have finished or been abandoned.
 */
export function beginAttempt(keys: IdempotencyKeyRef): string {
  keys.current = newIdempotencyKey();
  return keys.current;
}

/**
 * Returns the key to retry with, or a new one if there is nothing to reuse.
 *
 * Reuse is only safe when the previous attempt might have reached the server, so
 * this is called exclusively after a network failure, a timeout or a 5xx. On
 * every other failure the previous key is discarded rather than reused.
 */
export function keyForRetry(keys: IdempotencyKeyRef): string {
  if (keys.current) return keys.current;
  return beginAttempt(keys);
}

/** Discards the current attempt, so the next tap starts a distinct order. */
export function endAttempt(keys: IdempotencyKeyRef): void {
  keys.current = null;
}
