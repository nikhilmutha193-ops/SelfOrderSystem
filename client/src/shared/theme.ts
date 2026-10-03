import { useEffect, useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";

const KEY = "selforder_staff_theme";
const listeners = new Set<() => void>();
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === "light") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    return;
  } finally {
    listeners.forEach((listener) => listener());
  }
}

function subscribePreference(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeSystem(listener: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribePreference, readPreference, () => "light");
}

export function useResolvedTheme(): "light" | "dark" {
  const preference = useThemePreference();
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false
  );
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export function useStaffTheme() {
  const theme = useResolvedTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);
  return theme;
}
