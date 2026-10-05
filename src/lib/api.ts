/**
 * The one HTTP client. Every request in the app goes through here.
 *
 * Responsibilities, and nothing else (AGENTS.md rule 6):
 *  - read the { data, error } envelope
 *  - turn a failure into a typed ApiError carrying the server's safe message
 *  - decide what a status means, centrally
 *
 * Screens never see a raw Response, a JSON parse error or a stack trace.
 */

import type { ApiErrorBody, ApiErrorCode, Envelope } from './types';

const DEFAULT_BASE_URL = 'https://elite-foods.vercel.app/api/v1';

export function getBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  const base = (configured && configured.trim()) || DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '');
}

/**
 * A failure safe to show a user. `code` is what logic branches on;
 * `message` came from the server and is already user-safe.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    if (fields) this.fields = fields;
  }
}

/** True when an error is an ApiError rather than a bug in this app. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Turns a thrown value into something displayable.
 *
 * Anything that is not an ApiError is treated as INTERNAL with a fixed message,
 * because a stack trace or a driver message must never reach a screen
 * (AGENTS.md rules 5 and 6).
 */
export function toDisplayMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  return 'Something went wrong. Please try again.';
}

/** Maps an HTTP status to a code, for responses that carry no envelope. */
function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL';
  }
}

/**
 * Fallback copy for a code that arrived without a usable message. Only shown if
 * the server sent a bare code.
 */
const MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Please check the details and try again.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have access to that.',
  NOT_FOUND: 'We could not find that.',
  // Reserved: no route returns CONFLICT today. A repeated idempotency key is a
  // 200 replay with the original order, handled by the orders layer, not here.
  CONFLICT: 'That conflicts with something we already have.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  INTERNAL: 'Something went wrong. Please try again.',
};

/**
 * Installed by the session layer in phase 2. Phase 1 has no auth, so this is a
 * no-op hook that lets the retry path be built now without rework.
 *
 * Returns true when it handled the failure and the request may be replayed.
 */
export type UnauthorizedHandler = () => Promise<boolean>;

let onUnauthorized: UnauthorizedHandler = async () => false;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

export interface RequestOptions {
  /** JSON body. Omit for GET. */
  body?: unknown;
  /** Extra headers, e.g. Idempotency-Key. */
  headers?: Record<string, string>;
  /** Attach the bearer token. Phase 1 has no token source yet. */
  auth?: boolean;
  /** Internal: prevents an infinite 401 retry loop. */
  _isRetry?: boolean;
  signal?: AbortSignal;
}

/**
 * Reads the bearer token for an authenticated request.
 *
 * Set by the session layer. Until then there is no credential to send, so an
 * authenticated request simply goes out unauthenticated and the server answers
 * 401, which is the honest result rather than a fabricated one.
 */
let tokenProvider: () => Promise<string | null> = async () => null;

export function setTokenProvider(provider: () => Promise<string | null>): void {
  tokenProvider = provider;
}

function isEnvelope(body: unknown): body is Envelope<unknown> {
  return typeof body === 'object' && body !== null && ('data' in body || 'error' in body);
}

async function send(method: string, path: string, options: RequestOptions): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  if (options.auth) {
    const token = await tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    // A transport failure, not a server verdict. Offline and DNS both land here.
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError('INTERNAL', 'Cannot reach Elite Foods right now. Check your connection.', 0);
  }

  // A 204 or an empty body is a legitimate success for some routes.
  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!isEnvelope(parsed)) {
    // Not the documented envelope: an HTML error page, a gateway body or a
    // WAF response. Report by status and show nothing internal.
    if (response.ok) return null;
    throw new ApiError(codeForStatus(response.status), MESSAGES[codeForStatus(response.status)], response.status);
  }

  const envelope = parsed;

  if (envelope.error) {
    const body: ApiErrorBody = envelope.error;
    throw new ApiError(body.code ?? codeForStatus(response.status), body.message ?? MESSAGES.INTERNAL, response.status, body.fields);
  }

  if (!response.ok) {
    // ok:false but error:null. The contract does not describe this, so treat it
    // as a server-side failure rather than inventing a success.
    const code = codeForStatus(response.status);
    throw new ApiError(code, MESSAGES[code], response.status);
  }

  return envelope.data;
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return (await send(method, path, options)) as T;
  } catch (error) {
    const retryable = options.auth === true && !options._isRetry && isApiError(error) && error.code === 'UNAUTHENTICATED';

    if (!retryable) throw error;

    // Replaying a request that carried a body is safe here specifically because
    // a 401 means the credential was refused, so the route never ran and no
    // mutation happened. This is also why the Idempotency-Key in phase 4 is a
    // belt-and-braces guard rather than the thing preventing a double write.
    //
    // One re-mint and one replay, never a loop (AGENTS.md rule 4).
    const handled = await onUnauthorized();
    if (!handled) throw error;

    // The replay re-reads the token through the provider, so it picks up the
    // freshly minted one rather than the rejected one.
    return request<T>(method, path, { ...options, _isRetry: true });
  }
}

export function get<T>(path: string, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
  return request<T>('GET', path, options);
}

export function post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
  return request<T>('POST', path, { ...options, body });
}

export function put<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
  return request<T>('PUT', path, { ...options, body });
}
