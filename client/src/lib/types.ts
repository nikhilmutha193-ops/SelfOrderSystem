export type Role = "admin" | "chef" | "table";

export interface TaxRate {
  _id?: string;
  name: string;
  percent: number;
}

export interface QrSettings {
  showLogo: boolean;
  showName: boolean;
  showAddress: boolean;
  instructionText: string;
  accentColor: string;
}

export interface TableLoginSettings {
  allowQrScan: boolean;
}

export type PrintPaperSize = "thermal58" | "thermal80" | "a5" | "a4";

export type PrintFontSize = "compact" | "normal" | "large";

export type GuestOrderMode = "auto" | "accept";

export interface KotSettings {
  guestOrderMode: GuestOrderMode;
  headerText: string;
  showCustomerName: boolean;
  showTableInfo: boolean;
  footerNote: string;
  paperSize: PrintPaperSize;
  fontSize: PrintFontSize;
  showLogo: boolean;
  showPrices: boolean;
  showJainTag: boolean;
}

export interface InvoiceSettings {
  invoicePrefix: string;
  placeOfSupply: string;
  showCustomerPhone: boolean;
  footerNote: string;
  termsText: string;
  paperSize: PrintPaperSize;
  fontSize: PrintFontSize;
  showLogo: boolean;
  showUnitPrice: boolean;
  showJainTag: boolean;
  autoPrintBill: boolean;
}

export interface ChatModeration {
  enabled: boolean;
  mode: "mask" | "block";
  customWords: string[];
}

export interface Restaurant {
  siteTitle?: string;
  faviconUrl?: string;
  _id: string;
  name: string;
  key?: string;
  logoUrl?: string;
  address?: string;
  gstin?: string;
  fssaiLicense?: string;
  tagline?: string;
  aboutText?: string;
  publicUrl?: string;
  heroImages: string[];
  dayEndTime: string;
  timezone?: string;
  tableAutoReleaseMinutes?: number;
  prepBufferMinutes?: number;
  prepMessageTemplate?: string;
  chatModeration?: ChatModeration;
  taxRates: TaxRate[];
  qrSettings: QrSettings;
  kotSettings: KotSettings;
  invoiceSettings: InvoiceSettings;
  billingSettings?: BillingSettings;
}

export interface Category {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  defaultStationId?: string | null;
}

export interface Subcategory {
  _id: string;
  categoryId: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export type FoodType = "veg" | "non-veg" | "egg";

export type Translations = Record<string, { name?: string; description?: string }>;

export interface ModifierOption {
  label: string;
  priceDelta: number;
}

export interface ModifierGroup {
  name: string;
  type: "single" | "multi";
  required: boolean;
  options: ModifierOption[];
}

export interface SelectedModifier {
  groupName: string;
  label: string;
  priceDelta: number;
}

export interface FoodItem {
  _id: string;
  categoryId: string;
  subcategoryId: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  isBestseller: boolean;
  bestsellerEmoji?: string;
  isTodaySpecial?: boolean;
  foodType?: FoodType;
  rating?: number;
  prepTimeMinutes?: number;
  translations?: Translations;
  modifierGroups?: ModifierGroup[];
  stationId?: string | null;
  shortCode?: string;
  pairsWith?: string[];
  priceRules?: PriceRules;
  packagingCharge?: number;
  comboItems?: { foodItemId: string; quantity: number }[];
  reviewSum?: number;
  reviewCount?: number;
}

export interface MenuFoodItem {
  _id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  isBestseller?: boolean;
  bestsellerEmoji?: string;
  isTodaySpecial?: boolean;
  foodType?: FoodType;
  rating?: number;
  translations?: Translations;
  modifierGroups?: ModifierGroup[];
  guestRating?: number | null;
  reviewCount?: number;
  components?: ComboComponent[];
}

export interface MenuSubcategory {
  _id: string;
  name: string;
  description?: string;
  translations?: Translations;
  foodItems: MenuFoodItem[];
}

export interface MenuCategory {
  _id: string;
  name: string;
  description?: string;
  translations?: Translations;
  subcategories: MenuSubcategory[];
}

export interface TableRow {
  _id: string;
  code: string;
  password?: string;
  qrToken?: string;
  status: TableStatus;
  isGuest?: boolean;
  occupiedAt?: string;
  autoReleaseMinutes?: number | null;
  captainId?: string | null;
  areaId?: string | null;
}

export interface Area {
  _id: string;
  name: string;
}

export interface PriceRules {
  takeaway?: number | null;
  delivery?: number | null;
  areas?: { areaId: string; price: number }[];
}

export interface ComboComponent {
  foodItemId?: string;
  name: string;
  quantity: number;
}

export interface ChefRow {
  _id: string;
  username: string;
  password?: string;
  stationId?: string | null;
}

export type OrderType = "dine-in" | "takeaway" | "delivery";

export type OrderStatus = "open" | "billed" | "closed" | "cancelled";

export type PaymentMethod = "pending" | "cash" | "upi" | "card" | "online" | "wallet" | "credit" | "split";
export type TenderMethod = "cash" | "upi" | "card" | "online" | "wallet" | "credit";
export type TableStatus = "available" | "occupied" | "awaiting_payment";

export const TENDER_LABELS: Record<TenderMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  online: "Online",
  wallet: "Wallet",
  credit: "Pay later",
};

