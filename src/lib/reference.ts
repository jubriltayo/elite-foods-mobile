/**
 * Reference data: delivery areas and payment methods.
 *
 * Both are validated strictly by the API, so the valid ids must come from the
 * server. An unrecognised deliveryArea or paymentMethod is a 400, not an ignored
 * value, which means a hard-coded id would fail the moment the shop changes one.
 *
 * Cached in memory for the session only. Nothing is persisted: the next launch
 * reads them again, so a change server-side reaches the app without a release.
 */

import { get } from './api';
import type { DeliveryArea, PaymentMethod } from './types';

interface AreasResponse {
  areas: DeliveryArea[];
}

interface MethodsResponse {
  paymentMethods: PaymentMethod[];
}

let areasPromise: Promise<DeliveryArea[]> | null = null;
let methodsPromise: Promise<PaymentMethod[]> | null = null;

/** Forces the next read to hit the API again. */
export function clearReferenceCache(): void {
  areasPromise = null;
  methodsPromise = null;
}

export function getDeliveryAreas(): Promise<DeliveryArea[]> {
  // The promise itself is cached, so concurrent callers share one request rather
  // than each producing their own.
  areasPromise ??= get<AreasResponse>('/delivery-areas').then((data) => data.areas);
  return areasPromise;
}

export function getPaymentMethods(): Promise<PaymentMethod[]> {
  methodsPromise ??= get<MethodsResponse>('/payment-methods').then((data) => data.paymentMethods);
  return methodsPromise;
}

/**
 * The fee for an area, read from the server's own figure.
 *
 * Display only. The server decides the fee that is actually charged, and the
 * checkout route prices through the same function the web form uses, so this can
 * never drift from what is charged.
 */
export function feeForArea(areas: DeliveryArea[], id: string | undefined): number | null {
  if (!id) return null;
  return areas.find((area) => area.id === id)?.fee ?? null;
}
