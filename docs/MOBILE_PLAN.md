# Elite Foods Mobile — build plan

Client of the API described in `docs/API_CONTRACT.md`. No backend work here. The
server is authoritative for identity, cart, prices and orders.

Status: **approved 2026-10-04.** Phase 1 in progress.

Decisions of record (approved by the user):

| # | Decision |
| --- | --- |
| 1 | Android package name is **`com.elitefoods.mobile`**. Fixed; it is the `android.package` and must match the Google OAuth client exactly. |
| 2 | **Guest cart is out of scope.** The cart requires sign-in. Follow `AGENTS.md`, not the contract's "a cart may be built while signed out" line. |
| 3 | `409 CONFLICT` is **treated as a replay** of the original order, not as an error to surface. |
| 4 | There is **no `GET /me`**. The display name and email from the last `/auth/token` response are cached in `expo-secure-store` alongside the token. Never `AsyncStorage`, never logged. |
| 5 | **Bank transfer details and a categories endpoint are being added server-side.** Neither is hard-coded. Categories are read from `GET /api/v1/categories` when available; the filter row is simply absent when the endpoint 404s. |
| 6 | The **EAS keystore SHA-1** is the signing fingerprint, not the local debug keystore, because the development build is signed by EAS. |
| 7 | The **no-Firebase path** is preferred for Google sign-in. Only add the Android client id to `GOOGLE_EXTRA_CLIENT_IDS` if a wrong-`aud` error actually occurs. |

## Guiding decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Navigation | `expo-router` | Already mandated by `AGENTS.md`; file-based routes, typed paths. |
| State | React state + one `SessionProvider` + one `CartProvider` | No Redux. The cart is server state; the only local state is "which item ids I just changed". |
| Networking | one `src/lib/api.ts` wrapping `fetch` | All envelope and error-code handling lives here, per hard rule 6. |
| Token storage | `expo-secure-store` only | Hard rule 4. |
| Placeholder image | one local PNG in `assets/` | `imageUrl` is `null` (rule 10). |
| Money | integer Naira, `formatNaira()` display-only | Hard rule 3. No arithmetic on floats anywhere. |
| Android package name | `com.elitefoods.mobile` | See "Google client id" below. Fixed now, before anything is generated. |

### Proposed file layout

```
app/                          expo-router routes
  _layout.tsx                 providers + theme
  (tabs)/
    _layout.tsx               tab bar
    index.tsx                 catalog list + category filter
    cart.tsx                  cart
    orders.tsx                order history
    account.tsx               profile / sign out
  product/[slug].tsx          product detail
  sign-in.tsx                 Google sign-in
  checkout.tsx                checkout form
  order/[id].tsx              order detail / confirmation
src/
  lib/api.ts                  fetch wrapper: envelope, error codes, 401 re-mint, retry
  lib/auth.ts                 google sign-in + /auth/token + secure-store read/write
  lib/session.tsx             SessionProvider (token, profile, role for UI only)
  lib/cart.tsx                CartProvider (server cart + optimistic mutations)
  lib/money.ts                formatNaira
  lib/types.ts                response types transcribed from the contract
  components/                 ProductCard, VariantPicker, QtyStepper, IssueBanner,
                              EmptyState, Button, Screen
  theme.ts                    colours, spacing, radii
.env.example
google-services.json         NOT committed
```

No `src/lib/schemas.ts`, no cache layer, no query library, no abstract repository.
If something gets a second use it gets extracted; until then it stays in the component.

---

## Phase 0 (immediate, no code) — the Android Google client

This is first because the **development build cannot complete without it**, and phase 2
is worthless without a build.

1. Create the Android OAuth client in Google Cloud Console, type **Android**.
2. Package name: **`com.elitefoods.mobile`** (exactly this; it becomes
   `android.package` in `app.json`).
3. SHA-1 signing certificate: the **EAS keystore**, not the local debug keystore,
   because the development build we verify on is signed by EAS.

   ```powershell
   eas credentials -p android
   ```

   Choose the Android keystore, view its credentials, and read the SHA-1 from there.
   Do not use `~/.android/debug.keystore`; that fingerprint will not match the build.

