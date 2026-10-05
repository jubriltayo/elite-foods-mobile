/**
 * Order reads and placement.
 *
 * The basket is never sent. `POST /orders` takes the saved server cart, so the
 * body here carries a customer's details and nothing else: no items, no prices,
 * no totals. The server is the only thing that decides what an order costs.
 */

import { get, post } from './api';
import type { Order, OrderListEntry, OrderPlaced } from './types';

/** Exactly what the contract accepts, and nothing more. */
export interface PlaceOrderInput {
  customerName: string;
  customerPhone: string;
  deliveryArea: string;
  deliveryAddress: string;
  note?: string;
  paymentMethod: string;
}

interface OrdersResponse {
  orders: OrderListEntry[];
}

export function listOrders(): Promise<OrderListEntry[]> {
  return get<OrdersResponse>('/orders', { auth: true }).then((data) => data.orders);
}

export function getOrder(id: string): Promise<Order> {
  return get<Order>(`/orders/${encodeURIComponent(id)}`, { auth: true });
}

/**
 * Places an order from the server cart.
 *
 * The key travels in the Idempotency-Key header, which the contract says wins
 * over the body field. The body field is deliberately not also sent: two places to
 * keep in sync is one too many.
 */
export function placeOrder(input: PlaceOrderInput, idempotencyKey: string): Promise<OrderPlaced> {
  return post<OrderPlaced>('/orders', input, {
    auth: true,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}
