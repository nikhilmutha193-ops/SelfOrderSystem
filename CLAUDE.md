# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Restaurant self-ordering system (a Node/React rewrite of a legacy ASP.NET WebForms app). Two independent npm projects with no shared workspace:

- `server/` — Express + TypeScript + Mongoose (MongoDB), JWT auth, `pdfkit` for invoices/KOT tickets.
- `client/` — React 19 + Vite + React Router 7 + Tailwind v4, axios.

The server has an API test suite (Vitest + supertest + an in-memory MongoDB replica set). The client has no tests.

## Commands

Server (`cd server`, needs `server/.env` — copy `.env.example`):
- `npm run dev` — nodemon + ts-node on http://localhost:5000
- `npm run build` — `tsc` to `dist/` (type-checks `src/`)
- `npm test` — runs `tests/**/*.test.ts`; `npm run test:watch` for watch mode; `npx vitest run tests/orders.test.ts -t "coupon"` for one file or test. `npm run typecheck:tests` type-checks the tests (Vitest does not).
- Tests need no `.env`: `tests/globalSetup.ts` starts one replica set, `tests/setup.ts` gives each test file its own database and env vars, and `tests/fixtures.ts` builds a restaurant, staff, tables and menu (`createWorld`, `loginAdmin`, `loginChef`, `seatTable`, `counterOrder`). `createWorld()` sets guest orders to `accept` mode so guest items stay unsent until a test prints the KOT; pass `{ guestOrderMode: "auto" }` to test automatic sending.
- `npm run migrate:bills` — run once after deploying billing: saves `bill` totals (marked `legacy`) on paid orders that predate it. Safe to rerun.
- `npm run seed` — creates the restaurant for `RESTAURANT_KEY` plus admin/chef/table logins and a sample menu. Seeded logins: admin `admin`/`Admin@123`, chef `chef1`/`Chef@123`, tables `tbl1`..`tbl5` with password `pass<N>`.

Client (`cd client`):
- `npm run dev` — Vite on http://localhost:5173; proxies `/api` and `/uploads` to `VITE_DEV_API` or http://localhost:5000
- `npm run build` — `tsc -b && vite build` (type-check + bundle)
- `npm run lint` — oxlint

Both at once on Windows: `dev.bat` / `dev.ps1` (frees ports 5000/5173 via `scripts/kill-dev-ports.ps1`, then opens each dev server in its own window). VS Code has a "Full Stack: Server + Client" debug compound in `.vscode/launch.json`.

Print agent (`print-agent/`, plain Node 18+, no dependencies): `node agent.js pair --server <url> --code <code>` once, then `node agent.js` (or `start-agent.bat`). See `print-agent/README.md`.

Docker: `docker compose up -d --build`, then `docker compose run --rm seed` once. MongoDB is external (set `MONGO_URI` in a root `.env`); nginx in the client container proxies `/api` and `/uploads` to the `server` service.

## Architecture

### Single-tenant-per-deployment
Every model carries `restaurantId`, but a deployment serves exactly one restaurant: `middleware/tenant.ts` looks up the `Restaurant` whose `key` equals `RESTAURANT_KEY`, caches its id, and sets `req.restaurantId` on every `/api` request. **Every query in a controller must filter by `restaurantId: req.restaurantId`** (see `catalog.controller.ts` for the pattern: `findOneAndUpdate({ _id, restaurantId })`, 404 if null).

### Server request pipeline (`server/src/app.ts`)
`requestLogger` → helmet → CORS allowlist (`CLIENT_ORIGIN`, comma-separated) → `express.json` (25mb for backup restore) → `sanitizeRequest` (strips Mongo operators) → `/api`: `connectDb()` (memoized, needed for serverless cold starts) → rate limiter → `resolveTenant` → routers.

Two entry points share `app.ts`: `src/index.ts` (long-running; also starts the backup and table-auto-release schedulers via `setInterval`) and `api/index.ts` (Vercel serverless; **no schedulers run there**).