4. **Preferred path: no Firebase, no `google-services.json`.** `@react-native-google-signin`
   can be initialised with `webClientId` alone and will return an ID token whose `aud`
   is the **web** client id, which the server already accepts via `GOOGLE_CLIENT_ID`.
   So the preferred setup needs only the Android OAuth client plus the existing web
   client id, and nothing server-side.

   The current `@react-native-google-signin` setup is checked against its docs before
   phase 2 code is written. The Firebase/`google-services.json` route is a fallback
   only, adopted if the docs and the installed version make it necessary. Either way
   the decision is stated here before anything is requested from you.

5. `GOOGLE_EXTRA_CLIENT_IDS` is **not** requested up front. It is only needed if an
   actual wrong-`aud` rejection appears, and that is diagnosed from the server response
   rather than assumed.

**When you need it:** before the first phase-2 development build. Not before phase 1
(catalog needs no Google config). I will report which path applies before asking you
for any credential.

Later, for a release build, add the release keystore's SHA-1 as a second credential.
Not in scope now.

---

## Phase 1 — Scaffold, API client, catalog

Independently verifiable: browse the real catalog on a real phone with no sign-in.

### Files

| File | Change |
| --- | --- |
| `package.json`, `tsconfig.json`, `app.json`, `babel.config.js`, `.eslintrc` | Expo SDK (latest stable) + TypeScript strict + `expo-router` + `expo-secure-store` + `@react-native-google-signin/google-signin` + `expo-status-bar`. `android.package` = `com.elitefoods.mobile`, `android.googleServicesFile` pointed at the file provided in phase 0. |
| `.env.example` | `EXPO_PUBLIC_API_URL=https://elite-foods.vercel.app/api/v1` |
| `.gitignore` | add `.env`, `.env*.local`, `google-services.json`, `android/`, `ios/` |
| `src/lib/types.ts` | `Product`, `Cart`, `Order`, `DeliveryArea`, `PaymentMethod`, `ApiErrorCode` — transcribed from the contract, no invention |
| `src/lib/money.ts` | `formatNaira(n: number): string` |
| `src/lib/api.ts` | the shared client (below) |
| `src/theme.ts`, `src/components/*` | brand colours, `ProductCard`, `EmptyState`, `Button`, `Screen` |
| `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx` | tabs + catalog list with category filter |
| `app/product/[slug].tsx` | product detail: description, variants, price, `isAvailable` |

### The API client

One module, and the only place that knows about the envelope:

- `request<T>(method, path, { body, auth })`.
- Always reads `{ data, error }`. Success returns `data`; failure throws
  `ApiError { code, message, fields? }`.
- Network failure / non-JSON body → a synthetic `INTERNAL` with a user-safe message.
  **Never** surfaces the raw error, per hard rule 6.
- `UNAUTHENTICATED` maps to one signed-out state. The re-mint-and-retry-once logic is
  wired in behind a callback that phase 1 installs as a no-op and phase 2 replaces, so
  there is no rework.
- `getProducts(category?)` and `getProduct(slug)` live in `src/lib/catalog.ts` as thin
  wrappers, so screens never build URLs.

### Category filter: driven by the API, absent until the endpoint exists

`GET /api/v1/categories` is being added server-side. Phase 1 calls it and renders the
filter row from the response. **No category id or label is hard-coded**, because
`?category=` with an unknown value is a hard 400, not a soft filter, so a hard-coded
list would silently rot.

While the endpoint is absent it answers `404 NOT_FOUND` and the filter row is not
rendered at all — the catalog still works, showing everything. One `getCategories()`
call in `src/lib/catalog.ts` is the only place that knows about it, so when the endpoint
lands the only change is the response arriving instead of a 404. No structural rework.

### Verify on a real phone

1. `npx tsc --noEmit` and `npx expo lint` clean, then commit.
2. `npx expo run:android` with the phone in USB debug mode, or an EAS dev build
   installed on the phone. Expo Go also works for this phase.
3. Confirm the product count and names match the web `/shop` page.
4. Tap each category; counts change; the "All" chip restores the full list.
5. Open a product; variant labels, prices and availability match the web detail page.
6. Open an unknown slug — a clean in-app `NOT_FOUND` message, no red screen, no stack trace.
7. Turn on airplane mode and pull to refresh — a friendly "cannot reach us" message,
   no crash.
