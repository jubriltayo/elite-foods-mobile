# Elite Foods — Mobile API Plan

Status: **Phase 0 complete. Phase 1 approved and in progress.**

Goal: expose the server-authoritative parts of the web app as a versioned JSON API
so a React Native (Expo) app, built later in its own repository, can share the
**same identity, cart and orders** as the web app.

This document is the contract handed to the mobile project.

## Decisions of record

| #   | Decision                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The "database-persisted carts" exclusion is **lifted**. A server-side cart is in scope because the mobile app must share the cart.            |
| 2   | Mobile is React Native with Expo, in a **separate repo**. No mobile code here.                                                                |
| 3   | Dead cart lines use `ON DELETE SET NULL`, matching `order_items`. Not cascade.                                                                |
| 4   | `PUT /cart` is replace. Last-write-wins across devices is **accepted** for MVP.                                                               |
| 5   | Signed-in users get an **in-memory overlay**, not a `localStorage` cache.                                                                     |
| 6   | API tokens use a **dedicated `API_TOKEN_SECRET`**, not `AUTH_SECRET`, and carry verified `iss` + `aud`.                                       |
| 7   | Google `aud` is checked against a **comma-separated list** of client ids (Android, iOS, web).                                                 |
| 8   | **No application-level rate limiter.** Rely on Vercel. Recorded as a known gap.                                                               |
| 9   | Mobile is **customer-only**. No `/api/v1/admin/*`.                                                                                            |
| 10  | `jose` becomes a **direct** dependency.                                                                                                       |
| 11  | Route handlers **never** call `redirect()`; they return the JSON envelope with 401.                                                           |
| 12  | The checkout rules move into `lib/checkout.ts` **before** any order route is written. One implementation, two transports.                     |
| 13  | `placeOrderForProfile` takes `Omit<CheckoutInput, "items">`. A transport **cannot** pass a basket; this is a compile error, not a convention. |
| 14  | The **order's uuid is exposed**, unlike a product's, because an order has no slug and `/orders/[id]` takes it.                                |
| 15  | A repeated idempotency key returns the original order and **ignores a differing body**. Recorded, not "fixed".                                |
| 16  | A public `GET /api/v1/delivery-areas` is added, because `deliveryArea` was validated but never documented to clients.                         |
| 17  | Payment methods get a **sibling** endpoint, `/api/v1/payment-methods`, rather than being folded into `/delivery-areas`.                       |
| 18  | Bank transfer details are **not** exposed by that endpoint; they are placeholders and belong on the order confirmation.                       |

## The problem being solved

The cart lives only in `localStorage` (`src/context/cart-context.ts`, key
`efs_cart_v1`). There is no `carts` table — verified against the live database, where
`carts` and `cart_items` both return HTTP 404. So a customer who adds six items on
the web sees an empty cart on mobile.

There is also **no app-level API**: the only HTTP endpoint is
`src/app/api/auth/[...nextauth]/route.ts`. Everything else is a React Server
Component calling `lib/*.ts` in-process, or a Server Action — a React-specific RPC
mechanism a mobile app cannot call.

The encouraging part: **`src/lib/` is already a clean, framework-agnostic domain
layer.** This plan adds thin transports over it rather than reimplementing business
logic. That is the constraint most worth protecting: two copies of the checkout
rules will drift, and one of them will be wrong about money.

## Guiding constraints

| Constraint                                                | How it is honoured                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Server authoritative for user, price, availability, total | Routes resolve the profile server-side and read prices from the database. No route accepts a price. |
| Money is whole Naira integers                             | Reuses `lib/pricing.ts`. No float arithmetic introduced.                                            |
| No duplicated checkout rules                              | Routes call `lib/` only. `createOrderForProfile` is **not refactored**.                             |
| Cart stores only `variantId` + `quantity`                 | Enforced by the schema and the `cart_items` columns. Totals computed on every read.                 |
| RLS on, ownership checked server-side                     | New tables follow the existing pattern: RLS enabled, no client policies, service-role-only.         |
| Service-role key never leaves the server                  | Only `lib/db.ts` holds it, unchanged.                                                               |
| Web cookie session keeps working                          | `lib/api-auth.ts` accepts either credential.                                                        |
| `role` never in a token                                   | Token carries only a subject id; role re-read per request.                                          |
| No secrets in responses or logs                           | Typed error codes; internal detail goes to the server log only.                                     |

---

## Phase 0 — Documentation (complete)

The scope change is recorded in `AGENTS.md`, `PRD.md` and `TRD.md`:

- `AGENTS.md` §4 — "Database-persisted carts" removed from _out of scope_; cart and
  the `/api/v1` API added to _must implement_.
- `AGENTS.md` §5 — authentication rule rewritten: **Google is the sole trust anchor,
  the transport differs per client.**
- `AGENTS.md` §7 — `carts` and `cart_items` added to the table list.
- `AGENTS.md` §9 — cart rules rewritten for signed-out local / signed-in server, plus
  the merge rule and dead-line behaviour.
- `PRD.md` §5.4 — cart storage, merge and unavailable-variant requirements; API route
  table added.
- `TRD.md` §6.6/§6.7 — schema for `carts` and `cart_items`.
- `TRD.md` §8.1 — RLS statements for the new tables.
- `TRD.md` §13 — cart section rewritten: storage split, merge, dead lines.
- `TRD.md` §35 — new **Mobile API** section: routes, thin-route rule, auth,
  envelope, known gap.

---

## Phase 1 — Server cart, and the web app switched onto it

Independently shippable. After this phase the shared-cart requirement is already true
between two browser tabs; phase 3 only adds a second kind of client.

### 1.1 Migration — `supabase/migrations/0003_cart.sql`

