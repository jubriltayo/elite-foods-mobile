/**
 * The server cart, in one place.
 *
 * The cart is server state, so nothing is persisted on the device: there is no
 * local copy to fall back to, no cache to reconcile, and no second source of
 * truth. Signing in reads it from the API; signing out drops it.
 *
 * Mutations are optimistic (AGENTS.md rule 11): the UI updates immediately, then
 * every value is replaced by the server's response. On failure the previous
 * server state is restored and the error is shown. A provisional figure is never
 * left on screen once the server has answered.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { toDisplayMessage } from './api';
import { MAX_QUANTITY, mergeCart, readCart, replaceCart } from './cartApi';
import type { CartLineInput } from './cartApi';
import { useSession } from './session';
import type { Cart, CartItem, CartIssue } from './types';

export interface CartContextValue {
  cart: Cart | null;
  /** True while any mutation is in flight, so buttons can be disabled. */
  busy: boolean;
  /** True while the cart is being re-read. Drives the pull-to-refresh spinner. */
  refreshing: boolean;
  error: string | null;
  clearError: () => void;
  /** Total units, for the tab badge. Null while signed out or not yet loaded. */
  itemCount: number | null;
  refresh: () => Promise<void>;
  addVariant: (variantId: string, quantity: number) => Promise<void>;
  setQuantity: (lineId: string, quantity: number) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  /** Clears issues by resubmitting the orderable list, which replace does. */
  removeDeadLines: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Builds the lines to send for a replace, from the orderable lines only.
 *
 * Dead lines live in `issues` and have no usable variantId, so they cannot be
 * represented in a PUT body. A replace therefore necessarily drops them, which
 * is the documented behaviour: the submitted list is the new truth.
 */
function linesFrom(items: CartItem[], quantityFor: (item: CartItem) => number): CartLineInput[] {
  return items.map((item) => ({ variantId: item.variantId, quantity: quantityFor(item) }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();

  const [cart, setCart] = useState<Cart | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether a cart has been read at least once, so the first load and a refresh
  // can be told apart without adding a second piece of state.
  const loadedRef = useRef(false);

  // Guards against a second tap while a mutation is in flight. A ref rather than
  // state, because the check and the set must happen without an intervening
  // render, or a fast double-tap would slip through both.
  const inFlight = useRef(false);

  const beginExclusive = useCallback(() => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    return true;
  }, []);

  const endExclusive = useCallback(() => {
    inFlight.current = false;
    setBusy(false);
  }, []);

  const refresh = useCallback(async () => {
    // The pull-to-refresh indicator. Only flagged once a cart has actually been
    // loaded, because refresh() also runs on every focus to pick up a change made
    // on the web, and a spinner flashing on each tab switch would be noise. The
    // first load shows the skeleton instead.
    if (loadedRef.current) setRefreshing(true);

    try {
      const next = await readCart();
      loadedRef.current = true;
      setCart(next);
      setError(null);
    } catch (caught) {
      setError(toDisplayMessage(caught));
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Read the cart when a session becomes available. Clearing on sign-out is
  // derived during render below rather than done here, so this effect only starts
  // a fetch. State is set after the await, never synchronously in the effect body.
  useEffect(() => {
    if (status !== 'signed-in') return;

    let active = true;
    void (async () => {
      try {
        const next = await readCart();
        if (active) setCart(next);
      } catch (caught) {
        if (active) setError(toDisplayMessage(caught));
      }
    })();

    return () => {
      active = false;
    };
  }, [status]);

  // The cart requires an account, so a signed-out visitor sees nothing. Deriving
  // this during render rather than clearing state in an effect avoids a frame in
  // which the previous customer's cart is briefly visible.
  const visibleCart = status === 'signed-in' ? cart : null;

  // Refetch when the app comes back to the foreground, so a change made on the
  // web shows up on the phone without a manual pull.
  useEffect(() => {
    if (status !== 'signed-in') return;

    const onChange = (next: AppStateStatus) => {
      if (next === 'active') void refresh();
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [status, refresh]);

  /**
   * Runs a mutation optimistically and then adopts the server's answer.
   *
   * `optimistic` produces the provisional cart to show immediately; whatever the
   * server returns replaces it wholesale, so no local figure survives the
   * response.
   */
  const mutate = useCallback(
    async (optimistic: (current: Cart) => Cart, send: () => Promise<Cart>) => {
      if (!beginExclusive()) return;

      const previous = cart;
      if (previous) setCart(optimistic(previous));
      setError(null);

      try {
        setCart(await send());
      } catch (caught) {
        // Revert to the last state the server confirmed, never to a guess.
        if (previous) setCart(previous);
        setError(toDisplayMessage(caught));
      } finally {
        endExclusive();
      }
    },
    [beginExclusive, cart, endExclusive],
  );

  const addVariant = useCallback(
    (variantId: string, quantity: number) => {
      const amount = Math.max(1, Math.min(MAX_QUANTITY, Math.round(quantity)));

      return mutate(
        (current) => {
          const existing = current.items.find((item) => item.variantId === variantId);
          if (!existing) return current;

          const items = current.items.map((item) =>
            item.variantId === variantId ? { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + amount) } : item,
          );
          return { ...current, items };
        },
        () => mergeCart([{ variantId, quantity: amount }]),
      );
    },
    [mutate],
  );

  const setQuantity = useCallback(
    (lineId: string, quantity: number) => {
      const amount = Math.max(1, Math.min(MAX_QUANTITY, Math.round(quantity)));

      return mutate(
        (current) => {
          const items = current.items.map((item) => (item.lineId === lineId ? { ...item, quantity: amount } : item));
          return { ...current, items };
        },
        () => replaceCart(linesFrom(cart?.items ?? [], (item) => (item.lineId === lineId ? amount : item.quantity))),
      );
    },
    [cart, mutate],
  );

  const removeLine = useCallback(
    (lineId: string) =>
      mutate(
        (current) => ({ ...current, items: current.items.filter((item) => item.lineId !== lineId) }),
        // Excluding the line by lineId here, so the body sent is exactly the
        // server cart minus that line. Rebuilding from the captured `cart` rather
        // than the optimistic value keeps the request free of any local guess.
        () => replaceCart(linesFrom((cart?.items ?? []).filter((item) => item.lineId !== lineId), (item) => item.quantity)),
      ),
    [cart, mutate],
  );

  /**
   * Clears issues by resubmitting the orderable list.
   *
   * Dead lines are absent from `items`, so a replace with the current list drops
   * them. There is no dedicated endpoint and none is needed.
   */
  const removeDeadLines = useCallback(
    () =>
      mutate(
        (current) => ({ ...current, issues: [] }),
        () => replaceCart(linesFrom(cart?.items ?? [], (item) => item.quantity)),
      ),
    [cart, mutate],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart: visibleCart,
      busy,
      refreshing,
      error,
      clearError: () => setError(null),
      itemCount: visibleCart?.itemCount ?? null,
      refresh,
      addVariant,
      setQuantity,
      removeLine,
      removeDeadLines,
    }),
    [visibleCart, busy, refreshing, error, refresh, addVariant, setQuantity, removeLine, removeDeadLines],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside a CartProvider');
  return value;
}

/** Wording for each issue reason, so a customer is told what happened. */
export function describeIssue(issue: CartIssue): string {
  switch (issue.reason) {
    case 'variant_missing':
      return 'This size is no longer available and was removed.';
    case 'product_missing':
      return 'This product is no longer available and was removed.';
    case 'unavailable':
      return 'This product is currently unavailable.';
    case 'quantity_capped':
      return 'There is not enough stock for that quantity, so it was reduced.';
  }
}