export interface Payment {
  method: TenderMethod;
  amount: number;
  reference?: string;
  tendered?: number;
  change?: number;
  receivedByName?: string;
  at: string;
}

export interface ManualDiscount {
  type: "percent" | "flat";
  value: number;
  reason: string;
}

export interface BillingSettings {
  serviceChargePercent: number;
  maxStaffDiscountPercent: number;
  upiVpa: string;
  upiPayeeName: string;
}

export type DeliveryProvider = "Swiggy" | "Zomato" | "Uber-Eats" | "Other";

export interface Order {
  _id: string;
  restaurantId: string;
  orderType: OrderType;
  tableId?: string | { _id: string; code: string };
  deliveryProvider?: DeliveryProvider;
  customerName: string;
  customerPhone: string;
  customerBirthday?: string;
  customerMarketingConsent?: boolean;
  members: number;
  checkinTime: string;
  checkoutTime?: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  discountAmount: number;
  source?: "guest" | "counter" | "swiggy" | "zomato";
  externalOrderId?: string;
  estimatedReadyAt?: string | null;
  kitchen?: OrderKitchenSummary;
  invoiceNumber?: string;
  billedAt?: string | null;
  bill?: BillSnapshot | null;
  customerGstin?: string;
  archivedAt?: string | null;
  cancelReason?: string;
  voidedAt?: string | null;
  voidReason?: string;
  payments?: Payment[];
  manualDiscount?: ManualDiscount | null;
  serviceChargeWaived?: boolean;
  customerId?: string | null;
  loyaltyRedeem?: { points: number; amount: number } | null;
  mergedInto?: string | null;
  splitFrom?: string | null;
  offline?: {
    clientId: string;
    createdAt: string;
    clientTotal: number;
    syncedAt: string;
    mismatch: boolean;
    note?: string;
  } | null;
}

export interface BillSnapshot extends InvoiceTotals {
  couponCode?: string;
  sac: string;
  placeOfSupply: string;
  legacy: boolean;
}

export type ItemCancelReason = "wrong_item" | "guest_changed_mind" | "quality" | "out_of_stock" | "other";

export const ITEM_CANCEL_REASON_LABELS: Record<ItemCancelReason, string> = {
  wrong_item: "Wrong item entered",
  guest_changed_mind: "Guest changed their mind",
  quality: "Quality problem",
  out_of_stock: "Out of stock",
  other: "Other",
};

