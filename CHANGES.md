# Changes

This file lists everything added, fixed or changed during the roadmap work (phases P0 to P7) and the admin redesign that followed. Each section says what the restaurant gets, then any technical notes. For how the code is organised, see `CLAUDE.md`.

## At a glance

| Phase | What it added |
|---|---|
| P0 | Foundations: automated tests, staff sessions that don't drop mid-shift, fairer rate limits |
| P1 | Proper GST bills: numbered invoices that never change once issued |
| P2 | Payments, bill operations (split, merge, move, discount), cash shifts and day close |
| P3 | Thermal printing, kitchen stations and automatic KOTs |
| P4 | POS billing screen for the counter |
| P5 | Captain (waiter) app for phones |
| P6 | Inventory, recipes and stock control |
| P7 | Customers, loyalty points and WhatsApp bills |
| UI | Complete redesign of the admin panel for desktop, tablet and phone |
| P8 | Billing without internet, smart guest menu, menu engineering, area and takeaway prices, packaging, combos, pay later, Excel downloads and dark mode |

---

## P0 — Foundations

**What changed for staff**
- The kitchen display can stay signed in for a whole service. It has its own "kitchen display" login that lasts 7 days.
- Admin and chef screens renew their login silently, so nobody is thrown back to the login page mid-shift.
- Deleting a chef or changing a password signs that person out everywhere, straight away.
- Many phones on the same restaurant Wi-Fi no longer hit "Too many requests". Limits now count per person or per table, not per internet connection.
- Screens that refresh themselves (kitchen queue, chat, notifications) pause when the tab is hidden, which cuts server load.

**Technical**
- Added an automated API test suite (Vitest, supertest, and an in-memory MongoDB that supports transactions). Run it with `npm test` in `server/`.
- Added an in-process event system (`core/events.ts`) and a transaction helper (`core/transaction.ts`).
- The client now uses TanStack Query and a `features/` folder structure; orders, kitchen and chat were moved first.

---

## P1 — Billing integrity and GST invoices

**What changed for staff**
- **Generate bill** gives each bill a proper invoice number, like `BK/26-27/000123`. Numbers:
  - follow the Indian financial year (April to March);
  - never skip and are never reused.
- Once billed, the order is locked. To change it, someone reopens it with a reason; it keeps the same number.
- A bill always prints the same way later, even if tax rates change, because its totals are saved at billing time.
- Coupons:
  - the discount is recalculated whenever items change;
  - the coupon is removed if the order falls below its minimum;
  - a use is only counted when the bill is generated, and is given back if the bill is cancelled.
- Cancelling an item the kitchen already has needs a reason (wrong item, guest changed mind, quality, other).
- A paid bill can only be **voided** by the owner, with a reason. It stays in the register marked as voided.
- **Clear orders** became **Archive**. Paid and cancelled orders are hidden from lists but kept in reports. Only untouched test orders are deleted.
- New **Invoice register** page lists every bill number, including cancelled and voided ones, searchable by number or amount.
- Bills can carry the customer's GSTIN for business customers.

**Fixes**
- A guest who submits the order form twice no longer creates two orders.
- Two people pressing "Print KOT" at once now produce one ticket, not two.
- Two cashiers clicking at the same time can't skip an invoice number or settle a bill twice.

**Technical**
- Totals are read with `totalsForOrder()`, which uses the saved bill for billed or paid orders.
- The one-off script `npm run migrate:bills` saves totals on paid bills from before this change (marked "legacy").

---

## P2 — Payments, bill operations and day close

**What changed for staff**
- **Settle** takes one payment or several (for example part cash, part UPI), records cash given and change, and supports splitting equally between people.
- A **UPI QR code** with the exact amount shows on unpaid bills and the guest's bill page.
- New bill actions on the order page:
  - **Split bill:** move chosen items to a new bill.
  - **Merge** into another open order.
  - **Move table** to a free table.
  - **Give discount**, with a reason. Staff are capped at a set percentage; the owner has no cap.
  - **Service charge:** optional, and can be removed per bill.
  - **Complimentary items:** free on the bill but still counted in reports.