8. Sanity-check money: prices render as `₦300`, `₦1,250` (thousand separators, no
   decimals) and match the web exactly.

### Risks

- **Expo SDK / library version churn.** `@react-native-google-signin/google-signin`
  is the volatile one and is added in this phase so a resolution problem surfaces here
  and not in phase 2. Mitigation: pin it and check its RN peer requirement.
- **`expo prebuild` regenerates `android/`.** We commit neither `android/` nor `ios/`.
  Consequence: all native config must live in `app.json` + plugins, because manual
  native edits are lost on regeneration.
- **Placeholder image.** One local asset, `contentFit: cover`, used everywhere
  `imageUrl` is null.
- **No pagination.** `GET /products` returns the whole catalog in one response. Fine at
  current size; a `FlatList` is used anyway so adding paging later is not a rewrite.

---

## Phase 2 — Sign-in, token lifecycle

Independently verifiable: sign in, land on the catalog, sign out, sign back in.

### Files

| File | Change |
| --- | --- |
| `src/lib/auth.ts` | `signInWithGoogle()`: `GoogleSignin.signIn()` → `getTokens().idToken` → `POST /auth/token` → store `accessToken` in `expo-secure-store` → return profile. Also `getFreshIdToken()` for the 401 path. |
| `src/lib/session.tsx` | `SessionProvider`: `{ status: 'loading'|'signed-out'|'signed-in', profile, signIn, signOut }` |
| `app/sign-in.tsx` | single Google button, brand styling |
| `app/(tabs)/account.tsx` | signed-out → sign-in prompt; signed-in → name, email, sign out |
| `app/_layout.tsx` | gate on session status; redirect to `/sign-in` when signed out |
| `src/lib/api.ts` | install the real 401 handler (phase 1 left a no-op) |

### Token lifecycle, precisely

- On app start: read the token from `expo-secure-store`. If present, treat as
  signed in optimistically and let the first request confirm it.
- On `401 UNAUTHENTICATED` from any authenticated request: call
  `GoogleSignin.silentSignIn()` (falling back to `hasPreviousSignIn()`) once, then
  `POST /auth/token` once, store the new token, **replay the original request once**.
- If the replay also 401s → clear the token, set signed out, redirect to `/sign-in`.
  Never a loop. Hard rule 4.
- No `AsyncStorage` for the token. No token, role or email in any log or error message.
  Hard rules 4 and 5.
- `role` is held in memory for UI only and is never used to gate a screen.

### Verify on a real phone

1. `npx tsc --noEmit` and lint clean, then commit.
2. Build: `npx expo run:android` or an EAS dev build. **Expo Go will not work** —
   `GoogleSignin` needs a development build.
3. Sign in with a Google account that has used the web shop. Confirm the app shows the
   same name.
4. Confirm the same identity server-side: `GET /api/v1/cart` with the mobile token and
   with a web session cookie return byte-identical bodies. This is the assertion the
   contract calls the most important one.
5. Decode the stored JWT locally (a throwaway debug-only script, output discarded) and
   confirm exactly five claims: `sub`, `iat`, `exp`, `iss`, `aud`. No role, no email.
6. Force a 401: wait out the hour, or temporarily point at a bad token in the debugger.
   Confirm the app re-mints, retries once, and lands back on the catalog with no visible
   sign-in prompt and no request storm.
7. Kill and relaunch the app. Confirm it comes back signed in.
8. Sign out. Confirm the token is gone from `expo-secure-store` and that nothing token-
   shaped is in AsyncStorage.
9. Sign in with a Google account not used on the web. Confirm a `customer` profile is
   created and the app works.

### Risks

- **The Google client id must match exactly.** A mismatch is `401` from `/auth/token`
  with an unhelpful message. Hence phase 0 up front. On the preferred path the token
  `aud` is the **web** client id, which the server already trusts, so no server change
  is needed; `GOOGLE_EXTRA_CLIENT_IDS` is only touched if a wrong-`aud` rejection is
  actually observed.
