# Elite Foods Mobile (Expo / React Native)

Customer-only mobile app for Elite Foods and Snacks. A client of an existing API. It has no backend of its own.

## Source of truth
- docs/API_CONTRACT.md is the API contract. Read it before writing any API code. If the app needs something the contract does not offer, stop and ask. Never invent endpoints or fields.
- Base URL comes from EXPO_PUBLIC_API_URL (default https://elite-foods.vercel.app/api/v1). Never hard-code it in screens.

## Hard rules
1. API only. No Supabase client, no database access, no service-role or anon keys, no secrets in the app.
2. The server is authoritative. Never store or send prices, names, totals or availability as truth. Cart lines are variantId + quantity. Always display what the server returns.
3. Money is whole Naira integers. No floats. Format for display only (e.g. toLocaleString).
4. Auth: sign in with Google, send the Google ID token to POST /auth/token, get a 1-hour bearer token. Store it in expo-secure-store only, never AsyncStorage. No refresh token exists: on a 401, silently get a fresh Google ID token, call /auth/token once, retry the request once, otherwise go to the sign-in screen.
5. Never put role, email or the bearer token in logs or error messages. Role comes from the server response and is for UI only.
6. Every response uses the envelope { data, error }. Handle error.code (VALIDATION_ERROR, UNAUTHENTICATED, NOT_FOUND, CONFLICT, INTERNAL) in one shared API client, not per screen. Show error.message to users. Never show raw errors.
7. Orders: generate a fresh Idempotency-Key (uuid) per order attempt. Reuse the same key only when retrying the same attempt after a network failure. Never reuse a key for a new order. Orders are placed from the server cart; never send items.
8. Reference data comes from the API: GET /delivery-areas and GET /payment-methods. Do not hard-code areas, fees or payment methods.
9. Cart issues (unavailable, variant_missing, quantity_capped) must be shown to the user. Dead lines are removed by resubmitting the cart with PUT /cart.
10. product.imageUrl is null today. Use a local placeholder image when null. Do not point at web assets.
11. Mutations: update the UI optimistically, then replace with the server response; on failure revert and show an error.
12. Bank transfer account details come from the order confirmation response, never hard-coded.

## Scope
In: catalog browse, product detail, sign-in, cart, checkout (pay on delivery, bank transfer), order history, order detail.
Out: admin features, online payments, search, reviews, push notifications, offline mode, guest cart (the cart requires sign-in), image upload, iOS-specific work for now.

## Stack and style
- Expo (managed workflow) with TypeScript strict, expo-router, expo-secure-store, @react-native-google-signin/google-signin (needs a development build, Expo Go will not work for sign-in).
- Keep it simple. Plain fetch wrapped in one api client, React state or a small context. No Redux, no heavy libraries, no abstractions without a second use.
- Light weights, rounded cards, generous whitespace. Brand: white dominant, red #A81C29 primary, cream #FDF5EA supporting, mango #F7A03C and coral #F2674A as accents. Charcoal text #1C1A1B. No brown tones.

## Workflow
- Small slices. After each slice: npx tsc --noEmit and lint pass, then commit.
- Plan first, then stop for approval before code.
- Do not print secrets. Do not commit .env files. Commit .env.example only.
- Flag anything that conflicts with this file or the contract instead of deciding silently.