- A new table status, **awaiting payment**: a table with cooked, unpaid food stays blocked when the guest leaves, instead of showing as free.
- **Cash shifts:**
  - open with the cash in the drawer;
  - record cash taken in or out;
  - count the drawer at close to see any difference.
- **Day close:**
  - produces the day's report (sales by payment, order type and category, tax, discounts, voids, bill number range);
  - is refused while bills are unpaid, unless you choose to carry them forward;
  - once a day is closed, only the owner can change its bills.

---

## P3 — Printing and kitchen stations

**What changed for staff**
- **Direct thermal printing.** A small program (`print-agent/`) runs on one restaurant PC. You pair it once with a code, and it prints KOTs and bills on network or Windows-shared thermal printers.
- **Kitchen stations**, such as Hot Kitchen or Bar:
  - each dish or category can be assigned to one;
  - each station's printer gets only its own items;
  - each chef can be set to see their station's tickets first.
- **Automatic KOTs:** guest orders go straight to the kitchen by default. You can switch to "wait for staff to accept" in Restaurant Settings.
- Bills can print automatically when generated, and paid cash bills open the cash drawer.
- A failed print is retried 3 times, then shows on the Printers page with a Retry button.
- If no printer is set up, KOTs and bills open as PDFs, as before.
- New page: **Printers & Stations**.

---

## P4 — POS billing screen (`/pos`)

**What changed for staff**
- A full-screen counter screen with:
  - a table map;
  - a menu grid with a number keypad for quantities;
  - the running order on the side.
- Takeaway orders can be **held** and resumed later.
- Keyboard shortcuts: **F2** search, **F8** save and send KOT, **F9** bill, **F10** bill and settle. Typing a number sets the quantity of the next dish.
- Dishes can have a **short code** (for example `MD`) to type in POS search.
- A three-item cash takeaway takes well under 15 seconds.

---

## P5 — Captain (waiter) app (`/captain`)

**What changed for staff**
- A phone app for waiters that can be added to the phone's home screen.
- **Tables:** open a table with a guest count, add dishes and send the KOT.
- **Ready:** dishes the kitchen has finished, with a Served button.
- **Requests:** guest chat messages, with quick replies.
- Captains can request the bill, which prints at the counter. Settling stays with the cashier.
- Tables can be assigned to a captain; each captain sees "My tables" first.
- Admin Users has **Captain** and **Cashier** presets for quick permission setup.
- After signing in, staff return to the page they were on, or to the first page they're allowed to see (not always the dashboard).

---

## P6 — Inventory and recipes

**What changed for staff**
- New **Inventory** page with five tabs: Stock, Recipes, Purchases, Stock count, Reports.
- Ingredients are tracked in grams, millilitres or pieces, and bought in larger units (for example 1 litre = 1000 ml).
- Each dish can have a **recipe**. Stock goes down when the KOT is sent:
  - an item cancelled **before** cooking puts the stock back;
  - an item cancelled **after** cooking is recorded as wastage.
- **Purchases** (with optional vendors) update the average cost.
- **Stock counts** correct the system to what's actually on the shelf.
- Wastage and adjustments need a reason and are logged.
- **Low-stock alerts** appear in notifications and on the dashboard.
- Optional **auto sold-out**: a dish is hidden when a key ingredient runs out, and comes back automatically when stock returns.
- Reports: usage (bought, used, wasted), purchase register, and food cost per dish.

**Technical**
- Stock on hand is always the sum of a history of movements, never a number that gets overwritten. This keeps it auditable.

---

## P7 — Customers, loyalty and WhatsApp bills

**What changed for staff**
- Guests are remembered by phone number, with visit count, total spend, birthday, anniversary and tags.
- New **Customers** page, filterable to regulars, guests not seen in 30 days, birthdays this week, and guests who agreed to offers.
- **Loyalty points** (off by default; set up on the Customers page):
  - earned on the paid total;
  - redeemed as a discount on the bill, from the order page or the POS;
  - expire after a set number of days, oldest points first;
  - voiding a bill takes back the points it earned and returns any points used.
- **Send bill on WhatsApp** opens WhatsApp with a link to the guest's bill. The link is valid for 30 days, shows the bill and a PDF, and can't be used to log in.

---

## Admin redesign