```sql
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity integer not null check (quantity between 1 and 100),
  created_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create index cart_items_cart_id_idx on public.cart_items (cart_id);

alter table public.carts      enable row level security;
alter table public.cart_items enable row level security;
```

`variant_id` is **nullable with `ON DELETE SET NULL`**, matching `order_items`.

Rationale, since cascade was considered and rejected: when an admin deletes a variant
that a customer still holds, cascade would remove the line with no trace and the
customer's cart would silently shrink. Set null retains the line so the cart can
report `variant_missing` and the customer can be told why. This also keeps the
`issues` contract honest — under cascade that field could never fire.

Postgres treats `NULL`s as distinct in a unique constraint, so one cart may hold
several dead lines. That is accepted; no extra constraint is added to prevent it.

Two database functions, following the existing `create_order()` idiom:

- `public.set_cart_items(p_user_id uuid, p_items jsonb)` — **replace**. Creates the
  cart if absent, upserts each item, and **deletes dead lines**, because the client's
  list is the new truth.
- `public.merge_cart_items(p_user_id uuid, p_items jsonb)` — **additive**, with
  `quantity = least(existing + incoming, 100)`. **Leaves dead lines untouched.**

Incoming items always carry a real `variantId`. Rows whose `variant_id` is already
null are handled explicitly by the two functions above rather than by accident.
Both validate that `variantId` is a real uuid and `quantity` is an integer in range;
invalid rows are skipped rather than aborting the whole call, so one bad payload
cannot wedge a cart.

### 1.2 Files

| File                                                 | Change                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/0003_cart.sql`                  | new                                                                                                                                                                   |
| `src/lib/cart.ts`                                    | **new.** `readCartForProfile`, `replaceCartForProfile`, `mergeCartForProfile`. Resolves variants, computes the subtotal via `lib/pricing.ts`, returns items + issues. |
| `src/lib/api-response.ts`                            | **new.** `ok()` / `fail()` envelope helpers.                                                                                                                          |
| `src/lib/validation.ts`                              | add `cartPayloadSchema`; reuse `cartItemSchema` and `MAX_QUANTITY`                                                                                                    |
| `src/app/api/v1/cart/route.ts`                       | **new.** `GET` read, `PUT` replace                                                                                                                                    |
| `src/app/api/v1/cart/merge/route.ts`                 | **new.** `POST` additive merge                                                                                                                                        |
| `src/context/cart-context.ts`                        | rewire: `localStorage` when signed out, server when signed in, in-memory overlay                                                                                      |
| `src/components/cart-view.tsx`                       | render server items and `issues`                                                                                                                                      |
| `src/components/cart-link.tsx`                       | badge count from the active source                                                                                                                                    |
| `src/components/add-to-cart.tsx`, `product-card.tsx` | call the new mutations                                                                                                                                                |
| `src/app/checkout/actions.ts`                        | read the server cart; reject dead lines                                                                                                                               |

### 1.3 Merge rule (guest → server, on sign-in)

**Sum per `variantId`, capped at `MAX_QUANTITY` (100).**

Sum rather than "server wins" because the guest just chose those items; discarding
them is the surprising outcome.

**At most once, with no server-side idempotency state.** Sign-in can fire twice
(React strict mode, a retry), and a naive sum would double the quantities:

```
1. snapshot localStorage into memory
2. clear localStorage immediately      <- a second invocation sees an empty cart
3. POST /api/v1/cart/merge
4. on failure, write the snapshot back
```

Clearing _before_ awaiting makes a double-merge structurally impossible, and the
restore path means a network failure never loses a basket.

### 1.4 In-memory overlay (approved)

For signed-in users, a mutation is applied to an in-memory overlay immediately, then
replaced by the server response. **Not** persisted to `localStorage`.

This keeps the only benefit that matters — the UI never feels slow — and removes the
staleness bug class: no cache to reconcile, no version skew between devices, no "why
does the badge disagree with the server". A persistent client cache for signed-in
users would be a second source of truth, which is exactly what this phase removes.

### 1.5 Checkout and dead lines

Checkout reads the server cart. If it still contains a dead line, checkout **fails**
with a clear message rather than silently dropping it or, worse, creating an order
item from a null variant. This same rule applies to the phase 4 order endpoint.

### 1.6 Verification (against the real database)

1. `npx supabase db push --linked --dry-run`, then push; confirm with
   `npx supabase migration list --linked` that `0003` is local **and** remote.
2. `npm run check` && `npm run build`.
3. **Read** — with a session cookie, `GET /api/v1/cart` returns an empty cart with
   `subtotal: 0`; `PUT` two items; `GET` returns them with server-computed
   `lineTotal` and `subtotal` equal to `price x quantity` read back from the DB.
4. **Tamper** — `PUT` a body containing `unitPrice: 1`. Expect it stripped or
   rejected, and the read-back subtotal unchanged.
5. **Bounds** — `quantity: 101` rejected; `quantity: 0` rejected.
6. **Unknown variant** — a random uuid is rejected or reported as an issue, never
   silently stored.
7. **Merge idempotency** — call `merge` twice with the same items; quantities equal a
   single merge, not double.
8. **Merge cap** — merge an item already at 100; result stays 100.
9. **Ownership** — user A cannot read or write user B's cart.
10. **Dead line** — delete a variant that sits in a test cart, then confirm
    `GET` returns `variant_missing` with a line id, `itemCount` and `subtotal`
    exclude it, `PUT` clears it, and checkout is unaffected.
11. **Cash flow** — place a real order through web checkout end-to-end, confirm the
    order and its items in the DB, and confirm the cart empties afterwards.
12. **Cleanup** — delete all `cart_items` and `carts` rows, any test variant, and any
    test orders. Confirm counts are zero.

### 1.7 Risks

- **Checkout regression is the real danger** — it is the revenue path. Mitigated by
  step 11, an end-to-end order, not just a passing build.
- **Last-write-wins across devices** — a phone and a laptop can overwrite each other.
  Accepted for MVP. Solving it needs row versions or per-line merges, heavier than
  the requirement justifies.
- **Nullable `variant_id` widens the read path** — cart reads must tolerate a null
  variant. Handled in `lib/cart.ts` and covered by step 10.
- **Merge is not atomic against a concurrent merge** from another device. Low impact
  at MVP scale.

---

## Phase 2 - Public catalog endpoints (complete)

Read-only, no auth, no new tables.

| File                                      | Change                                   |
| ----------------------------------------- | ---------------------------------------- |
| `src/app/api/v1/products/route.ts`        | **new.** `GET`, optional `?category=`    |
| `src/app/api/v1/products/[slug]/route.ts` | **new.** `GET` one product with variants |

Both delegate to the existing `lib/products.ts`. No new query logic.

Verification: `npm run check` && `npm run build`; `/api/v1/products` returns the same
count and slugs as `/shop`; a slug matches `/shop/[slug]`; the category filter
matches the filtered page; an unknown slug returns `404 NOT_FOUND`; no secret, key or
internal id leaks. No writes, so nothing to clean up.

Risk: low. The catalog is already public on the web. The only real risk is
accidentally widening a query, mitigated by delegating to `lib/products.ts`.

---

## Phase 3 - Bearer-token authentication (complete)

Independently shippable. This is the phase that makes the API usable by a
non-browser client at all.

### 3.1 Design — short-lived token, no refresh token

**The app sends a Google ID token; the server verifies it, resolves the profile by
`profiles.google_sub`, and returns a 1-hour bearer token.**

- **Verify** the Google ID token with `jose` against Google's JWKS
  (`https://www.googleapis.com/oauth2/v3/certs`): RS256, `aud` must be one of the
  configured client ids, `iss` must be `accounts.google.com` (or
  `https://accounts.google.com`), `exp` honoured with a small leeway for clock skew,
  `email_verified === true`.