export type InvoiceRegisterStatus = "reopened" | "unpaid" | "paid" | "cancelled" | "voided";

export interface InvoiceRegisterRow {
  orderId: string;
  invoiceNumber: string | null;
  legacy: boolean;
  billedAt: string | null;
  customerName: string;
  customerGstin: string;
  orderType: OrderType;
  status: InvoiceRegisterStatus;
  paymentMethod: PaymentMethod;
  grandTotal: number | null;
  taxableAmount?: number | null;
  taxLines?: { name: string; percent: number; amount: number }[];
  reason: string;
}

export interface OrderKitchenSummary {
  active: number;
  served: number;
  ready: number;
  preparing: number;
  pendingSent: number;
  pendingUnsent: number;
}

export type OrderItemStatus = "pending" | "preparing" | "ready" | "served" | "cancelled";

export interface OrderItem {
  _id: string;
  orderId: string;
  foodItemId: string;
  foodName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  isJain: boolean;
  status: OrderItemStatus;
  kotRound: number | null;
  tokenNumber: number | null;
  kotPrintedAt: string | null;
  modifiers?: SelectedModifier[];
  note?: string;
  cancelReason?: ItemCancelReason;
  cancelNote?: string;
  complimentary?: boolean;
  complimentaryReason?: string;
  stationId?: string | null;
  packagingCharge?: number;
  components?: ComboComponent[];
}

export interface InvoiceTaxLine {
  name: string;
  percent: number;
  base: number;
  amount: number;
}

export interface InvoiceTotals {
  subtotal: number;
  couponDiscount?: number;
  manualDiscount?: number;
  loyaltyDiscount?: number;
  discount: number;
  serviceChargePercent?: number;
  serviceCharge?: number;
  packagingCharge?: number;
  taxableAmount: number;
  taxLines: InvoiceTaxLine[];
  roundOff: number;
  grandTotal: number;
}

export interface OrderDetailResponse {
  order: Order;
  items: OrderItem[];
  totals: InvoiceTotals;
  prepMessageTemplate?: string;
  prepBufferMinutes?: number;
  guestOrderMode?: GuestOrderMode;
  payment?: { upiVpa: string; upiPayeeName: string };
}

export interface KotQueueGroup {
  order: Order;
  items: OrderItem[];
  tokenNumber: number | null;
}

export interface DashboardSummary {
  openOrdersToday: number;
  closedOrdersToday: number;
  salesToday: number;
  pendingKotItems: number;
  unreadChatCount: number;
  tablesAwaitingPayment?: number;
  lowStockItems?: number;
  businessDayStart: string;
}

export type ChatSenderRole = "table" | "admin";

export interface ChatMessage {
  _id: string;
  orderId: string;
  senderRole: ChatSenderRole;
  senderName: string;
  message: string;
  flagged?: boolean;
  createdAt: string;
}

export interface ChatConversation {
  orderId: string;
  order: Order;
  lastMessage: string;
  lastSenderRole: ChatSenderRole;
  lastAt: string;
  unreadCount: number;
}

export interface CartLine {
  lineId: string;
  foodItemId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers?: SelectedModifier[];
  note?: string;
}

export interface ApiErrorBody {
  message: string;
}

export type TeamMemberRole = "owner" | "chef";

export interface TeamMember {
  _id: string;
  restaurantId: string;
  role: TeamMemberRole;
  name: string;
  title?: string;
  bio?: string;
  photoUrl?: string;
  sortOrder: number;
  isActive: boolean;
}

export type CouponType = "percent" | "flat";

export interface Coupon {
  _id: string;
  restaurantId: string;
  code: string;
  type: CouponType;
  value: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usedCount: number;
  /** Max times one mobile number may use this coupon. Blank means no per-customer cap. */
  perCustomerLimit?: number;
  expiresAt?: string;
  isActive: boolean;
}

