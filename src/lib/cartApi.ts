/**
 * Server cart reads and mutations.
 *
 * The server owns the cart. Nothing here computes a price, a line total or a
 * subtotal: every one of those comes back from the API. A cart line is a
 * variantId and a quantity, and nothing else is sent (AGENTS.md rule 2).
 */

import { get, post, put } from './api';
import type { Cart } from './types';

/** A line as the server accepts it. Never includes a price, which is stripped. */
export interface CartLineInput {
  variantId: string;
  quantity: number;
}

/** The server caps a line at 100; the UI stops there rather than failing a request. */
export const MAX_QUANTITY = 100;

export function readCart(): Promise<Cart> {
  return get<Cart>('/cart', { auth: true });
}

/**
 * Additive merge, used for "add to cart".
 *
 * Quantities are summed per variant and capped at the server's limit. This app
 * has no guest cart, so the merge is only ever called with the single line being
 * added.
 */
export function mergeCart(items: CartLineInput[]): Promise<Cart> {
  return post<Cart>('/cart/merge', { items }, { auth: true });
}

/**
 * Replace, used for changing a quantity and removing a line.
 *
 * The submitted list is the new truth, so any line absent from it is removed,
 * including a dead one. There is therefore no separate call for removing a dead
 * line: resubmitting the orderable list is enough.
 */
export function replaceCart(items: CartLineInput[]): Promise<Cart> {
  return put<Cart>('/cart', { items }, { auth: true });
}