- **A 401 from `/auth/token` is ambiguous.** It means either a bad Google token or a
  rejected `aud`, and the message does not distinguish. If sign-in fails we check the
  `aud` before assuming the credential is bad, rather than changing server config on a
  guess.
- **`silentSignIn()` can fail** when the account was revoked on the device or Play
  Services is unavailable. Handled by falling through to a visible re-sign-in. OEM
  screen-lock / biometric prompts are expected.
- **No refresh token exists**, by design. One re-mint per 401 is the whole refresh
  story. Any bug here shows up as a surprise sign-out, so the retry-once guard is
  load-bearing.
- **No server-side revocation.** Signing out is local only; a stolen token stays valid
  up to an hour. Recorded as a known gap in the contract, accepted.
- **No rate limiter** on `/auth/token`. We will not retry a failing `/auth/token` in a loop.
- Email domain restriction: if the Google Cloud console restricts the client to a
  workspace, sign-in fails for personal accounts. Confirm during phase 0.
- **Expo Go cannot run this phase.** `GoogleSignin` is a native module, so phase 2 needs
  a development build. Phase 1 is verified in Expo Go.

---

## Phase 3 — Cart

Independently verifiable: the cart on the phone and in a web tab show the same lines.

### Files

| File | Change |
| --- | --- |
| `src/lib/cart.tsx` | `CartProvider`: `GET /cart` on sign-in, then `items`, `issues`, `subtotal`, `itemCount`. Mutations optimistically applied, then replaced by the server response, reverted on failure (hard rule 11). |
| `app/(tabs)/cart.tsx` | lines with image, name, variant label, unit price, `QtyStepper`, line total; `IssueBanner` above the list; subtotal footer |
| `app/product/[slug].tsx` | add `QtyStepper` + "Add to cart"; disabled when `!isAvailable` |
| `src/components/IssueBanner.tsx` | renders `issues` with a reason-specific message and a "Remove" action |
| `app/(tabs)/_layout.tsx` | badge on the Cart tab from `itemCount` |

### Mutations, exactly

| Action | Call |
| --- | --- |
| Add to cart | `POST /cart/merge` with one line `{ variantId, quantity }` (additive, sums and caps at 100) |
| Change quantity | `PUT /cart` with the full current list, one line changed |
| Remove a line | `PUT /cart` with the line absent |
| Remove a dead line | `PUT /cart` with the current orderable list; replace clears dead lines |

`PUT /cart` is last-write-wins across devices. Accepted. We always PUT the list we last
saw, and refetch on focus to reduce the window.

Dead lines live only in `issues`, never in `items`, and contribute to neither `subtotal`
nor `itemCount`. That is displayed, not silently hidden (hard rule 9). All four reasons
get distinct wording: `variant_missing`, `product_missing`, `unavailable`,
`quantity_capped`.

`POST /cart/merge` exists for the guest→server merge on sign-in. This app has no guest
cart (`AGENTS.md` scope), so `merge` is used only as the additive add-one-item call.
Flagged below — a slight reinterpretation of an endpoint named for another flow.

### Verify on a real phone

1. `npx tsc --noEmit` and lint clean, then commit.
2. Sign in. Add three different variants from product detail. Confirm the badge count is
   the number of **units**, not lines (2 + 3 = 5).
3. Open the same shop in a web browser tab and confirm the same lines and the same
   subtotal. Change a quantity on the web, refocus the app, and confirm the app shows
   the server's number.
4. Every mutation on the phone appears in the web cart within a second, and vice versa.
5. Kill the app mid-tap on a quantity change. Confirm no duplicate line and no wrong
   count after relaunch.
6. Add an unavailable product's variant from a stale screen. Confirm the server rejects
   or caps it and the app shows the issue rather than crashing.
7. `subtotal` on the app equals the web cart subtotal to the naira.
8. Empty the cart from the phone, confirm the web cart is empty too.

### Risks

- **Last-write-wins** across two devices can lose a tap. Accepted in the contract;
  mitigated by PUTting the full last-seen list and refetching on focus.
- **Optimistic UI can disagree with the server.** Every mutation replaces its optimistic
  value with the server's response and reverts on failure, so the UI cannot drift
  silently. This is the one place a bug is visible as a wrong price, so it is reviewed
  carefully.