The backend is being migrated to a modular monolith. Migrated domains live in `server/src/modules/<domain>/` (currently `orders`, `kitchen` and `chat`, all mounted at `/api/orders`, plus `shifts`, mounted at `/api/shifts` and `/api/day-close`, `printing`, mounted at `/api/printing` and `/api/print-agent`, `pos`, mounted at `/api/pos`, `inventory`, mounted at `/api/inventory`, and `customers`, mounted at `/api/customers` and `/api/bills`). Every module uses the same layers:
- `*.routes.ts`: URLs plus `requireAuth` / `requireModule`
- `*.controller.ts`: parses input with `parse(schema, req.body | req.params | req.query)` from `core/validate.ts`, builds a `RequestContext` with `getContext(req)` from `core/context.ts`, calls the service and sends the response. No business logic goes here.
- `*.service.ts`: business rules. It takes `ctx` and typed input and never sees `req`/`res`. Other modules call a module's service (for example, `getOwnedOrder` from `orders.service`), never its repository.
- `*.repository.ts`: the only layer that touches Mongoose. It is built with `new XRepository(ctx.restaurantId)` and adds `restaurantId` to every query itself.
- `*.schema.ts`: Zod schemas and their inferred input types. Keep the user-facing error messages; the client shows them verbatim.

Cross-cutting helpers in `core/`: `events.ts` is an in-process typed event bus (`emit`/`on`). Services emit `order.created`, `order.itemsAdded`, `order.kotSent`, `order.billed`, `order.settled`, `order.cancelled` and `order.itemCancelled`; a failing handler is logged and never breaks the request. `transaction.ts` has `withTransaction(session => ...)` for multi-document writes; it needs a replica set (Atlas and the test setup have one).

Domains that haven't been migrated still use `routes/*.routes.ts` → `controllers/*.controller.ts` → `models/*.ts`, with helpers in `utils/`. New or reworked domains should follow the module pattern. Handlers are wrapped in `asyncHandler` and signal client errors by throwing `new HttpError(status, message)`. `errorHandler` returns 4xx messages verbatim but replaces 5xx messages with a generic one plus `requestId`.