**What changed for everyone using the admin panel**
- A **new look across every admin page**: one consistent set of headers, cards, forms, buttons, tables, badges and pop-up windows, with a new font and icons.
- **Works on every screen size:**
  - **Desktop:** full sidebar with menu groups (Overview, Service, Billing & Cash, Menu, Floor, Guests, Kitchen & Stock, Website, Administration). It can be collapsed to icons.
  - **Tablet:** icon sidebar, which expands on tap.
  - **Phone:** a slide-out menu plus a bottom bar (Home, Orders, Kitchen, Messages, More). Tables turn into easy-to-tap card lists.
- **Built for touch:** every button and input is at least 44px tall on touch screens, nothing depends on hovering with a mouse, and number fields open the number keypad.
- **Page search:** press **Ctrl+K** (or tap the search icon) to jump to any page.
- **Pin pages:** staff can pin their favourite pages to the top of the menu. This replaces the old "Edit order" menu reordering.
- **Account menu** (top right) with Change password and Sign out.

**Pages that were reworked**
- **Dashboard:** sales and order figures with icons, plus "needs attention" links for tables waiting to pay, unread messages and low stock.
- **Food Items:** search and filters, with add and edit in a pop-up form split into sections.
- **Order detail:**
  - left side: items, adding dishes and kitchen tickets;
  - right side: bill, coupon, payment buttons and the guest's loyalty details.
- **Settle bill:** payment methods are large buttons, cash has quick amount buttons (for example ₹500), and it shows the change to give back.
- **Kitchen Queue and kitchen screen:** ticket cards with large **Start**, **Ready** and **Served** buttons; stations are shown as tabs.
- **Restaurant Settings:** split into sections (General, Business day, Taxes, Kitchen tickets, Billing, Invoice, Guest chat, Online delivery), with one Save bar that stays visible.
- **Messages:** a chat layout, with the conversation list and the thread side by side.
- **Admin Users:** a None / View / Edit choice for each page permission.
- **Orders:** type tabs, status and date filters, quick Yesterday / Today / Tomorrow buttons, and CSV and PDF downloads.
- **POS on phones:** the current order opens as a full-screen sheet.
- **Captain app:** bottom tabs with icons.
- **Also updated:** Tables, Analytics, Customers, Inventory, Printers, Categories, Subcategories, Chefs, Coupons, Team, Awards, Backup, Change password and No access.

**Wording changes**
- "Deactivate / Activate" is now **Hide / Show**.
- "Mark served" is now **Served**.
- "Closed" orders are called **Paid**.

**Technical**
- Shared UI kit in `client/src/shared/ui/` (`ui.tsx`, `Dialog.tsx`, `styles.ts`). The sidebar is defined in `client/src/app/adminNav.ts`.
- New dependency: `lucide-react` (icons).
- The guest-facing pages (QR menu and landing page) keep their own design and were not changed.

---

## P8 — Offline billing, smarter menu and the smaller gaps

**Billing without internet (POS)**
- The POS keeps working when the internet or server drops. It switches to offline billing by itself when it can't reach the server, or staff can press the cloud button in the POS header.
- Offline, **F8** prints the kitchen ticket from the counter PC, **F9** saves an unpaid bill and **F10** takes the payment. A provisional receipt prints straight away. The real invoice number is given when the bill syncs.
- Offline bills stay on that computer and sync on their own once the connection is back. A yellow bar shows how many are waiting, and **Offline bills** lists each one with its status, its invoice number once synced, and Print again, Try again and Remove buttons.
- On sync the server works out the bill again at its own prices. If its total doesn't match the offline receipt, the bill is left unpaid and flagged on the order page so a manager can settle it.
- The POS also opens with no connection at all, as long as it was opened once online on that computer.

**Smart guest menu**
- The QR menu shows a **Most ordered** strip, a "Most ordered" tag on popular dishes, and **Goes well with** suggestions in the cart. The suggestions come from what guests order together. Staff can set them per dish in the dish form ("Pairs with").

**Menu engineering report**
- New **Analytics → Menu engineering** tab. It sorts every dish into **Star** (popular and profitable), **Workhorse** (popular, low profit), **Puzzle** (profitable but rarely ordered) or **Dog**, with advice for each and a chart. Profit uses recipe costs from Inventory; dishes without a recipe are listed separately.