export interface Award {
  _id: string;
  restaurantId: string;
  title: string;
  issuer?: string;
  year?: number;
  imageUrl?: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface PromoBanner {
  _id: string;
  restaurantId: string;
  title?: string;
  desktopImageUrl: string;
  /** Falls back to desktopImageUrl on the public page if blank. */
  mobileImageUrl?: string;
  linkUrl?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Review {
  _id: string;
  restaurantId: string;
  tableId?: string | { _id: string; code: string };
  customerName: string;
  rating: number;
  comment: string;
  isApproved: boolean;
  createdAt: string;
}

export interface GoogleReview {
  author: string;
  rating: number;
  text: string;
  relativeDate?: string;
  profilePhotoUrl?: string;
}

export interface LandingRestaurant {
  _id: string;
  name: string;
  tagline?: string;
  aboutText?: string;
  heroImages: string[];
  logoUrl?: string;
  address?: string;
}

export interface LandingBestseller {
  _id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  bestsellerEmoji?: string;
}

export interface LandingTodaySpecialGroup {
  categoryId: string;
  categoryName: string;
  items: {
    _id: string;
    name: string;
    price: number;
    description?: string;
    imageUrl?: string;
  }[];
}

export interface LandingData {
  restaurant: LandingRestaurant;
  content?: LandingContent;
  team: TeamMember[];
  bestsellers: LandingBestseller[];
  todaySpecials: LandingTodaySpecialGroup[];
  banners: PromoBanner[];
  reviews: Review[];
  awards: Award[];
  googleReviews: GoogleReview[];
}

export interface OrderCoupon {
  code: string;
  type: "percent" | "flat";
  value: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  eligible: boolean;
  discount: number;
  reason: string | null;
}

export interface LandingLink {
  label: string;
  url: string;
}

export interface LandingContent {
  hero: {
    eyebrow: string;
    headline: string;
    subtitle: string;
    showEyebrow: boolean;
    showHeadline: boolean;
    showSubtitle: boolean;
    primaryLabel: string;
    secondaryLabel: string;
    eyebrowColor: string;
    headlineColor: string;
    subtitleColor: string;
    slides: { desktopUrl: string; mobileUrl: string }[];
    textAlignMobile: "" | "left" | "center" | "right";
    textAlignDesktop: "" | "left" | "center" | "right";
    verticalAlignMobile: "" | "top" | "center" | "bottom";
    verticalAlignDesktop: "" | "top" | "center" | "bottom";
  };
  serve: {
    enabled: boolean;
    title: string;
    lead: string;
    hint: string;
    items: { title: string; text: string; imageUrl: string }[];
  };
  menu: { enabled: boolean; eyebrow: string; title: string; lead: string; ctaLabel: string };
  todaySpecial: { enabled: boolean; eyebrow: string; title: string; lead: string };
  story: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    text: string;
    quote: string;
    quoteCite: string;
    imageUrl: string;
    caption: string;
  };
  outlets: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    items: { city: string; area: string; address: string; hours: string; mapUrl: string; comingSoon: boolean }[];
  };
  reels: {
    enabled: boolean;
    title: string;
    lead: string;
    followUrl: string;
    followLabel: string;
    items: { caption: string; url: string; imageUrl: string }[];
  };
  partnership: { enabled: boolean; title: string; text: string; ctaLabel: string; ctaUrl: string };
  footer: { tagline: string; contacts: LandingLink[]; socials: LandingLink[] };
}

export const PRINT_PAPER_SIZE_LABELS: Record<PrintPaperSize, string> = {
  thermal58: "Thermal 58mm",
  thermal80: "Thermal 80mm",
  a5: "A5",
  a4: "A4",
};

export const PRINT_FONT_SIZE_LABELS: Record<PrintFontSize, string> = {
  compact: "Compact",
  normal: "Normal",
  large: "Large",
};

export interface CashMovement {
  type: "in" | "out";
  amount: number;
  reason: string;
  byName?: string;
  at: string;
}