- **Resolve** the profile with the existing `upsertProfileFromGoogle({ googleSub,
email, fullName })`, which already creates new users as `customer` and never writes
  `role`.
- **Mint** our own token, HS256, signed with the **dedicated `API_TOKEN_SECRET`**.

`AUTH_SECRET` is deliberately **not** reused. Separate secrets mean compromising one
does not compromise the other: a stolen Auth.js cookie secret cannot be used to mint
API tokens, and an API token leak does not touch the web session.

Token payload is exactly:

```json
{ "sub": "<profiles.id>", "iss": "...", "aud": "...", "iat": ..., "exp": ... }
```

**No role, no email, no name.** `iss` and `aud` are both **verified on use**, so a
token minted for one purpose cannot be presented for another. Role is re-read from
the database on every request that needs it.

**Why no refresh token:** the app can always obtain a fresh Google ID token (the
native SDK refreshes silently), so the access token is re-minted on demand. That
removes the whole refresh-token apparatus — no sessions table, no rotation, no
revocation list, no extra secret — while giving revocation-by-expiry at a one-hour
worst case. Simpler _and_ safer than a conventional long-lived stateless token.

**Simpler-but-weaker alternative**, if the app should handle no expiry at all: a
single 30-day stateless token, never re-minted. Zero client expiry logic, but a leaked
token is valid for a month and cannot be revoked. Not recommended.

### 3.2 Files

| File                                 | Change                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                       | add `jose` as a **direct** dependency (currently only transitive via `next-auth`)                                                                                                                        |
| `src/lib/api-auth.ts`                | **new.** `requireApiProfile(request)` — bearer token first, then web session; returns a `Profile`; throws a typed `ApiError`                                                                             |
| `src/lib/api-token.ts`               | **new.** sign and verify HS256 tokens, `iss`/`aud` enforced                                                                                                                                              |
| `src/lib/google-token.ts`            | **new.** Google JWKS verification, cached                                                                                                                                                                |
| `src/lib/profiles.ts`                | add `getProfileByGoogleSub(googleSub)` — **does not exist today**                                                                                                                                        |
| `src/lib/env.ts`                     | add `getApiAuthEnv()` (`API_TOKEN_SECRET`, `API_TOKEN_ISSUER`, `API_TOKEN_AUDIENCE`) and `getMobileAuthEnv()` (**comma-separated** allowed client ids). Both lazily validated like the existing getters. |
| `src/app/api/v1/auth/token/route.ts` | **new.** `POST`                                                                                                                                                                                          |
| `.env.example`                       | document the new variables with placeholders                                                                                                                                                             |

An unconfigured `API_TOKEN_SECRET` must never block browsing, the web cart or web
checkout, so `getApiAuthEnv()` follows the existing lazy-validation pattern.

### 3.2a Environment variables

| Variable                  | Required | Purpose                                                                                       |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `API_TOKEN_SECRET`        | **yes**  | Signs our bearer tokens. At least 32 characters. Must **not** equal `AUTH_SECRET`.            |
| `API_TOKEN_ISSUER`        | no       | Who our tokens are issued by. Defaults to `NEXT_PUBLIC_SITE_URL`.                             |
| `API_TOKEN_AUDIENCE`      | no       | What our tokens are for. Defaults to `elite-foods-api`.                                       |
| `GOOGLE_EXTRA_CLIENT_IDS` | no       | Comma-separated extra Google client ids (Android/iOS). `GOOGLE_CLIENT_ID` is always accepted. |

Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Because the issuer defaults to the site URL, a token minted in development is
refused in production and vice versa, with no extra configuration.

### 3.2b What a bearer token does and does not grant

A bearer token authenticates **`/api/v1/*` routes only**. It does **not**
authenticate a Next.js page, so presenting one to `/admin` or `/orders` is
equivalent to being signed out and redirects to sign-in.