- **Quantity cap at 100** is server-side; the stepper stops at 100 to avoid a pointless
  failing request.
- **Dead lines are hard to produce on demand** without an admin deleting a variant. To
  verify: seed a cart on the web, delete the variant in the admin area, then confirm the
  app shows a `variant_missing` banner and that removing it clears it.

---

## Phase 4 — Checkout, confirmation, order history

Independently verifiable: place a real order on the phone, read it back in the web
`/orders`.

### Files

| File | Change |
| --- | --- |
| `src/lib/reference.ts` | `getDeliveryAreas()`, `getPaymentMethods()` — cached in memory for the session only, never persisted |
| `src/lib/orders.ts` | `placeOrder`, `getOrders`, `getOrder` |
| `src/lib/idempotency.ts` | mints a fresh uuid **per attempt**, reused only when the same attempt is retried after a network failure |
| `app/checkout.tsx` | name, phone, area picker, address, note, payment method picker, live total (subtotal + `fee`), place button |
| `app/order/[id].tsx` | confirmation and detail: line items, totals, status, payment status, and the bank transfer block when applicable |
| `app/(tabs)/orders.tsx` | history, newest first, `orderNumber` + `createdAt` + total + status |

### Checkout flow

1. Guard: redirect to `/sign-in` if signed out.
2. Load `/cart`. If empty, show an empty state with a link to the catalog.
3. If `issues` is non-empty, show them and **block** placing the order with a clear
   message. The server rejects it anyway; failing early is kinder.
4. Load `/delivery-areas` and `/payment-methods`. Area ids and payment method ids come
   from the API only, with the server's own labels. Nothing hard-coded (hard rule 8).
5. Total shown live: `cart.subtotal + area.fee`. Both are server integers; the client
   adds nothing it was not told.
6. `POST /orders` with `customerName`, `customerPhone`, `deliveryArea`,
   `deliveryAddress`, `note`, `paymentMethod`. **No items, no prices, no totals.**
7. On 200, navigate to `/order/[id]`. The cart is empty on the server; refetch on the
   cart tab's next focus.
8. For `bank_transfer`, the confirmation screen renders the account details from the
   order response, plus `Copy` for the account number. Never hard-coded (hard rule 12).
   **Blocked on the contract gap flagged below.**
9. `emailSent: false` shows as a quiet note, never an error. The order is real.
10. `idempotentReplay: true` shows "we already received this order" rather than a
    duplicate-looking confirmation.

### Idempotency, precisely

- A new key (uuid) is minted when the customer taps **Place order**.
- If that request fails with a network error or a 5xx, the key is **kept** and the retry
  button reuses it. Same attempt.
- Any edit to the form, or a successful order, or leaving the screen and coming back,
  mints a **fresh** key. Never reuse a key for a new order (hard rule 7).
- The key is sent as the `Idempotency-Key` header, which the contract says wins.

### Verify on a real phone

1. `npx tsc --noEmit` and lint clean, then commit.
2. Signed out, deep-link to checkout. Confirm the sign-in redirect.
3. Checkout with an empty cart. Confirm the empty state, not a 400.
4. Fill the form, pick an area, and confirm the total equals subtotal + the fee the
   server published for that area. Cross-check against the web checkout total.
5. Enter the phone as `+234 803 051 1967`. Place the order. Confirm in the admin area
   that it is stored as `08030511967`, normalized.
6. Tap Place order, then quickly kill the app mid-request, relaunch and retry. Confirm
   **exactly one** order exists and the retry returns the original order id.
7. Confirm the order appears in the web `/orders` for the same account, with identical
   line items and totals, and that the web cart is empty afterwards.
8. Place a bank-transfer order and confirm the confirmation screen shows the details
   **returned by the server**. Confirm they are not in the bundle (search the JS for
   the account number).
9. Order history: place two orders, confirm newest first, and that tapping one opens
   the same detail the web shows.
10. Force an invalid `paymentMethod` from the debugger. Confirm a clean
    `VALIDATION_ERROR` message, no crash.
11. Confirm `NOT_FOUND` when opening another customer's order id, and that it looks
    identical to a nonexistent id.

### Risks

- **Double submission** is the real risk here: two orders from one tap, or a duplicate
  from a retry. Mitigated by the fresh-key-per-attempt rule plus the server's unique
  idempotency constraint.