export interface Shift {
  _id: string;
  openedAt: string;
  openedByName?: string;
  openingFloat: number;
  isOpen: boolean;
  cashMovements: CashMovement[];
  closedAt?: string | null;
  closedByName?: string;
  countedCash?: number;
  expectedCash?: number;
  variance?: number;
  closingNote?: string;
  cashSales?: number;
  cashIn?: number;
  cashOut?: number;
}

export interface NamedAmount {
  name: string;
  amount: number;
  count: number;
}

export interface DayReport {
  businessDate: string;
  window: { start: string; end: string };
  closed: { closedAt: string; closedByName?: string } | null;
  invoiceRange: { first: string | null; last: string | null; count: number };
  totals: {
    bills: number;
    gross: number;
    discounts: number;
    serviceCharge: number;
    packagingCharge?: number;
    taxable: number;
    tax: number;
    roundOff: number;
    net: number;
  };
  byOrderType: NamedAmount[];
  byPaymentMethod: NamedAmount[];
  byCategory: NamedAmount[];
  taxes: { name: string; percent: number; amount: number }[];
  voids: { count: number; amount: number; bills: { invoiceNumber?: string; amount: number; reason?: string }[] };
  cancelledBills: {
    count: number;
    amount: number;
    bills: { invoiceNumber?: string; amount: number; reason?: string }[];
  };
  complimentary: { count: number; value: number };
  unsettled: {
    orderId: string;
    customerName: string;
    status: OrderStatus;
    invoiceNumber: string | null;
    checkinTime: string;
    amount: number | null;
  }[];
  shifts: {
    openedAt: string;
    closedAt: string | null;
    openedByName?: string;
    openingFloat: number;
    expectedCash: number | null;
    countedCash: number | null;
    variance: number | null;
  }[];
}

export interface DayCloseRecord {
  _id: string;
  businessDate: string;
  closedAt: string;
  closedByName?: string;
  carriedForward: string[];
}

export interface Station {
  _id: string;
  name: string;
}

export interface PrintAgent {
  _id: string;
  name: string;
  paired: boolean;
  online: boolean;
  pairedAt?: string | null;
  lastSeenAt?: string | null;
  pairingExpiresAt?: string | null;
}

export interface PairingCode {
  agentId: string;
  name: string;
  pairingCode: string;
  expiresAt: string;
}

export type PrinterConnection = { type: "network"; host: string; port: number } | { type: "shared"; shareName: string };

export interface Printer {
  _id: string;
  name: string;
  agentId: string;
  connection: PrinterConnection;
  paperWidth: 58 | 80;
  printsBills: boolean;
  printsUnroutedKots: boolean;
  stationIds: string[];
  isActive: boolean;
}

export type PrinterInput = Omit<Printer, "_id">;

export type PrintJobStatus = "queued" | "sent" | "printed" | "failed";

export interface PrintJob {
  _id: string;
  printerId: string;
  printerName: string;
  kind: "kot" | "bill" | "test";
  title: string;
  status: PrintJobStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  printedAt?: string | null;
}

export interface PrintingStatus {
  printersConfigured: boolean;
  billPrinterConfigured: boolean;
  autoPrintBill: boolean;
  agentsOnline: number;
  agentsTotal: number;
  failedToday: number;
}

export interface PosMenuItem {
  _id: string;
  name: string;
  price: number;
  categoryId: string;
  foodType?: FoodType;
  shortCode: string | null;
  isBestseller?: boolean;
  modifierGroups: ModifierGroup[];
  stationId: string | null;
  prices?: { takeaway: number | null; delivery: number | null; areas: Record<string, number> };
  packagingCharge?: number;
  components?: { name: string; quantity: number }[];
}

export interface PosBilling {
  restaurantName: string;
  address: string;
  gstin: string;
  taxRates: { name: string; percent: number }[];
  serviceChargePercent: number;
  footerNote: string;
}

