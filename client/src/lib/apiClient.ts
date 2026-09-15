import axios from "axios";
import type { Role } from "./types";

export const api = axios.create({ baseURL: "/api" });

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

export function activateStoredAuth(role: Role): string | null {
  const token = getStoredToken(role);
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

export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
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