That is deliberate: it means a leaked API token cannot be used to browse the web
application. The mobile app never renders these pages, so it loses nothing.

### 3.3 Request handling rules

- **No middleware intercepts `/api/v1`.** Verified: there is no `src/middleware.ts`
  and `next.config.ts` contains only `typedRoutes`. Public catalog routes therefore
  stay public automatically.
- **Route handlers must never call `redirect()`.** Every protected _page_ guards with
  `redirect("/login?callbackUrl=...")`; copying that into a route handler would
  answer an API client with a 307 and an HTML login page. Routes guard with
  `requireApiProfile()` and return the JSON envelope with `401 UNAUTHENTICATED`.
- **Every response uses the §35.6 envelope**, including unexpected exceptions.
  Handlers are wrapped so a bug returns `INTERNAL` rather than an HTML error page or
  a stack trace.
- **The token route fails fast.** An invalid Google ID token is rejected after a
  signature check and **before any database access**, so a forged token costs nothing.
  There is no application rate limiter; this is relied on together with Vercel's
  platform limits.

### 3.4 Verification — negative tests are mandatory

1. `npm run check` && `npm run build`.
2. **Tampered signature** — flip one character; expect `401`.
3. **`alg: none`** — expect `401`.
4. **Expired** — `exp` in the past; expect `401`.
5. **Wrong audience** — signed with an `aud` not in the allowed list; expect `401`.
6. **Wrong issuer** — expect `401`.
7. **Real Google ID token** from a live sign-in; expect `200`, and confirm `sub`
   resolves to the **same `profiles.id`** as the web session for the same Google
   account. This is the single most important assertion in the plan: it proves web and
   mobile are the same user.
8. **Token contents** — decode and assert only `sub`, `iss`, `aud`, `iat`, `exp`.
   No role, no email.
9. **Both credentials** — call a protected route with a bearer token and with the web
   session cookie; identical results.
10. **Web regression** — `/api/auth/[...nextauth]` sign-in, `/orders`, `/admin` and
    web checkout all still work unchanged.
11. Confirm `API_TOKEN_SECRET` and the service-role key appear in **no** response.
12. Cleanup any profile created in step 7 if it was a throwaway account.

### 3.5 Risks

- **Google token verification is the sharp edge.** A mistake here is an auth bypass.
  The strict `alg`/`aud`/`iss`/`exp` checks and the negative tests above are
  mandatory, not optional.
- **JWKS caching** — cache with a TTL and refetch on an unknown `kid`, or key
  rotation causes outages or silent failures.
- **Clock skew** across devices could reject a valid token; a small leeway is applied.
- **`jose` must be a direct dependency.** Relying on a transitive one is fragile.

### 3.6 Verified end to end

Confirmed against the live project with a **real Google ID token** for
`jubriltayo@gmail.com` (an `admin`), exchanged on the running dev server:

1. `POST /api/v1/auth/token` returns `200` with the success envelope,
   `tokenType: "Bearer"`, `expiresIn: 3600`.
2. The returned `profile.id` equals the `profiles.id` that already owned
   `google_sub = 103514541681208107152` — **the same row the web session resolves
   to**. The profile count was unchanged before and after, so no duplicate was
   created. This is the assertion that proves a mobile customer and a web customer
   are the same customer.
3. The issued token's payload is exactly `aud, exp, iat, iss, sub`. `sub` is that
   profile id and the lifetime is one hour.
4. The bearer token works on `GET /api/v1/cart` and returns a **byte-identical**
   body to the session cookie, both for an empty cart and for a seeded one.
5. The account is `admin` in the database and the response says so, but the token
   carries no `role`, `email`, `name` or `google_sub` claim. Presenting the token to
   a page (`/admin`) does not authenticate it either, because bearer tokens are API
   credentials only.

The token file used for this check was deleted afterwards, and no JWT material was
left in the repository.

> **A note for whoever runs this next.** Do not hand-copy a JWT out of a browser
> into a file. A single dropped character in the base64 payload silently corrupts it:
> the decoded JSON stops parsing, and the decoded `sub` can come out one character
> longer than the real value, which looks like a database discrepancy and is not
> one. Write the token to a file directly and assert the file's shape (three
> segments, valid base64url, payload parses, `aud`/`iss` correct) before sending it
> anywhere. Such a token must be rejected with `401`, and a test harness must never
> mint a session cookie from an undefined profile id, because Auth.js will
> cheerfully create a duplicate account for it.

---

## Phase 4 — Order endpoints (complete)

`GET /api/v1/orders`, `POST /api/v1/orders` and `GET /api/v1/orders/[id]` are built,
without which the mobile app could not buy or show order history.

| File                                  | Change                                              |
| ------------------------------------- | --------------------------------------------------- |
| `src/lib/checkout.ts`                 | **new.** The shared order-placement path            |
| `src/app/api/v1/orders/route.ts`      | **new.** `POST` place an order, `GET` order history |
| `src/app/api/v1/orders/[id]/route.ts` | **new.** `GET` one order, ownership-checked         |
| `src/lib/api-orders.ts`               | **new.** Maps stored orders onto the wire shapes    |
| `src/app/checkout/actions.ts`         | Reduced to a transport that delegates               |

### 6.1 One implementation of the checkout rules

Before any route was added, the order-placement logic moved out of the web Server
Action into `lib/checkout.ts` as `placeOrderForProfile`. Both transports call it, so
there is no second copy of the rules to drift out of agreement about money. The Action
keeps only what is specific to being a form: resolving the session and issuing the
signed-out `redirect()`, which an API route must never do.

`placeOrderForProfile` owns, once: the basket comes from the server cart and never
from the request; a dead or unavailable line blocks the order rather than being
silently dropped; pricing and the total are decided from the database; the cart is
cleared **only after** the order is durable; the confirmation email is best-effort; and
a retried idempotency key returns the original order.