- **Clearing the cart before the order is durable** would lose the basket. That ordering
  is the server's responsibility and is already verified there, but a network failure
  mid-checkout is the scenario to watch on a real phone.
- **`CONFLICT` (409) is documented but the prose says a repeated key returns the
  original order.** Contradiction, resolved: the app treats 409 as "we already have this
  order", fetches it and shows the confirmation. That is correct under either reading.
- **Bank transfer details are being added server-side but are in no response shape
  today.** The phase 4 UI degrades to a "contact the shop" note until they land. It
  never hard-codes them.
- **No order cancellation or status polling.** The customer sees `status` as of the last
  fetch. Pull-to-refresh is enough for now; push notifications are out of scope.
- **Offline at checkout** produces a clean error and the basket is preserved, since the
  cart is server-side.

---

## Contract gaps and ambiguities

Items 1 and 2 are being fixed server-side; 3, 4 and 5 are decided; 6 to 9 are noted.

1. **Bank transfer account details are in no response shape. Being fixed server-side.**
   `AGENTS.md` rule 12 and the contract both say the details come from the order
   confirmation response, and the contract says the server "supplies them once the
   order exists" — but neither `POST /orders` nor `GET /orders/[id]` has any field for
   them. The agreed fix is to add e.g.
   `bankTransfer: { bankName, accountNumber, accountName }` to both order responses,
   populated only when `paymentMethod === "bank_transfer"`.

   **Nothing is hard-coded.** Phase 4 reads the block from the order response when it is
   present. Until the field exists the confirmation screen shows the chosen method and a
   note to contact the shop for transfer details. It does not compile-fail or crash on
   the missing field, so it ships safely either way.

2. **`GET /api/v1/categories` does not exist yet. Being added server-side.** Phase 1
   calls it, renders the filter row from the response, and renders no filter row at all
   on `404`. No category id or label is hard-coded, and no constant needs deleting when
   the endpoint lands.

3. **`CONFLICT` / 409 contradicts itself.** The error table says "duplicate idempotency
   key with a different body", while the `POST /orders` prose says a repeated key
   returns the original order and ignores the new body. Both cannot be true. The app
   treats 409 as a replay.

4. **"A cart may be built while signed out"** appears in the contract's
   "explicitly not doing", which implies the guest→server merge flow on sign-in.
   **Resolved: guest cart is out of scope, per the user.** The cart requires sign-in,
   per `AGENTS.md`. `POST /cart/merge` is used only as an additive add-one-line call.
   The at-most-once merge algorithm in contract §1.3 is therefore not needed.

5. **No "get the current profile" endpoint.** There is no `GET /api/v1/me`, and none is
   planned. The display name and email from the last `/auth/token` response are cached
   in `expo-secure-store` alongside the token (never `AsyncStorage`, never logged), and
   the account screen is treated as provisional until a request confirms the session.
   On a cold start with no cache the account screen shows a generic signed-in state
   rather than stale or invented details.

5. **No "get the current profile" endpoint.** There is no `GET /api/v1/me`. After a cold
   start we only know the profile from a re-mint or from caching it. Proposal: store the
   display name and email returned by `/auth/token` in `expo-secure-store` alongside the
   token (never `AsyncStorage`, never logged), and treat the account screen as
   provisional until a request confirms. No server change needed.

6. **`RATE_LIMITED` / 429 is documented** but no rate limiter exists. The app will show a
   friendly message for 429 that should never appear.

7. **`GET /products/[slug]` can return `500 INTERNAL`** for injection-shaped slugs from
   the database WAF. The client must not retry those. Noted so it is not mistaken for a
   bug.

8. **No token revocation and no sign-out endpoint.** Sign-out is local only. A leaked
   token is valid up to an hour. Recorded in the contract's known gaps; accepted here.

9. **No product uuid is exposed, only slugs.** Fine — but a product deleted between the
   list and the detail screen gives 404, which the app already handles.

---

## Commit discipline

One commit per phase slice, after `npx tsc --noEmit` and `npx expo lint` pass. `.env`,
`.env*.local` and `google-services.json` are git-ignored and never printed.