**Prices by area and order type, packaging, combos**
- **Areas** (for example AC hall or rooftop) are set up on the Tables page, and each table can be put in one.
- In the dish form, a dish can have its own **takeaway price**, **delivery price** and **price per area**. The POS, the QR menu and the bill all use the right price automatically.
- **Packaging charge** per plate for takeaway and delivery. It shows as its own line on the bill and is taxed.
- **Combos:** a dish can be made of other dishes. The kitchen ticket lists every dish inside it, and stock is used from their recipes.

**Pay later (credit)**
- New **Pay later** payment method for regular guests. It needs the guest's phone on the order, and a credit limit per guest can be set.
- The Customers page lists everyone who owes money. Each guest's page shows a ledger of bills and payments, with **Record payment**; cash received goes into the open cash shift. The POS and order page show what the guest already owes.

**Excel downloads**
- An **Excel** button on Orders, Invoices (with taxable value and each tax), Day close, inventory usage, purchases and food cost, Menu engineering, Customers and Pay later dues.

**Dark mode**
- Staff screens (admin, POS, captain app and kitchen display) have a dark theme. Choose Light, Dark or Device in the account menu, or tap the sun/moon button on the POS, captain and kitchen screens. The guest QR menu always stays light.

**Backups**
- Backups now also include table bookings, dish reviews, the website content and the pay-later ledger.

**Technical**
- New server modules: `pricing`, `credit`, `menuEngineering` and `recommendations`. New endpoint `POST /api/pos/offline-orders` syncs one offline sale and is safe to repeat. All are described in `CLAUDE.md`.
- New client dependency: `write-excel-file`. It is only downloaded when someone makes an Excel file.
- `client/public/sw.js` is a small service worker (production builds only) that lets the POS open offline. The nginx config serves it with `no-cache`.

---

## Kitchen display and app pop-ups

- The browser's own pop-ups ("OK / Cancel" boxes) were replaced everywhere with the app's own confirmation windows.
- The kitchen queue was redesigned: tickets sit in balanced columns, turn amber and red as they run late, and can be collapsed. Collapsed tickets are remembered on each screen.

---

## Checks done

- **Server:** 176 automated tests pass; the code type-checks and builds.
- **Client:** it builds with no new lint warnings.
- **Browser checks:** these passed for printing, POS and the captain app (P3–P5) and for the redesign (sign-in, page search, adding a dish, saving settings, a POS sale paid by UPI, kitchen Start/Ready/Served, phone menu and phone POS).
- **Screen sizes:** every admin page was checked at phone and tablet sizes, with no sideways scrolling.
- **P6–P8 in the browser:** a click-through passed for inventory (stock item, opening stock, purchase, recipe, stock count, reports), loyalty (rules, earning, redeeming), pay later (settle on account, dues, ledger, payment), areas and prices, combos, every Excel download, dark mode on desktop and phone, and offline billing: settle and unpaid bills offline, dropping the connection mid-order, opening the POS with no network from a production build, and syncing afterwards.

## Not done yet

These came up when comparing with Petpooja and are still open:
- More than one outlet.
- Two-way Swiggy/Zomato connection.
- GST reports, HSN codes and Tally export.
- Automatic WhatsApp messages and campaigns.
- Offline billing for the captain app (offline works on the POS only).

## Running it locally

1. Create `server/.env` from `server/.env.example`. It needs `MONGO_URI`, `RESTAURANT_KEY` and `JWT_SECRET`.
2. The database must be a MongoDB replica set, because billing uses transactions. Atlas already is one.
3. Start the server: `cd server`, then `npm run dev`. It runs on http://localhost:5000.
4. Start the client: `cd client`, then `npm run dev`. It runs on http://localhost:5173.

Or run `dev.bat` to start both.

Default logins from the seed data (`npm run seed`):

| Who | Username | Password | Where |
|---|---|---|---|
| Admin | `admin` | `Admin@123` | `/admin/login` |
| Chef | `chef1` | `Chef@123` | `/chef/login` |
| Tables | `tbl1` to `tbl5` | `pass1` to `pass5` | `/order` |

Change the admin password before using it anywhere real.