Its parameter type is `Omit<CheckoutInput, "items">`. A transport therefore
**physically cannot** hand it a basket, which turns "the cart is the only source of
truth" from a convention into a compile error. `createOrderForProfile` is not modified.

### 6.2 Required: parse through `checkoutSchema`

This is not optional and is the easiest thing to get wrong.

`createOrderForProfile` **trusts its input**. It does not re-validate and does not
normalize. The Zod schema is the only place normalization happens, so a route that
builds the input object by hand will store whatever the client sent, unvalidated.

The route therefore:

1. Builds a plain object from the request body.
2. `checkoutSchema.safeParse` it.
3. On failure returns the `VALIDATION_ERROR` envelope with per-field messages.
4. Passes `parsed.data` — never the raw body — to `placeOrderForProfile`.

This is what carries the **phone normalization**: `checkoutSchema` accepts
`+2348030511967`, `2348030511967` and spaced or hyphenated variants and stores
`08030511967` (`phoneSchema` in `lib/validation.ts`). Skipping the schema would
persist `"+234 803 051 1967"` verbatim into `orders.customer_phone`, which is the
exact bug found during phase 1 manual testing. Verified over HTTP: `"+234 803 051 1967"`
was stored as `"08030511967"`.

Two things the schema deliberately strips, because they are absent from the parsed
output and must never reach order creation from a route: any client-supplied `email`
(the address comes from the profile) and any client-supplied price, subtotal, total,
role or user id.

### 6.3 Verified against the real database

Over real HTTP on the running app, with genuine bearer tokens and a genuine Auth.js
encrypted session cookie, 67 assertions across two runs. Every test row, cart and
temporary variant was deleted afterwards; the database is back to 6 orders and 0 carts.

| #   | Check                                                        | Result                                          |
| --- | ------------------------------------------------------------ | ----------------------------------------------- |
| 1   | Unauthenticated `GET`/`POST`                                 | `401` in the envelope, never a redirect         |
| 2   | `GET /orders` newest first, caller's only, whole-Naira money | pass                                            |
| 3   | `GET /orders/[id]` line items carry the snapshot             | pass                                            |
| 4   | Cross-account read                                           | `404`, not `403`                                |
| 5   | Malformed id / unknown uuid                                  | `404`                                           |
| 6   | Empty cart                                                   | `400`, no order                                 |
| 7   | Request submitting `quantity: 99` against a cart of 2        | stored 2                                        |
| 8   | `+234` phone                                                 | stored `08030511967`                            |
| 9   | Cart emptied after success, intact after every failure       | pass                                            |
| 10  | Bank transfer                                                | `payment_status = 'unpaid'` in the database     |
| 11  | Idempotent replay                                            | same id and totals, one row, new cart untouched |
| 12  | Header key beats body key                                    | pass                                            |
| 13  | Malformed key                                                | `400`, cart survived                            |
| 14  | Unavailable product                                          | `400`, no order, line kept as an issue          |
| 15  | Dead line (variant deleted)                                  | `400`, no order, cleared by `PUT /cart`         |
| 16  | Bearer **and** cookie both authenticate                      | pass                                            |
| 17  | Modified / unsigned cookie                                   | `401`                                           |
| 18  | Real Mailgun 403 on an unauthorised recipient                | order still `200`, durable, `emailSent: false`  |
| 19  | Email module stubbed to throw                                | no throw, order durable, cart cleared           |
| 20  | Secrets, `google_sub`, internal join ids, profile id         | absent from every response                      |

Check 18 is worth noting: the configured Mailgun account is a **free sandbox**, which
only delivers to authorised recipients. Ordering as `jubriltech7@gmail.com` produces a
real `403` from Mailgun — so the mail-failure guarantee was proved through the entire
HTTP stack rather than only simulated.

Check 19 used the same order-placement path with the email module stubbed, confirming
the failure is swallowed rather than merely absent in that one case.

The web checkout page, form and confirmation still render, and the extraction was
checked to be non-regressive: a request submitting `quantity: 99` against a cart of 1
stores 1, and all five customer-facing failure messages are byte-identical to before.

The Server Action itself is not driven directly by an automated test. It is a
transport whose logic lives in `lib/checkout.ts`, which is covered above; the Action's
own contribution is covered by typecheck, build and an unchanged exported result
shape. Driving a `useActionState` action over HTTP requires React's internal action
encoding, which is not a stable interface to assert against.

Risks: double submission from a mobile retry, mitigated by the existing
`idempotencyKey` unique constraint; and clearing the cart before the order is durable,
which would lose the basket on failure. The ordering of those two operations is the
whole risk here.

---

## API contract

Base URL `/api/v1`. JSON in and out. Authenticated routes accept **either**
`Authorization: Bearer <token>` or the existing web session cookie — the same route,
no separate mobile variant.

### Envelope

Success:

```json
{ "data": { "...": "..." }, "error": null }
```

