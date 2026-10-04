/**
 * Response shapes transcribed from docs/API_CONTRACT.md.
 *
 * Nothing here is invented. If the app needs a field the contract does not
 * document, that is a contract question, not a type to be widened with a guess.
 */

/** Error codes the contract defines. */
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
 * GET /categories. Being added server-side; absent today, in which case the
 * endpoint answers 404 and the app renders no filter row. Ids and labels are
 * never hard-coded, because an unknown ?category= is a hard 400.
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
 * Bank transfer details are being added server-side and are absent today.
 * Optional so the app renders safely before and after they land.
 */
export interface BankTransferDetails {
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
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
  bankTransfer?: BankTransferDetails;
}

/** POST /orders response. */
export interface OrderPlaced extends OrderSummary {
  /** Whether Mailgun accepted the confirmation. Never affects the order. */
  emailSent: boolean;
  /** True when the idempotency key matched an existing order. */
  idempotentReplay: boolean;
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
