import axios from "axios";

import type {
  KioskConfig,
  KioskDevice,
  KioskPairingCode,
  KioskSettings,
  MenuCategory,
  MenuRecommendations,
  OnlineCheckout,
  OrderDetailResponse,
  PaymentAttemptStatus,
  PickupBoard,
  SelectedModifier,
} from "../../lib/types";
import { api } from "../../shared/api/client";
import type { RazorpayConfirmation } from "../payments/api";

const TOKEN_KEY = "selforder_kiosk_token";

export function getKioskToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setKioskToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // A kiosk without storage has to be paired again after a reload.
  }
}

// Its own axios instance: the kiosk authenticates as a device ("Kiosk <token>"), so the shared
// instance's staff token refresh and expired-session redirects must never touch it.
const kioskHttp = axios.create({ baseURL: api.defaults.baseURL });
kioskHttp.interceptors.request.use((config) => {
  const token = getKioskToken();
  if (token) config.headers.Authorization = `Kiosk ${token}`;
  return config;
});

const publicHttp = axios.create({ baseURL: api.defaults.baseURL });

export interface KioskOrderLine {
  foodItemId: string;
  quantity: number;
  note?: string;
  isJain?: boolean;
  modifiers?: Pick<SelectedModifier, "groupName" | "label">[];
}

export const kioskApi = {
  pair: (code: string) => kioskHttp.post<{ token: string; name: string }>("/kiosk/pair", { code }).then((r) => r.data),
  config: () => kioskHttp.get<KioskConfig>("/kiosk/config").then((r) => r.data),
  menu: (orderType: "dine-in" | "takeaway") =>
    kioskHttp.get<MenuCategory[]>("/menu", { params: { orderType } }).then((r) => r.data),
  recommendations: () => kioskHttp.get<MenuRecommendations>("/menu/recommendations").then((r) => r.data),
  placeOrder: (input: { orderType: "dine-in" | "takeaway"; items: KioskOrderLine[] }, idempotencyKey: string) =>
    kioskHttp
      .post<OrderDetailResponse>("/kiosk/orders", input, { headers: { "Idempotency-Key": idempotencyKey } })
      .then((r) => r.data),
  order: (orderId: string) => kioskHttp.get<OrderDetailResponse>(`/kiosk/orders/${orderId}`).then((r) => r.data),
  payAtCounter: (orderId: string) =>
    kioskHttp.post<OrderDetailResponse>(`/kiosk/orders/${orderId}/pay-at-counter`).then((r) => r.data),
  cancel: (orderId: string) => kioskHttp.post(`/kiosk/orders/${orderId}/cancel`).then((r) => r.data),
  checkout: (orderId: string) => kioskHttp.post<OnlineCheckout>(`/kiosk/orders/${orderId}/checkout`).then((r) => r.data),
  confirm: (input: RazorpayConfirmation) =>
    kioskHttp.post<{ status: PaymentAttemptStatus }>("/kiosk/razorpay/confirm", input).then((r) => r.data),
};

export const kioskAdminApi = {
  devices: () => api.get<KioskDevice[]>("/kiosk/devices").then((r) => r.data),
  createDevice: (name: string) => api.post<KioskPairingCode>("/kiosk/devices", { name }).then((r) => r.data),
  renewPairingCode: (id: string) => api.post<KioskPairingCode>(`/kiosk/devices/${id}/pairing-code`).then((r) => r.data),
  revokeDevice: (id: string) => api.delete(`/kiosk/devices/${id}`).then((r) => r.data),
  settings: () => api.get<KioskSettings>("/kiosk/settings").then((r) => r.data),
  saveSettings: (input: KioskSettings) => api.put<KioskSettings>("/kiosk/settings", input).then((r) => r.data),
};

export const pickupApi = {
  board: () => publicHttp.get<PickupBoard>("/pickup").then((r) => r.data),
};