### Auth and permissions
- Three JWT roles: `admin`, `chef`, `table` (`utils/jwt.ts`). Routes declare them with `requireAuth("table", "admin", ...)`.
- Staff tokens carry `tv` (the account's `tokenVersion`), `sst` (session start) and optionally `dev` (kitchen-display login, 7-day token). `requireAuth` loads the Admin/Chef on every request and rejects the token if the account is gone or `tokenVersion` changed, so bump `tokenVersion` (`$inc`) whenever a password changes or access must end. `POST /api/auth/refresh` issues a fresh token with the same `sst`, up to 24h per session (30 days for `dev`).
- The API rate limiter (`middleware/rateLimit.ts`) keys by the logged-in account or table session, not the IP, so many devices on one restaurant Wi-Fi don't share a limit. Anonymous requests are limited per IP.
- Table tokens carry `tableId` + `sessionId`; `requireAuth` re-checks that the table's current `sessionId` still matches, so releasing a table invalidates the guest's token immediately (guest tables, `isGuest`, are exempt).
- Admins additionally pass `requireModule(moduleKey)`, which reads permissions from the DB on each request. Owners (`isOwner`) bypass it; otherwise GET/HEAD/OPTIONS need `view` or `edit`, mutations need `edit`. Non-admin roles pass straight through `requireModule`.
- The module list is defined twice and must stay in sync: `server/src/utils/permissions.ts` (`MODULES`) and `client/src/lib/adminAuth.tsx` (`MODULES`). On the client, admin routes in `app/App.tsx` are wrapped in `<RequireModule module=...>`.
- Staff actions are recorded with `writeAudit(req, action, summary)` (`utils/audit.ts`), which is best-effort and never throws.
- Table QR codes encode an AES-GCM token (`utils/tableToken.ts`, keyed off `JWT_SECRET`) rather than the table code. Rotating `JWT_SECRET` invalidates printed QR codes.

### Orders and kitchen (KOT) model
- `Order` (dine-in / takeaway / legacy delivery; `source` is guest / counter / swiggy / zomato) has many `OrderItem`s. Item prices are always recomputed server-side from `FoodItem` and never taken from the client.
- An item is "sent to kitchen" when its `kotRound` is set by a KOT print. Multiple rounds per order are normal. Item status flow: `pending → preparing → ready → served` (or `cancelled`).
- KOT token numbers reset each **business day** (`utils/kotQueue.ts` + `KotCounter`). Business-day boundaries use the restaurant's `dayEndTime` and timezone (default `Asia/Kolkata`) via `utils/businessDay.ts`, not the host clock. Use these helpers for anything "today"-scoped (dashboards, reports).
- Releasing a table (by staff or by the auto-release scheduler) cancels open guest orders that have no printed KOT (`utils/tableRelease.ts`). Counter orders and anything already sent to the kitchen are kept.
- A food item is visible only if it and its subcategory and category are all active. This is computed at read time, not cascaded on write.
- Guest items go to the kitchen by themselves when `kotSettings.guestOrderMode` is `auto` (the default): `kitchen.handlers.ts` listens for `order.itemsAdded` with `addedByRole: "table"` and calls `sendOrderToKitchen`. In `accept` mode they wait until staff print the KOT. Staff-added items never auto-send.
- The guest's ready-by estimate (`order.estimatedReadyAt`) is set when a KOT round is sent, not when items are added.

### POS (`modules/pos`, client `features/pos`, route `/pos`)
- A full-screen counter screen outside `AdminLayout` (it wraps itself in `AdminProfileProvider` and needs the `orders` module). It has a table map (`GET /api/pos/floor`: tables with their open or billed orders, plus running takeaways), a menu grid with a quantity keypad, and a running-order panel.
- `GET /api/pos/menu` is a flat, visible-only menu with `shortCode`, modifiers and resolved `stationId`; Express's ETag gives 304s. `FoodItem.shortCode` is 1–6 uppercase letters or digits, unique per restaurant.
- `POST /api/pos/orders` creates a dine-in (table required) or takeaway order with its items and, unless `sendToKitchen: false` (Hold), sends the KOT, in one idempotent call. It checks the items before creating anything, so a bad item leaves no empty order. Adding to an existing order uses the normal orders endpoints.
- Shortcuts: F2 search (Enter adds the first match; short codes rank first), F8 save and send KOT, F9 bill (prints on the bill printer, or opens the PDF when there is none), F10 bill and open the settle dialog, digits set the quantity for the next dish.
- The draft cart, save (create or add, then KOT) and bill logic live in `features/pos/usePosCart.ts`, shared by the POS and the captain app. `OrderPanel` takes `phone` and `className` for the captain's full-screen sheet and hides Settle when `onSettle` is null.

### Captain app (`features/captain`, route `/captain`)
- Waiters use a normal admin account. Admin Users has a "Captain (waiter)" preset (orders edit, tables view, kot edit, messages edit) and a "Cashier" preset. There is no separate role.
- Phone layout with Tables (opens a free table with a guest count, then the POS menu and cart), Ready (items the kitchen marked ready, from the KOT queue, with Served) and Requests (guest chat with inline replies). Captains send KOTs and request the bill, which prints at the counter when a bill printer exists; they don't settle.
- Tables can be assigned to a captain (`Table.captainId`, set on the Tables page via `PUT /api/tables/:id/captain`; `GET /api/tables/captains` lists staff with Orders edit). The floor view includes `captainId`/`captainName`, and a captain with assigned tables sees "My tables" by default. Deleting an admin clears their assignments.
- It installs as a home-screen app through `public/captain.webmanifest` (added to the page by the captain screen) and `captain-192/512.png`. Online only.
- Admin login honors `?next=` (same-site paths only); `ProtectedRoute` adds it for admin routes, so `/captain` returns there after sign-in. Without `next`, login goes to `/admin`, which redirects to the first page the account may open.

### Inventory (`modules/inventory`, client `features/inventory`, permission module `inventory`)
- `StockItem` is counted in a base unit (`g`, `ml`, `pcs`) and bought in a purchase unit (`purchaseFactor` base units each, e.g. 1 L = 1000 ml). `StockMovement` is an append-only ledger (opening, purchase, consumption, reversal, wastage, adjustment); **stock on hand is always the sum of movements**, never a stored counter. `avgCost` is per base unit and re-averaged on each purchase (and on opening stock with a cost).
- `Recipe` (one per food item) lists ingredient quantities for one portion, optional `key` ingredients, and extras per modifier option. Dishes without a recipe never touch stock.
- `inventory.handlers.ts`: `order.kotSent` posts consumption for the round. `order.itemCancelled` (with `previousStatus`) posts a reversal, plus wastage when the item had left `pending` (cooking started). `order.cancelled` does the same for every item on the order, treating anything not `cancelled` as cooked; a void (`voided: true`) changes nothing because the food was sold. Each item is settled once.
- Purchases (optional `Vendor`) and stock counts run in `withTransaction`; a count posts the variance as adjustments so stock equals what was counted. Wastage and adjustments need a reason and are audited.
- `restaurant.inventorySettings.autoSoldOut`: when a key ingredient reaches zero the dish is set inactive with `FoodItem.soldOutByStock`, and restored automatically once stock is back. `refreshSoldOut` runs after every stock change.
- The dashboard summary includes `lowStockItems` (active items at or below `reorderLevel`), shown in the notification center. Reports: usage (bought, used, wasted, adjusted and their values for a business-date range), purchase register, and food cost per dish (`GET /inventory/recipes` returns `cost` and `costPercent` at current average cost).

### Customers, loyalty and bill links (`modules/customers`, client `features/customers`, permission module `customers`)
- `Customer` is unique per restaurant by phone, normalized with `utils/phone.ts` (10-digit Indian mobiles become `91XXXXXXXXXX`). `customers.handlers.ts` links an order to a customer on `order.created` when it has a usable phone, records the visit and spend on `order.settled`, and undoes both on a void.
- Loyalty rules live in `restaurant.loyaltySettings` (off by default). `LoyaltyEntry` is a points ledger (earn, redeem, reverse); the balance comes from `loyaltyBalance()` in `loyalty.ts`, which spends the oldest points first and drops earned points after `expiresAt`. Points are earned on the paid total.
- Redeeming (`POST /customers/orders/:id/redeem`, open orders only) posts the redeem entry at once inside a transaction that touches the customer, so two tills can't spend the same points. It sets `order.loyaltyRedeem`, which `computeInvoiceTotals` applies as `loyaltyDiscount` after the coupon and manual discounts, and the bill snapshot keeps it. Removing it, cancelling the order or voiding the bill gives the points back; a void also takes back points the bill earned.
- Staff with Orders access can look up and attach guests (`/customers/lookup`, `/customers/orders/:id/attach`) from the order page and POS; the Customers page (list, segments, profile, loyalty rules) needs the `customers` module.
- "Send bill on WhatsApp" calls `POST /api/bills/:orderId/share`, which signs a 30-day link with a key derived from `JWT_SECRET` (audience `bill`, so it can never pass `requireAuth`) and returns a `wa.me` URL. The public page is `/bill/:token` (`GET /api/bills/public/:token` and `/pdf`, no login). Expired links return 410. The link uses `restaurant.publicUrl`, else the request's Origin.

### Printing and kitchen stations (`modules/printing`)
- A `Station` is a section of the kitchen. Each `OrderItem` gets `stationId` when it is added: the food item's `stationId`, else its category's `defaultStationId`. Chefs can have a `stationId`, which is the default filter for their queue (`GET /orders/kot/queue?stationId=`).
- The server never talks to printers. A `PrintAgent` (a restaurant PC running `print-agent/`) is paired with a one-time 8-character code and then authenticates with `Authorization: Agent <token>` (only hashes are stored). It polls `GET /api/print-agent/jobs`, sends the raw ESC/POS bytes to a network printer (TCP 9100) or a Windows shared printer, and reports `POST /jobs/:id/result`.
- `PrintJob`s are created by event handlers (`printing.handlers.ts`): every `order.kotSent` splits the round by station, and each part goes to the printers for that station, or to printers with `printsUnroutedKots` when none match. `order.billed` prints the bill when `invoiceSettings.autoPrintBill` is on. Staff can also reprint a round (`POST /orders/:id/kot/:round/reprint`) or print a bill (`POST /orders/:id/bill/print`); both return 409 when no printer fits. A failed job is retried up to 3 times, then shows as failed until someone retries it. Jobs expire after 7 days.
- Tickets are rendered with `utils/escpos.ts` (ASCII only; `₹` prints as `Rs.`). When no printer is configured, the client falls back to the PDF KOT/invoice in a new tab.

### Billing (`modules/orders/orders.billing.ts`)
- Order status: `open → billed → closed` (the UI says "Paid"), or `cancelled`. "Generate bill" (`POST /orders/:id/bill`) assigns the invoice number, saves the totals in `order.bill` and locks the order: no new items, coupon changes or item cancels until someone with Orders edit reopens it with a reason (`/reopen`, same number). Paying an open order bills it first. Cancelling a billed order needs a reason and keeps its number. Voiding a paid bill (`/void`) is owner-only, needs a reason, and sets `status: "cancelled"` plus `voidedAt`.
- Invoice numbers are `PREFIX/YY-YY/NNNNNN`: the prefix is `invoiceSettings.invoicePrefix` (1–3 characters) and the series follows the Indian financial year, April–March (`utils/invoiceNumber.ts` + `InvoiceCounter`). Numbers are consecutive and never reused. Billing and every status change run in `withTransaction` with a conditional update on the expected status, so concurrent clicks can't burn a number or settle twice. **Transactions need a replica set, including in local dev.**
- Read totals with `totalsForOrder(order, items, restaurant)`. It returns the saved `bill` when there is one and only calculates live for unbilled orders. Never recompute a billed or paid order from current tax rates. `computeInvoiceTotals` applies, in order: coupon discount, manual discount, loyalty points, service charge (`billingSettings.serviceChargePercent`, unless the order's `serviceChargeWaived`), then GST (5% as CGST + SGST from `restaurant.taxRates`) on the taxable value, rounded to the nearest rupee with a separate `roundOff`.
- Billing is refused while any item hasn't been sent to the kitchen ("Send N items to the kitchen or cancel them before billing"), and it needs at least one item.
- Settling (`PATCH /orders/:id/pay`) takes either `{ paymentMethod }` for one full payment or `{ payments: [{ method, amount, reference?, tendered? }] }`. The amounts must equal the bill exactly; cash `tendered` records the change. They are stored in `order.payments`, and `paymentMethod` becomes the single method or `split`.
- Bill operations live in `orders.operations.ts`. All need an open order unless noted: split items to a new bill (`/split`), merge into another open order (`/merge`), move to a free table (`/transfer`, open or billed), manual discount with a reason (`PUT /discount`, capped at `billingSettings.maxStaffDiscountPercent` for non-owners), waive service charge (`PUT /service-charge`), and complimentary items (`PATCH /items/:id/complimentary`, priced at zero but the value kept for reports).
- Coupons: applying one only validates it. A use is counted atomically when the bill is generated (respecting `usageLimit`) and given back on reopen, cancel or void. The discount is recalculated whenever items change on an open order, and the coupon is dropped if the order falls below its minimum.
- Cancelling an item the kitchen already has needs a reason code (`ITEM_CANCEL_REASONS`).
- "Clear orders" is now archive (`DELETE /orders`). It sets `archivedAt` on paid and cancelled orders, which hides them from lists but keeps them in reports and the invoice register, and it deletes only open, unbilled orders that never reached the kitchen.
- Tables have three states: `available`, `occupied` and `awaiting_payment`. Always call `syncTableState(tableId, { endSession? })` (`utils/tableState.ts`) after changing a dine-in order's status instead of setting table status by hand. It frees a table only when nothing on it is unpaid. Guest leave, staff release and auto-release pass `endSession`, so a table with cooked, unpaid food moves to `awaiting_payment` and the guest's token stops working.
- Shifts and day close (`modules/shifts`, permission module `dayClose`): one open shift at a time, expected cash = float + cash payments + cash in − cash out. Closing a business day saves a report snapshot (`DayClose`) and is refused while orders are unpaid unless `carryForward` is set. After a day is closed, only the owner can reopen or cancel its bills (`assertDayOpen` in `utils/dayLock.ts`).
- `connectDb()` waits for every model's indexes before resolving, because unique indexes (invoice counter, open shift) are what make concurrent writes safe on a fresh database.
- `GET /orders/invoices` is the invoice register (search by `number` or exact `amount`; legacy paid bills appear with `legacy: true`). KOT rounds come from an atomic `Order.kotSeq`, so simultaneous prints produce one ticket.
- Order creation and adding items accept an `Idempotency-Key` header (`core/idempotency.ts`); the client sends one per action. A guest who submits the dine-in form twice gets the same order back.
- Open question to raise before aggregator work: Swiggy/Zomato may pay GST on their orders themselves (section 9(5)), so those bills might need no tax.

### Storage (`utils/objectStore.ts`)
`putObject/getObject/deleteObject(folder, name, ...)` write to Cloudflare R2 when `R2_*` env vars are set, otherwise to local `server/uploads/`, `backups/`, `invoices/`. Public folders (banner/logo/product/team/awards) go to the public bucket. `invoices` and `backups` go only to `R2_PRIVATE_BUCKET`, or stay on local disk if it is unset. Never route tenant data to the public bucket.

### Backups
`utils/backupService.ts` has a `TENANT_MODELS` list that controls what gets exported and restored. If you add a new tenant-scoped model, add it there.

### Client
- Layout: `app/` (router in `App.tsx`, `providers.tsx` with the TanStack Query client, `ProtectedRoute`), `features/<domain>/` (`api.ts` typed calls, `queries.ts` query and mutation hooks, `components/`, `pages/`) and `shared/` (`api/client.ts`, `api/queryClient.ts`, `ui/`). Migrated features: `orders`, `kitchen`, `chat`, `dashboard`, `shifts`, `printing`, `pos`, `captain`, `inventory`, `customers`, plus `catalog/queries.ts` for the menu. Everything else still lives in `pages/`, `components/` and `lib/`; move a domain into `features/` when you rework it.
- Server data goes through TanStack Query. Pages never build API URLs; they call a feature's `api.ts` or its hooks. Mutation hooks invalidate the affected keys on success (`refreshOrderData` refreshes orders, kitchen and dashboard). Polling uses `refetchInterval` with the intervals in `POLL` (`shared/api/queryClient.ts`). It pauses in hidden tabs, except the kitchen queue and the admin notification center, which keep polling so alerts still sound.
- `shared/api/client.ts` holds the single axios instance (`baseURL` = `VITE_API_BASE_URL` or `/api`). Tokens are stored per role in localStorage (`selforder_<role>_token`). Pages call `activateStoredAuth(role)` to attach one. Admin and chef tokens are refreshed silently once past half their lifetime. The response interceptor treats a 401 as an expired session and redirects to that role's login. Login endpoints and `/tables/session/release` are exempt.
- UI kit (`shared/ui/`): build admin pages from `ui.tsx` (`Page`, `PageHeader`, `Card`, `CardHeader`, `Field`, `Input`/`Select`/`Textarea`/`SearchInput`, `Button` with `variant`/`size`/`icon`/`loading`, `IconButton`, `Switch`, `Tabs`, `Badge` with `dot`, `Alert`/`ErrorText`, `EmptyState`, `StatCard`, `Skeleton`, `TableWrap`) and `Dialog.tsx` (bottom sheet on phones, centered from `sm`; pass `onSubmit` to make it a form). `buttonClass()` in `shared/ui/styles.ts` styles a `Link` as a button. Icons come from `lucide-react`. Colours are Tailwind's `slate` plus the brand `orange` scale redefined in `index.css`, which also holds the tokens (`shadow-card`/`raised`/`pop`, `bg-canvas`, animations) and global styles for tables inside `TableWrap` (`.ui-table`), selects, checkboxes and file inputs. Don't hand-roll overlays, tab bars or table cell padding.
- Touch and screen sizes: controls are at least 44px tall on coarse pointers (enforced in `index.css` and the kit), nothing depends on hover, and every page must fit 390px wide with no horizontal scroll. Lists that are tables on desktop switch to a card list below `md` (see Food Items and Orders).
- Admin shell (`pages/admin/AdminLayout.tsx`): the sidebar groups and icons come from `app/adminNav.ts` (add new admin pages there; each item is shown only when `can(profile, module)` allows it). It is a full sidebar from `lg`, an icon rail on tablets, and a drawer plus bottom tab bar on phones. Ctrl+K opens page search (`app/shell/CommandPalette.tsx`); the account menu is `app/shell/UserMenu.tsx`. Staff can pin pages to the top of the sidebar (stored per browser).
- Use `uploadImage(file, folder)` for image uploads. It compresses the image client-side and enforces a 4MB cap because of Vercel's body limit.
- All pages are lazy-loaded in `App.tsx`. Route areas: `/` landing, `/order/*` customer (table role), `/admin/*` (admin role + per-module gate), `/chef/*`, plus full-screen `/pos` and `/captain` (admin role) and the public `/bill/:token`.
- Real-time behavior (KOT queue, chat, notifications, active orders) is done by polling. There are no websockets.
- When a list from a query feeds `useEffect`/`useMemo` dependencies, default it to a module-level constant (`data ?? NO_MENU`), not `?? []`, or the hook reruns on every render.
- Menu content supports `en`/`kn`/`hi` through a `translations` field on catalog docs; `tr()` in `lib/i18n.ts` falls back to English.
- Shared shapes live in `client/src/lib/types.ts` and are hand-mirrored from the server models. Update them when you change a model.

## Deployment notes
- Vercel: `server/vercel.json` routes everything to `api/index.ts`; `client/vercel.json` does SPA rewrites and proxies `/uploads` to the server deployment; `client/.env.production` sets `VITE_API_BASE_URL`.
- The aggregator (Swiggy/Zomato) webhook contract is documented in `server/docs/aggregator-webhook.md`.
- The OAuth flow (`/api/oauth`) only accepts redirect URIs listed exactly in `OAUTH_ALLOWED_REDIRECT_URIS`.
