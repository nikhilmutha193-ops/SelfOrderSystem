import axios from "axios";
import type { Role } from "./types";
import { compressImage } from "./imageCompress";
import { log } from "./logger";

// Falls back to a same-origin path so the Vite dev proxy and the nginx container
// keep working; deployments set VITE_API_BASE_URL to the backend's absolute URL.
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || "/api" });

interface ActiveAuth {
  role: Role;
  token: string;
}

let activeAuth: ActiveAuth | null = null;

export function setActiveAuth(auth: ActiveAuth | null) {
  activeAuth = auth;
}

api.interceptors.request.use((config) => {
  if (activeAuth) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${activeAuth.token}`;
  }
  return config;
});

const LOGIN_PATH: Record<Role, string> = {
  admin: "/admin/login",
  chef: "/chef/login",
  table: "/order",
};

/** Logging in is allowed to 401 - that's a wrong password, not an expired session. */
const LOGIN_ENDPOINTS = ["/auth/admin/login", "/auth/chef/login", "/auth/table/login"];

/**
 * A 401 here is an expected, harmless outcome - not a real auth problem - the moment this
 * table session has already been ended (e.g. a double-tap on "Change"/"Back" sends this
 * twice; the first call already released the session, so the second correctly 401s). Forcing
 * a full "your session expired" logout over that would be a false alarm for something that
 * already succeeded.
 */
const SELF_RELEASE_ENDPOINT = "/tables/session/release";

/**
 * A token that has expired is still *present*, so route guards happily render the
 * page and every request then fails. Drop the dead session and send the user back
 * to the right login instead of leaving them on a broken screen.
 */
function handleExpiredSession(role: Role) {
  clearStoredToken(role);
  setActiveAuth(null);
  markExpired(role);
  const target = `${LOGIN_PATH[role]}?expired=1`;
  if (!window.location.pathname.startsWith(LOGIN_PATH[role])) {
    window.location.replace(target);
  }
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { config, response } = error ?? {};
    const url: string = config?.url ?? "";
    if (
      response?.status === 401 &&
      activeAuth &&
      !LOGIN_ENDPOINTS.some((p) => url.includes(p)) &&
      !url.includes(SELF_RELEASE_ENDPOINT)
    ) {
      log.warn("session expired - clearing stored auth", { role: activeAuth.role, url });
      handleExpiredSession(activeAuth.role);
    }
    log.error("api request failed", {
      method: config?.method?.toUpperCase(),
      url: config?.url,
      status: response?.status ?? "network",
      // Set by the server's request logger - quoting it locates the matching server log.
      requestId: response?.headers?.["x-request-id"],
      serverMessage: (response?.data as { message?: string } | undefined)?.message,
    });
    return Promise.reject(error);
  }
);

const TOKEN_KEYS: Record<Role, string> = {
  admin: "selforder_admin_token",
  chef: "selforder_chef_token",
  table: "selforder_table_token",
};

export function getStoredToken(role: Role): string | null {
  return localStorage.getItem(TOKEN_KEYS[role]);
}

export function storeToken(role: Role, token: string) {
  localStorage.setItem(TOKEN_KEYS[role], token);
}

export function clearStoredToken(role: Role) {
  localStorage.removeItem(TOKEN_KEYS[role]);
}

const EXPIRED_KEY = (role: Role) => `selforder_expired_${role}`;

/**
 * Recorded rather than returned, because clearing the token is what proves it
 * expired - and a second read (React StrictMode re-runs effects) would find the
 * token already gone and wrongly conclude the session was simply absent.
 */
function markExpired(role: Role) {
  try {
    sessionStorage.setItem(EXPIRED_KEY(role), "1");
  } catch {
    // Private mode with storage blocked - the redirect still happens, just without the notice.
  }
}

export function wasSessionExpired(role: Role): boolean {
  try {
    return sessionStorage.getItem(EXPIRED_KEY(role)) === "1";
  } catch {
    return false;
  }
}

export function clearExpiredFlag(role: Role) {
  try {
    sessionStorage.removeItem(EXPIRED_KEY(role));
  } catch {
    // ignore
  }
}

/** True only when the token carries an `exp` that has already passed. */
export function isTokenExpired(token: string): boolean {
  const payload = decodeToken<{ exp?: number }>(token);
  if (!payload?.exp) return false; // no exp claim - let the server decide
  return payload.exp * 1000 <= Date.now();
}

export function activateStoredAuth(role: Role): string | null {
  const token = getStoredToken(role);
  if (token && isTokenExpired(token)) {
    clearStoredToken(role);
    setActiveAuth(null);
    markExpired(role);
    return null;
  }
  setActiveAuth(token ? { role, token } : null);
  return token;
}

export function decodeToken<T = Record<string, unknown>>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as T;
  } catch {
    return null;
  }
}

/** Vercel rejects request bodies above 4.5MB before they reach the API. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type UploadFolder = "banner" | "logo" | "product" | "team" | "awards";

export async function uploadImage(file: File, folder: UploadFolder): Promise<string> {
  const compressed = await compressImage(file);
  if (compressed.size > MAX_UPLOAD_BYTES) {
    throw new Error("That image is too large to upload. Please use one under 4MB.");
  }

  const formData = new FormData();
  formData.append("folder", folder); // multer only sees fields appended before the file
  formData.append("image", compressed);
  const res = await api.post<{ url: string }>("/uploads/image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.url;
}

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
