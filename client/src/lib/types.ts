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
}

export interface MenuSubcategory {
  _id: string;
  name: string;
  description?: string;
  foodItems: MenuFoodItem[];
}

export interface MenuCategory {
  _id: string;
  name: string;
  description?: string;
  subcategories: MenuSubcategory[];
}

export interface TableRow {
  _id: string;
  code: string;
  password?: string;
  qrToken?: string;
  status: "available" | "occupied";
  /** Shared walk-in/counter table: never marked occupied, no seating lock. */
  isGuest?: boolean;
}

export interface ChefRow {
  _id: string;
  username: string;
  password?: string;
}

/** "delivery" is retained for orders placed before take-away replaced it. */
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
  /** Retained for orders placed while the Jain option existed. */
  isJain: boolean;
  status: OrderItemStatus;
  kotRound: number | null;
  tokenNumber: number | null;
  kotPrintedAt: string | null;
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
}

export interface KotQueueGroup {
  order: Order;
  items: OrderItem[];
  /** Lowest token number in this group; null until a ticket is printed. */
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
  foodItemId: string;
  name: string;
  price: number;
  quantity: number;
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
