# Digital Order System (Node + React rewrite)

A rewrite of the legacy ASP.NET WebForms "SelfOrder" restaurant ordering system, using:

- **Server**: Node.js, Express, TypeScript, MongoDB (Mongoose), JWT auth, bcrypt password hashing, PDF generation via `pdfkit`.
- **Client**: React, TypeScript, Vite, React Router, Tailwind CSS.

## Feature parity with the legacy app

- Admin: category/subcategory/food item management (active/inactive), table management, chef accounts, tax & restaurant settings (a real settings page — the legacy app only had this hardcoded in `Web.config`), dashboard, dine-in/delivery order listing with filters, order detail with pay/cancel, forgot-password via security question.
- Chef: kitchen queue (KOT), mark items served, generate/print KOT tickets per round.
- Customer: table PIN login, place a dine-in order, browse the menu, build a cart, confirm order (supports multiple ordering rounds), live bill with tax breakdown.
- Delivery/aggregator orders (Swiggy/Zomato/Uber-Eats/Other), created by an admin.

Several bugs in the legacy app were fixed rather than carried forward — see the "Deliberate fixes" section below.

## Prerequisites

- Node.js 18+
- A running MongoDB instance (local or Atlas)

## Setup

### 1. Server

```bash
cd server
cp .env.example .env   # edit MONGO_URI / RESTAURANT_KEY / JWT_SECRET as needed
npm install
npm run seed            # creates a restaurant, admin/chef/table logins, and sample menu
npm run dev              # http://localhost:5000
```

Seeded credentials (printed by the seed script too):
- Admin: `admin` / `Admin@123` (security question answer: `blue`)
- Chef: `chef1` / `Chef@123`
- Tables: `tbl1`..`tbl5`, password `pass<N>` (e.g. `tbl1` / `pass1`)

### 2. Client

```bash
cd client
npm install
npm run dev   # http://localhost:5173 (proxies /api to http://localhost:5000)
```

Visit `http://localhost:5173/` for the customer table-ordering flow, `/admin/login` for the admin panel, and `/chef/login` for the kitchen dashboard.

## Docker

Runs the API and the built UI behind Nginx with one command. The UI never needs to know the backend's host/port — Nginx reverse-proxies `/api` and `/uploads` to the `server` container by its Compose service name, so the browser only ever talks to one origin. MongoDB is **not** bundled — point `MONGO_URI` at an external database (e.g. MongoDB Atlas) that you manage yourself.

```bash
cp .env.example .env        # fill in MONGO_URI and JWT_SECRET (and RESTAURANT_KEY / CLIENT_PORT if you want non-defaults)
docker compose up -d --build
docker compose run --rm seed   # first time only: creates the restaurant, admin/chef/table logins, and sample menu
```

Visit `http://localhost:8080/` (or your `CLIENT_PORT`). Seeded credentials are the same as above. Data persists in named volumes (`uploads_data`, `backups_data`) across `docker compose down`/`up`; use `docker compose down -v` to wipe them.

## Deliberate fixes vs. the legacy app

- All queries are parameterized through Mongoose (no SQL/NoSQL injection).
- All passwords (admin, chef, table PIN) are hashed with bcrypt and verified via the hash, never transmitted in plaintext over the wire for login. (Chef/table PINs are additionally stored in plaintext alongside the hash so admin can view them in Admin → Chefs/Tables — a deliberate trade-off made at the user's request; admin passwords remain hash-only.)
- Table status uses an explicit `available` / `occupied` enum (the legacy app had two screens disagreeing about what `1` vs `0` meant).
- Menu item price/total are always recomputed server-side from the current `FoodItem` record at order-confirm time — a client-supplied price is never trusted.
- The shopping cart lives in the browser's React state per customer session, not in a shared server-side field (the legacy app used `static` fields, so concurrent customers could corrupt each other's carts).
- Category/subcategory/food "active" status is computed at read time (a food is only visible if its own, its subcategory's, and its category's flags are all active) instead of destructively cascading writes onto child rows.
- KOT "sent to kitchen" state is tracked per print round (`kotRound`) instead of one flag for the whole order, so a second wave of items ordered after the first KOT print can be sent to the kitchen independently.
- Invoice PDFs and KOT tickets are streamed on demand (`pdfkit`) instead of accumulating files on disk.
- Tax calculation supports any number of configured tax rates, not exactly two hardcoded rows.
- Restaurant name/address/logo/tax rates are real, admin-editable data (`/admin/settings`) instead of static `Web.config` values requiring a redeploy to change.
- Logging out of a table session no longer silently cancels the in-progress order.
