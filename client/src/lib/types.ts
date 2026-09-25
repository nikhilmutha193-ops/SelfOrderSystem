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

export type PrintPaperSize = "thermal58" | "thermal80" | "a5" | "a4";

export type PrintFontSize = "compact" | "normal" | "large";

export interface KotSettings {
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
  showCustomerPhone: boolean;
  footerNote: string;
  termsText: string;
  paperSize: PrintPaperSize;
  fontSize: PrintFontSize;
  showLogo: boolean;
  showUnitPrice: boolean;
  showJainTag: boolean;
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
}

export interface Category {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
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
  foodType?: FoodType;
  rating?: number;
  prepTimeMinutes?: number;
  translations?: Translations;
  modifierGroups?: ModifierGroup[];
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
  foodType?: FoodType;
  rating?: number;
  translations?: Translations;
  modifierGroups?: ModifierGroup[];
  guestRating?: number | null;
  reviewCount?: number;
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
  status: "available" | "occupied";
  isGuest?: boolean;
  occupiedAt?: string;
  autoReleaseMinutes?: number | null;
}

export interface ChefRow {
  _id: string;
  username: string;
  password?: string;
}

export type OrderType = "dine-in" | "takeaway" | "delivery";

export type OrderStatus = "open" | "closed" | "cancelled";

export type PaymentMethod = "pending" | "cash" | "online" | "card";

export type DeliveryProvider = "Swiggy" | "Zomato" | "Uber-Eats" | "Other";

export interface Order {
  _id: string;
  restaurantId: string;
  orderType: OrderType;
  tableId?: string | { _id: string; code: string };
  deliveryProvider?: DeliveryProvider;
  customerName: string;
  customerPhone: string;
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
}

export interface InvoiceTaxLine {
  name: string;
  percent: number;
  amount: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxLines: InvoiceTaxLine[];
  grandTotal: number;
}

export interface OrderDetailResponse {
  order: Order;
  items: OrderItem[];
  totals: InvoiceTotals;
  prepMessageTemplate?: string;
  prepBufferMinutes?: number;
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

export interface LandingData {
  restaurant: LandingRestaurant;
  content?: LandingContent;
  team: TeamMember[];
  bestsellers: LandingBestseller[];
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