export interface PosMenu {
  billing?: PosBilling;
  categories: { _id: string; name: string }[];
  items: PosMenuItem[];
}

export interface PosOrderSummary {
  _id: string;
  orderType: OrderType;
  tableId: string | null;
  customerName: string;
  status: OrderStatus;
  invoiceNumber: string | null;
  createdAt: string;
  itemCount: number;
  total: number;
  unsent: number;
  ready: number;
}

export interface PosTable {
  _id: string;
  code: string;
  status: TableStatus;
  occupiedAt: string | null;
  captainId: string | null;
  captainName: string | null;
  areaId?: string | null;
  orders: PosOrderSummary[];
}

export interface PosFloor {
  tables: PosTable[];
  takeaways: PosOrderSummary[];
  areas?: Area[];
}

export type StockUnit = "g" | "ml" | "pcs";

export interface StockItem {
  _id: string;
  name: string;
  unit: StockUnit;
  purchaseUnit: string;
  purchaseFactor: number;
  reorderLevel: number;
  avgCost: number;
  isActive: boolean;
  onHand: number;
  low: boolean;
  value: number;
}

export type StockItemInput = Pick<
  StockItem,
  "name" | "unit" | "purchaseUnit" | "purchaseFactor" | "reorderLevel" | "isActive"
>;

export type StockMovementType = "opening" | "purchase" | "consumption" | "reversal" | "wastage" | "adjustment";

export interface StockMovement {
  _id: string;
  stockItemId: string;
  type: StockMovementType;
  quantity: number;
  unitCost: number;
  orderId?: string | null;
  note?: string;
  byName?: string;
  createdAt: string;
}

export interface RecipeLine {
  stockItemId: string;
  quantity: number;
  key: boolean;
}

export interface RecipeModifierLine {
  groupName: string;
  label: string;
  stockItemId: string;
  quantity: number;
}

export interface RecipeRow {
  foodItemId: string;
  name: string;
  price: number;
  isActive: boolean;
  soldOutByStock: boolean;
  modifierGroups: ModifierGroup[];
  recipe: { lines: RecipeLine[]; modifierLines: RecipeModifierLine[] } | null;
  cost: number;
  costPercent: number | null;
}

export interface Vendor {
  _id: string;
  name: string;
  phone: string;
  gstin: string;
}

export interface PurchaseRecord {
  _id: string;
  vendorName: string;
  invoiceRef: string;
  purchasedAt: string;
  lines: {
    stockItemId: string;
    name: string;
    quantity: number;
    purchaseUnit: string;
    unitPrice: number;
    amount: number;
  }[];
  total: number;
  byName?: string;
}

export interface StockCountRecord {
  _id: string;
  countedAt: string;
  note: string;
  lines: {
    stockItemId: string;
    name: string;
    unit: StockUnit;
    expected: number;
    counted: number;
    variance: number;
    value: number;
  }[];
  varianceValue: number;
  byName?: string;
}

export interface UsageReport {
  from: string;
  to: string;
  lines: {
    stockItemId: string;
    name: string;
    unit: StockUnit;
    purchased: number;
    consumed: number;
    wasted: number;
    adjusted: number;
    consumedValue: number;
    wastedValue: number;
  }[];
  consumedValue: number;
  wastedValue: number;
}

export interface CustomerSummary {
  _id: string;
  phone: string;
  name: string;
  birthday: string;
  anniversary: string;
  visitCount: number;
  totalSpend: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  tags: string[];
  marketingConsent: boolean;
  points: number;
  pointsValue: number;
  expiringSoon: number;
}

export interface LoyaltySettings {
  enabled: boolean;
  pointsPer100: number;
  pointValue: number;
  minRedeem: number;
  expiryDays: number;
}

export interface BirthdaySmsSettings {
  enabled: boolean;
  /** Placeholders {name} and {restaurant} are substituted server-side before sending. */
  template: string;
}

