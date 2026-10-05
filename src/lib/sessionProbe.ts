/**
 * A single authenticated read, used to prove the session works end to end.
 *
 * GET /cart needs a credential and is harmless when empty, which makes it the
 * cheapest way to confirm that the stored token is accepted by the API. It is
 * also how the contract's most important assertion is checked: the same route
 * answered with a bearer token and with a web session cookie must be identical,
 * because that is what proves a mobile customer and a web customer are the same
 * customer.
 *
 * The cart itself is phase 3. This is a probe, not a cart feature.
 */

import { get } from './api';
import type { Cart } from './types';

export function probeSessionCart(): Promise<Cart> {
  return get<Cart>('/cart', { auth: true });
}
