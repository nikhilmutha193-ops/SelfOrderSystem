# Aggregator Order Webhook (Swiggy / Zomato)

This service can receive online-delivery orders pushed by an aggregator (Swiggy, Zomato)
or a middleware (UrbanPiper, Petpooja, Posist, Rista, Dotpe, …). Each order posted to the
webhook is created as a **delivery order** and then flows through the normal
Dashboard → KOT → Orders → invoice screens.

> **Note:** Swiggy and Zomato do not expose a self-serve public API. You must be an approved
> partner (directly, or via a certified middleware) that is configured to POST to this webhook.
> Until a secret is generated (see below) the webhook is disabled and returns `503`.

---

## 1. Endpoint

```
POST /api/webhooks/aggregator/{platform}
```

- `{platform}` — `swiggy` or `zomato` (lower-case).
- Body — `application/json` (see [Payload](#3-payload)).
- Base URL — your deployment's public address, i.e. the **Public URL** set in
  *Admin → Restaurant Settings*. Examples:
  - `https://your-domain.com/api/webhooks/aggregator/swiggy`
  - `https://your-domain.com/api/webhooks/aggregator/zomato`

The endpoint must be reachable over the public internet by the aggregator, so the Public URL
must be a real HTTPS address (not `localhost` / a LAN IP).

---

## 2. Authentication

The webhook is authenticated with a **shared secret**, not a login session.

1. In *Admin → Restaurant Settings → Online delivery (Swiggy / Zomato)*, click **Generate**
   (or `POST /api/aggregator/secret` as an admin) to create the secret.
2. Send that secret on every webhook request, either as a header (preferred) or a query param:

   ```
   x-webhook-secret: <your-secret>
   ```
   ```
   POST /api/webhooks/aggregator/swiggy?secret=<your-secret>
   ```

Regenerating the secret immediately invalidates the previous one. Keep it private.

---

## 3. Payload

```jsonc
{
  "externalOrderId": "SW-123456",        // optional but recommended — the aggregator's own order id
  "customerName": "Ananya",              // optional (defaults to "<Platform> customer")
  "customerPhone": "+91 98765 43210",    // optional
  "instructions": "Ring the bell twice", // optional order-level note
  "paymentMethod": "online",             // optional: "online" (default) | "cash" | "pending"
  "discountAmount": 0,                   // optional, >= 0
  "items": [                             // required, non-empty
    { "name": "Masala Dosa",   "quantity": 2, "price": 120 },
    { "name": "Filter Coffee", "quantity": 1, "price": 40, "note": "less sugar" }
  ]
}
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `externalOrderId` | string | no* | The aggregator's order reference. Used for de-duplication (see below) and shown on the order. |
| `customerName` | string | no | Falls back to `"Swiggy customer"` / `"Zomato customer"`. |
| `customerPhone` | string | no | Stored as-is. |
| `instructions` | string | no | Order-level note; attached to the first item's kitchen note. |
| `paymentMethod` | string | no | `online` (default), `cash`, or `pending`. |
| `discountAmount` | number | no | Order-level discount, `>= 0`. |
| `items` | array | **yes** | Must contain at least one line with a `name`. |
| `items[].name` | string | **yes** | Matched to your menu by name (case-insensitive, exact). |
| `items[].quantity` | number | no | Defaults to `1`; floored to a whole number `>= 1`. |
| `items[].price` | number | no | Unit price. If omitted, a matched menu item's price is used, else `0`. |
| `items[].note` | string | no | Per-item kitchen note (max 200 chars). |

\* `externalOrderId` is optional, but **strongly recommended** — without it a retried delivery
creates a duplicate order.

---

## 4. Behaviour

- **Idempotency.** If `externalOrderId` is supplied and an order with the same
  platform + id already exists, no new order is created; the existing one is returned
  with `duplicate: true`. Safe to retry.
- **Menu matching.** Each `items[].name` is matched to an active menu item by exact,
  case-insensitive name. A match links the line to that menu item (so prices, prep-time
  estimates and analytics line up). An unmatched line is kept **as-is** (free-form) using the
  `price` you send.
- **Order shape.** Created as `orderType: "delivery"`, `deliveryProvider: "Swiggy"/"Zomato"`,
  `source: "swiggy"/"zomato"`, `status: "open"`, `members: 1`.
- **Prep estimate.** `estimatedReadyAt` is derived from the matched items' prep times plus the
  restaurant's prep buffer.
- Items arrive **pending** (not yet sent to the kitchen), so staff can print the KOT as usual.

---

## 5. Responses

| Status | Body | Meaning |
|---|---|---|
| `201 Created` | `{ "ok": true, "duplicate": false, "orderId": "…" }` | Order created. |
| `200 OK` | `{ "ok": true, "duplicate": true, "orderId": "…" }` | Duplicate `externalOrderId` — existing order returned. |
| `400 Bad Request` | `{ "message": "…", "requestId": "…" }` | Unknown platform, or empty/invalid `items`. |
| `401 Unauthorized` | `{ "message": "Invalid webhook secret", "requestId": "…" }` | Missing/wrong secret. |
| `503 Service Unavailable` | `{ "message": "Aggregator webhook is not configured…", "requestId": "…" }` | No secret generated yet. |

Error bodies follow the API's standard shape: `{ "message": "...", "requestId": "..." }`.

---

## 6. Examples

### Create an order

```bash
curl -X POST "https://your-domain.com/api/webhooks/aggregator/swiggy" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -d '{
    "externalOrderId": "SW-123456",
    "customerName": "Ananya",
    "customerPhone": "+91 98765 43210",
    "instructions": "Ring the bell twice",
    "paymentMethod": "online",
    "items": [
      { "name": "Masala Dosa", "quantity": 2, "price": 120 },
      { "name": "Filter Coffee", "quantity": 1, "price": 40, "note": "less sugar" }
    ]
  }'
# -> 201 { "ok": true, "duplicate": false, "orderId": "…" }
```

### Retry the same order (idempotent)

```bash
# Same externalOrderId -> no duplicate created
# -> 200 { "ok": true, "duplicate": true, "orderId": "…" }
```

---

## 7. Related admin endpoints

These require an admin session (`Authorization: Bearer <admin-token>`, `orders` module):

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/aggregator/config` | Returns `{ secret, baseUrl }` for the settings screen. |
| `POST` | `/api/aggregator/secret` | Generates / rotates the webhook secret. |
| `POST` | `/api/aggregator/orders` | Manually enter an online order (same payload as the webhook, plus a `"platform"` field). |

---

## 8. Going direct (Swiggy / Zomato partner APIs)

The webhook accepts a **normalized** payload. A real Swiggy or Zomato push has its own
structure, so a direct integration needs a small per-platform adapter that converts their
JSON into the shape above before it reaches the ingest logic. The receiving side (this
webhook), de-duplication, and menu matching are already in place; only the adapter and the
outbound acknowledgement/menu-sync calls (which need each platform's credentials and NDA docs)
remain to be added.

Implementation lives in:
- `server/src/controllers/aggregator.controller.ts`
- `server/src/routes/webhooks.routes.ts` (public webhook)
- `server/src/routes/aggregator.routes.ts` (admin config / manual entry)