Failure:

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable, safe to show a user",
    "fields": { "items[0].quantity": "Quantity must be at most 100" }
  }
}
```

`fields` is present only for `VALIDATION_ERROR`. Internal detail, stack traces and
driver messages go to the server log and are never returned.

| Code               | HTTP | Meaning                                         |
| ------------------ | ---- | ----------------------------------------------- |
| `UNAUTHENTICATED`  | 401  | Missing, malformed or expired credential        |
| `FORBIDDEN`        | 403  | Authenticated but not permitted                 |
| `NOT_FOUND`        | 404  | Absent, **or owned by someone else**            |
| `VALIDATION_ERROR` | 400  | Zod rejected the input                          |
| `CONFLICT`         | 409  | Duplicate idempotency key with a different body |
| `RATE_LIMITED`     | 429  | Too many requests                               |
| `INTERNAL`         | 500  | Unexpected; logged, not described               |

`404` rather than `403` for another customer's order is deliberate: a `403` would
confirm the row exists.

### Endpoints

| Method | Path                      | Auth                           | Purpose                                       |
| ------ | ------------------------- | ------------------------------ | --------------------------------------------- |
| `POST` | `/api/v1/auth/token`      | none (Google ID token in body) | Exchange a Google ID token for a bearer token |
| `GET`  | `/api/v1/delivery-areas`  | none                           | Delivery areas and their fees                 |
| `GET`  | `/api/v1/payment-methods` | none                           | Valid payment methods and their labels        |
| `GET`  | `/api/v1/products`        | none                           | List products                                 |
| `GET`  | `/api/v1/products/[slug]` | none                           | One product with variants                     |
| `GET`  | `/api/v1/cart`            | required                       | Read the caller's cart, priced server-side    |
| `PUT`  | `/api/v1/cart`            | required                       | Replace the cart                              |
| `POST` | `/api/v1/cart/merge`      | required                       | Additive merge (device → server)              |
| `POST` | `/api/v1/orders`          | required                       | Place an order from the cart                  |
| `GET`  | `/api/v1/orders`          | required                       | The caller's order history                    |
| `GET`  | `/api/v1/orders/[id]`     | required                       | One order, ownership-checked                  |

`required` means either credential: an `Authorization: Bearer <token>` header, or the
Auth.js session cookie the browser already carries.

#### `GET /api/v1/delivery-areas`

Public. Added in phase 4 because `POST /api/v1/orders` requires a `deliveryArea` that
is validated against `DELIVERY_AREA_IDS`, and the contract never said where the valid
values came from or what they cost. Without it a client would hardcode `"abeokuta"`
and could not show a delivery charge before the customer orders.

```json
{
  "data": {
    "areas": [{ "id": "abeokuta", "label": "Abeokuta", "fee": 1000 }]
  },
  "error": null
}
```

`id` is the value to send as `deliveryArea`. `fee` is a whole Naira integer and is the
figure checkout actually charges: the route prices through the same `deliveryFeeFor`
the checkout form uses, so the two cannot drift. Verified by feeding every returned
id through the real `checkoutSchema` and comparing the fee to `deliveryFeeFor`.

#### `GET /api/v1/payment-methods`

Public, and the sibling of `/delivery-areas` for the same reason: `POST /api/v1/orders`
validates `paymentMethod` against `PAYMENT_METHODS`, and the contract only ever showed
`"pay_on_delivery"` inside a sample body. A client would have hardcoded the strings and
would have discovered a change only by receiving a `400`.

```json
{
  "data": {
    "paymentMethods": [
      { "id": "pay_on_delivery", "label": "Pay on delivery" },
      { "id": "bank_transfer", "label": "Bank transfer" }
    ]
  },
  "error": null
}
```

`id` is the value to send as `paymentMethod`. `label` comes from `paymentMethodLabel`,
the same function every display surface uses, so the app's button text and this
endpoint cannot disagree. The list is in the enum's declared order.

Both methods leave the order `unpaid`; bank transfer shows the banking details on the
confirmation, and there is no automatic reconciliation.

**The bank transfer account details are deliberately not exposed here.** They are
placeholder values in `config/business.ts` pending the shop's real banking information
(AGENTS.md section 27), and publishing placeholders as though they were real would be
worse than publishing nothing. A client renders the choice from this endpoint and shows
the details on the order confirmation, where the server supplies them once the order
exists.

Verified, 26 assertions: no credential required; every returned id is accepted by the
real `checkoutSchema` and is a known payment method; the ids equal `PAYMENT_METHODS` in
the same order; every label matches `paymentMethodLabel` and labels are distinct; each
entry has exactly `id` and `label`; the account number, bank name, any 10-digit
sequence, any email address and any secret name are absent from the response; the route
reads neither the database, nor authentication, nor `BANK_TRANSFER.accountNumber`; and
`/delivery-areas` still works.

#### `POST /api/v1/auth/token`

```json
{ "idToken": "<google id token>" }
```

```json
{
  "data": {
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "profile": {
      "id": "uuid",
      "email": "...",
      "fullName": "...",
      "role": "customer"
    }
  },
  "error": null
}
```

`role` is in the **response** for display convenience only. It is never in the token and
never trusted for authorization: `requireApiProfile` re-reads the profile row on every
request.

`expiresIn` is 3600 seconds. The token payload is **exactly five claims** and nothing
else: `sub`, `iat`, `exp`, `iss`, `aud`. `sub` is the `profiles.id`. There is no `role`,
no `email` and no `name`, and verification refuses any token carrying an extra claim,
so a role cannot be smuggled in even if one were somehow forged.

**When `expiresIn` elapses, call this endpoint again with a fresh Google ID token.**
There is no refresh token and no session table. Get the new ID token from the native
SDK's silent sign-in, then repeat this call.

Do not retry a `401` from this endpoint in a tight loop: it means the Google token was
not acceptable.

#### `GET /api/v1/products`

Query: `?category=<id>` optional, one of `fried-snacks`, `nuts-and-grains`,
`drinks`.

An unrecognised `category` is **rejected with `400 VALIDATION_ERROR`**, not ignored.
Silently returning the whole catalog for a typo would be a subtle bug for a client
that believes it asked for one category.

```json
{
  "data": {
    "products": [
      {
        "slug": "dodo-ikire",
        "name": "Dodo Ikire",
        "description": "...",
        "category": "fried-snacks",
        "isAvailable": true,
        "startingPrice": 300,
        "imageUrl": null,
        "variants": [{ "id": "uuid", "label": "Small", "price": 300 }]
      }
    ]
  },
  "error": null
}
```

The product's own `uuid` is **not** exposed: nothing a client does needs it, and the
slug already identifies the product. **Variant ids are exposed**, because a cart
line is keyed by variant id.

`imageUrl` is `null` until the shop has real photography. Do not substitute the
web's placeholder illustrations in `public/products`; those are web-local assets a
mobile app cannot load. Use your own placeholder.

#### `GET /api/v1/products/[slug]`

Same object shape, single product, so a detail response is byte-identical to that
product's entry in the list. Unknown slug → `404 NOT_FOUND`.

A slug containing SQL-injection-shaped text may be blocked by the database host's
WAF before the query runs, and then returns `500 INTERNAL`. That is expected, still
arrives as a clean JSON envelope, and should not be retried in a loop.

#### `GET /api/v1/cart`

```json
{
  "data": {
    "items": [
      {
        "lineId": "uuid",
        "variantId": "uuid",
        "quantity": 2,
        "product": {
          "slug": "dodo-ikire",
          "name": "Dodo Ikire",
          "isAvailable": true,
          "imageUrl": null
        },
        "variant": { "label": "50g", "price": 300 },
        "lineTotal": 600
      }
    ],
    "issues": [
      { "lineId": "uuid", "variantId": null, "reason": "variant_missing" }
    ],
    "subtotal": 600,
    "itemCount": 2
  },
  "error": null
}
```

The `items` array above holds a single line of quantity 2, so `itemCount` is 2 and
`subtotal` is 600. The `issues` entry describes a second, dead line that contributes
to neither.

- `imageUrl` is resolved server-side so a client can render a line **without also
  fetching the catalog** to look the product up by slug. It is `null` while the shop
  has no real photography, in which case the client supplies its own placeholder.
  Do not point it at the web's placeholder illustrations in `public/products`:
  those are web-local assets a mobile app cannot load.
- `lineId` is stable for the lifetime of the line and is what the client uses to
  identify a dead line.
- Dead lines appear **only** in `issues`, never in `items`.
- `reason` is one of `variant_missing`, `product_missing`, `unavailable`,
  `quantity_capped`.
- `itemCount` is the **total number of units** across orderable lines, not the
  number of lines. This is what a cart badge shows: two lines of quantity 2 and 3
  give `itemCount: 5`.
- `subtotal` and `itemCount` **exclude** dead lines and unavailable items.
- `subtotal` excludes delivery, which is not known until an area is chosen.

**No price is ever accepted from the client.** `PUT` bodies containing `unitPrice`,
`price` or `total` have those keys stripped by the Zod schema.

#### `PUT /api/v1/cart` — replace

```json
{ "items": [{ "variantId": "uuid", "quantity": 2 }] }
```

Returns the same shape as `GET`. Empty `items` is valid and clears the cart.
`quantity` must be an integer in `1..100`.

**Replace also clears dead lines.** The submitted list is the new truth, so any line
not in it is removed — including a line whose variant has been deleted. There is
therefore no separate endpoint for removing a dead line; resubmitting the current
list is enough.

#### `POST /api/v1/cart/merge` — additive

```json
{ "items": [{ "variantId": "uuid", "quantity": 2 }] }
```

Quantities are **summed** per `variantId` and capped at 100. Items not listed are
left untouched, **including dead lines**. Returns the same shape as `GET`.

#### `POST /api/v1/orders`

```json
{
  "customerName": "...",
  "customerPhone": "08012345678",
  "deliveryArea": "abeokuta",
  "deliveryAddress": "...",
  "note": "optional",
  "paymentMethod": "pay_on_delivery",
  "idempotencyKey": "uuid, optional but recommended"
}
```

Note what is **absent**: no `email` (taken from the profile), no `items`, no prices,
no totals, no status. `paymentMethod` is validated against the shared enum in
`lib/validation.ts`.

`items` is not merely ignored — it is removed from the schema, so a client that sends
it anyway has it stripped rather than honoured. The only basket is the saved cart.

`customerPhone` is normalized by the schema, so `"+234 803 051 1967"` is stored as
`"08030511967"`. Sending an unnormalized phone number does not corrupt the order.

**Idempotency.** The key is read from an `Idempotency-Key` header, falling back to the
`idempotencyKey` body field; the header wins when both are present.

```json
{
  "data": {
    "id": "uuid",
    "orderNumber": "EFS-000013",
    "status": "pending",
    "subtotal": 600,
    "deliveryFee": 1000,
    "total": 1600,
    "paymentMethod": "pay_on_delivery",
    "paymentStatus": "unpaid",
    "createdAt": "2026-10-04T12:00:00Z",
    "emailSent": true,
    "idempotentReplay": false
  },
  "error": null
}
```

The id is the order's uuid and is what `GET /api/v1/orders/[id]` takes. Unlike a
product's uuid it is exposed, because an order has no slug.

`emailSent` reports whether Mailgun accepted the confirmation. **It never affects the
order**: the order exists and is authoritative either way, and a `false` here is not
an error. See "Mailgun failure" under known gaps.

`idempotentReplay` is `true` when the key matched an order that already existed, in
which case this call created nothing, cleared no cart and sent no second email.

**Repeating a key with a different body returns the original order and ignores the
new body.** The key, not the body, is the retry boundary. A client must therefore mint
a **fresh key per distinct order attempt** — reusing one for a genuinely new order
returns the older order. Detecting a mismatched body would mean hashing the payload
and storing it beside the order, which this design does not do.

The retry is answered **before the cart is read**. The first attempt empties the cart
and order creation rejects an empty item list, so consulting the cart first would
answer every retry with "Your cart is empty" instead of returning the order that was
already created.

#### `GET /api/v1/orders`

The caller's orders, newest first. Ownership is enforced in the SQL `WHERE` clause, so
another customer's order is never loaded into the process.

```json
{
  "data": {
    "orders": [
      {
        "id": "uuid",
        "orderNumber": "EFS-000013",
        "status": "pending",
        "subtotal": 600,
        "deliveryFee": 1000,
        "total": 1600,
        "paymentMethod": "pay_on_delivery",
        "paymentStatus": "unpaid",
        "createdAt": "2026-10-04T12:00:00Z",
        "itemCount": 2
      }
    ]
  },
  "error": null
}
```

`itemCount` is the total number of units across the order's lines. The stored `email`
column is not returned: it is the caller's own address and the app already knows it.

#### `GET /api/v1/orders/[id]`

One order with its line items. Another customer's order, a malformed id and an id that
does not exist are **all** `404 NOT_FOUND`. Never `403`: a 403 would confirm the id is
real and turn this endpoint into a probe for other customers' orders.

```json
{
  "data": {
    "id": "uuid",
    "orderNumber": "EFS-000013",
    "status": "pending",
    "subtotal": 600,
    "deliveryFee": 1000,
    "total": 1600,
    "paymentMethod": "pay_on_delivery",
    "paymentStatus": "unpaid",
    "createdAt": "2026-10-04T12:00:00Z",
    "itemCount": 2,
    "customerName": "...",
    "customerPhone": "08030511967",
    "deliveryArea": "abeokuta",
    "deliveryAddress": "...",
    "note": null,
    "items": [
      {
        "variantId": "uuid or null",
        "productName": "Dodo Ikire",
        "variantLabel": "50g",
        "unitPrice": 300,
        "quantity": 2,
        "lineTotal": 600
      }
    ]
  },
  "error": null
}
```

The item fields are **historical snapshots** taken at checkout, so a later rename or
reprice cannot rewrite what an order says. `variantId` is `null` when the variant was
deleted after the order was placed; the snapshot still stands.

---

## Execution order

Each slice ends with `npm run check` and `npm run build` passing, plus the
phase-specific verification, plus cleanup of any test data.

| #   | Slice                                            | Shippable outcome                                       |
| --- | ------------------------------------------------ | ------------------------------------------------------- |
| 0   | `AGENTS.md`, `PRD.md`, `TRD.md`, this plan       | Scope change recorded; docs stop contradicting the code |
| 1a  | `0003_cart.sql` migration                        | Tables exist, RLS on                                    |
| 1b  | `lib/cart.ts` + `api-response.ts` + validation   | Server cart logic                                       |
| 1c  | `/api/v1/cart` routes                            | Cart over HTTP                                          |
| 1d  | Rewire `cart-context.ts` and consumers           | **Shared-cart requirement is true**                     |
| 2   | Catalog endpoints                                | Mobile can browse                                       |
| 3a  | `jose`, env, `getProfileByGoogleSub`             | Foundations                                             |
| 3b  | `api-auth.ts`, `api-token.ts`, `google-token.ts` | Credential handling                                     |
| 3c  | `/api/v1/auth/token` route                       | **Mobile can authenticate as the same user**            |
| 4a  | Extract `lib/checkout.ts` from the Server Action | One implementation of the checkout rules                |
| 4b  | Order endpoints                                  | Mobile can buy and see history                          |
| 4c  | `/api/v1/delivery-areas`                         | Mobile can show a total before ordering                 |
| 4d  | `/api/v1/payment-methods`                        | Mobile can render the payment choice from the server    |

**All slices are complete.** The whole customer journey is now reachable from a mobile
client: browse, sign in as the same customer, share the cart, buy, and read history.

Slices 1b, 3b and 4a contain the logic worth reviewing most carefully — they are the
places where a mistake is a security or money bug rather than a visual one.

## Known gaps

- **No application-level rate limiter.** `POST /api/v1/auth/token` is unauthenticated
  by definition and relies on Vercel's platform limits. It fails fast: an invalid
  Google token is rejected after a signature check and **before any database access**,
  verified by asserting that a run of rejected tokens creates no `profiles` rows. A
  per-IP limiter would be the fix if this endpoint is ever abused.
- **No token revocation.** Tokens are stateless and cannot be withdrawn before they
  expire, so a leaked token is valid for up to one hour. Signing out of the mobile app
  discards the token locally but does not invalidate it server-side. Adding
  revocation would mean a session table or a deny-list, which is the machinery this
  design deliberately avoids. The one-hour TTL bounds it.
- **Last-write-wins on the cart** across devices. Accepted for MVP.
- **Merge is not atomic** against a concurrent merge from another device.
- **Several dead lines** can exist in one cart, because `NULL`s are distinct in the
  unique constraint. Intended.
- **Bank transfer details are placeholders** in `config/business.ts`. They are marked as
  such in the source, shown on the order confirmation, and deliberately not exposed by
  `/api/v1/payment-methods`. They must be replaced with the shop's real banking
  information before a bank-transfer order can be fulfilled.
- **Mailgun is a free sandbox account.** It only delivers to authorised recipients and
  returns `403` for anyone else. The order is unaffected — that is the point, and it is
  now verified — but before a real launch the account needs a paid plan or a verified
  sending domain, or no customer will receive a confirmation.

## Explicitly not doing

- No mobile screens, components or navigation — that is the other repository.
- No `/api/v1/admin/*`. Mobile is customer-only.
- No online payments. Pay on Delivery and Bank Transfer only.
- No automatic bank-transfer reconciliation.
- No product search, reviews, wishlists, coupons or loyalty.
- No inventory quantity tracking. Stock is a boolean `is_available`.
- No Supabase Storage or image upload.
- No guest checkout. A cart may be built while signed out, but placing an order
  requires an account.
- No delivery tracking, driver management or distance-based pricing.
- No second copy of pricing, validation or ownership logic in any route.
