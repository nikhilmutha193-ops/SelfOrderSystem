import type { Translations } from "./types";

export type Lang = "en" | "kn" | "hi";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "hi", label: "हिन्दी" },
];

const KEY = "selforder_menu_lang";

export function loadLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "kn" || v === "hi") return v;
  } catch {}
  return "en";
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {}
}

export function tr(
  obj: { name: string; description?: string; translations?: Translations },
  lang: Lang,
  field: "name" | "description"
): string {
  if (lang !== "en") {
    const t = obj.translations?.[lang]?.[field];
    if (t) return t;
  }
  return (field === "name" ? obj.name : obj.description) || "";
}
