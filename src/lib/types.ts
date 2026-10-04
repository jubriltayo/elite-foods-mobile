/**
 * Response shapes transcribed from docs/API_CONTRACT.md.
 *
 * Nothing here is invented. If the app needs a field the contract does not
 * document, that is a contract question, not a type to be widened with a guess.
 */

/**
 * Error codes from the contract's error table.
 *
 * FORBIDDEN, CONFLICT and RATE_LIMITED are declared by the API but not returned
 * by any route today: there is no admin API to forbid, and no application-level
 * rate limiter. They stay in the type because they are part of the envelope's
 * contract, and handling one costs nothing.
 *
 * A repeated idempotency key is NOT a CONFLICT. It is a 200 replay carrying the
 * original order, which is what POST /orders returns.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ApiErrorBody {
  code: ApiErrorCode;
  /** Human-readable and safe to show a user. */
  message: string;
  /** Present only for VALIDATION_ERROR. */
  fields?: Record<string, string>;
}

/** The envelope every /api/v1 response uses. */
export interface Envelope<T> {
  data: T | null;
  error: ApiErrorBody | null;
}

export interface ProductVariant {
  id: string;
  label: string;
  /** Whole Naira. */
  price: number;
}

export interface Product {
  slug: string;
  name: string;
  description: string;
  category: string;
  isAvailable: boolean;
  /** Whole Naira. Null or absent handling is up to the display layer. */
  startingPrice: number;
  /** Null until the shop has real photography. Never point at web assets. */
  imageUrl: string | null;
  variants: ProductVariant[];
}

/**
 * GET /categories. Ids and labels come from the server; nothing is hard-coded,
 * because an unknown `?category=` is a hard 400 rather than an ignored filter.
 */
export interface Category {
  id: string;
  label: string;
}

export interface CartLineProduct {
  slug: string;
  name: string;
  isAvailable: boolean;
  imageUrl: string | null;
}

export interface CartLineVariant {
  label: string;
  /** Whole Naira. */
  price: number;
}

export interface CartItem {
  /** Stable for the life of the line; identifies a dead line. */
  lineId: string;
  variantId: string;
  quantity: number;
  product: CartLineProduct;
  variant: CartLineVariant;
  /** Whole Naira. */
  lineTotal: number;
}

export type CartIssueReason =
  | 'variant_missing'
  | 'product_missing'
  | 'unavailable'
  | 'quantity_capped';

/**
 * A dead or rejected line. These appear only here, never in `items`, and
 * contribute to neither `subtotal` nor `itemCount`.
 */
export interface CartIssue {
  lineId: string;
  variantId: string | null;
  reason: CartIssueReason;
}

export interface Cart {
  items: CartItem[];
  issues: CartIssue[];
  /** Whole Naira. Excludes delivery. */
  subtotal: number;
  /** Total units across orderable lines, not the number of lines. */
  itemCount: number;
}

export interface DeliveryArea {
  id: string;
  label: string;
  /** Whole Naira. The figure checkout actually charges. */
  fee: number;
}

export interface PaymentMethod {
  id: string;
  label: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid';

/**
 * Bank transfer details, returned by POST /orders and GET /orders/[id] when the
 * order is a bank transfer, and null otherwise. The key is always present so the
 * shape stays stable and the confirmation screen has one code path.
 *
 * Not returned by GET /orders: a history list does not need banking details for
 * every order.
 *
 * `isPlaceholder` is true while the shop's banking information is still the
 * placeholder set. The app must surface that flag rather than presenting the
 * details as real. It flips to false on its own once the real values land, so
 * nothing here needs a second edit at that point.
 */
export interface BankTransferDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  isPlaceholder: boolean;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** Whole Naira. */
  subtotal: number;
  /** Whole Naira. */
  deliveryFee: number;
  /** Whole Naira. */
  total: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  createdAt: string;
}

export interface OrderListEntry extends OrderSummary {
  itemCount: number;
}

export interface OrderItem {
  variantId: string | null;
  productName: string;
  variantLabel: string;
  /** Whole Naira. A snapshot taken at checkout. */
  unitPrice: number;
  quantity: number;
  /** Whole Naira. */
  lineTotal: number;
}

export interface Order extends OrderSummary {
  itemCount: number;
  customerName: string;
  customerPhone: string;
  deliveryArea: string;
  deliveryAddress: string;
  note: string | null;
  items: OrderItem[];
  /** The object below for a bank transfer, null for pay on delivery. */
  bankTransfer: BankTransferDetails | null;
}

/** POST /orders response. */
export interface OrderPlaced extends OrderSummary {
  /** Whether Mailgun accepted the confirmation. Never affects the order. */
  emailSent: boolean;
  /**
   * True when the idempotency key matched an order that already existed. This is
   * a 200, not a CONFLICT, and the new body was ignored: the key, not the body,
   * is the retry boundary.
   */
  idempotentReplay: boolean;
  /** The object below for a bank transfer, null for pay on delivery. */
  bankTransfer: BankTransferDetails | null;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  /** Display only. The token carries no role and this is never trusted for authorization. */
  role: string;
}

export interface AuthToken {
  accessToken: string;
  tokenType: string;
  /** Seconds. 3600 today. */
  expiresIn: number;
  profile: Profile;
}