export interface SmsTemplate {
  _id: string;
  name: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmsCampaign {
  _id: string;
  message: string;
  recipientCount: number;
  sentCount: number;
  sentBy: string;
  createdAt: string;
}

export interface OrderCustomer {
  customer: CustomerSummary | null;
  redeem: { points: number; amount: number } | null;
  loyalty: Pick<LoyaltySettings, "enabled" | "pointValue" | "minRedeem">;
  credit?: { balance: number; creditLimit: number | null } | null;
}

export interface CreditEntry {
  _id: string;
  type: "charge" | "payment" | "reverse";
  amount: number;
  invoiceNumber?: string;
  method?: "cash" | "upi" | "card" | "online";
  reference?: string;
  note?: string;
  byName?: string;
  createdAt: string;
}

export interface CustomerCredit {
  balance: number;
  creditLimit: number | null;
  entries: CreditEntry[];
}

export interface CustomerDue {
  customerId: string;
  name: string;
  phone: string;
  creditLimit: number | null;
  balance: number;
  lastAt: string;
}

export interface LoyaltyEntry {
  _id: string;
  type: "earn" | "redeem" | "reverse" | "expire" | "adjust";
  points: number;
  note?: string;
  expiresAt?: string | null;
  createdAt: string;
}

export interface CustomerProfile {
  customer: CustomerSummary;
  orders: {
    _id: string;
    orderType: OrderType;
    status: OrderStatus;
    invoiceNumber: string | null;
    date: string;
    total: number | null;
    pointsUsed: number;
  }[];
  ledger: LoyaltyEntry[];
}

export interface BillShare {
  url: string;
  whatsappUrl: string;
  expiresAt: string;
  hasPhone: boolean;
}

export interface PublicBill {
  restaurant: { name: string; address: string; gstin: string; fssaiLicense: string; logoUrl: string };
  order: {
    invoiceNumber: string;
    billedAt: string;
    customerName: string;
    orderType: OrderType;
    status: OrderStatus;
    voided: boolean;
    paymentMethod?: PaymentMethod;
    couponCode: string | null;
  };
  items: { foodName: string; quantity: number; unitPrice: number; total: number; complimentary: boolean }[];
  totals: InvoiceTotals;
}

export interface BookingSettings {
  enabled: boolean;
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
  slotMinutes: number;
}

export type BookingStatus = "pending" | "confirmed" | "seated" | "cancelled" | "no_show";

export interface Booking {
  _id: string;
  customerName: string;
  phone: string;
  phoneDisplay?: string;
  partySize: number;
  bookingDate: string; // "YYYY-MM-DD"
  slotStart: string;
  slotEnd: string;
  tableId: string | null;
  tableCode?: string | null;
  status: BookingStatus;
  notes: string;
  createdByName?: string;
  confirmedAt: string | null;
  seatedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingAvailabilitySlot {
  slotStart: string; // "HH:mm"
  slotEnd: string;
  available: boolean;
  remaining: number;
}

export interface BookingsForDate {
  date: string;
  bookings: Booking[];
}

export type DishClass = "star" | "workhorse" | "puzzle" | "dog" | "unknown";

export interface DishInsight {
  foodItemId: string;
  name: string;
  category: string;
  isActive: boolean;
  quantity: number;
  revenue: number;
  avgPrice: number;
  cost: number | null;
  margin: number | null;
  marginPercent: number | null;
  totalMargin: number | null;
  mixPercent: number;
  popular: boolean;
  profitable: boolean | null;
  class: DishClass;
}

export interface MenuEngineeringReport {
  days: number;
  since: string;
  totals: { quantity: number; revenue: number; margin: number; dishesWithoutRecipe: number };
  thresholds: { popularityMixPercent: number; avgMargin: number | null };
  counts: Record<DishClass, number>;
  dishes: DishInsight[];
}

export interface MenuRecommendations {
  popular: string[];
  pairs: Record<string, string[]>;
}
