import { describeError, logger } from "./logger";

export type TargetLang = (typeof SUPPORTED_LANGS)[number];

const LT_URL = process.env.TRANSLATE_URL;

const LT_KEY = process.env.TRANSLATE_API_KEY;

export const SUPPORTED_LANGS = ["kn", "hi"] as const;

async function myMemory(text: string, to: TargetLang): Promise<string | null> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${to}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
  const data = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: number };
  if (data.responseStatus && data.responseStatus !== 200) return null;
  const t = data.responseData?.translatedText?.trim();
  if (!t) return null;
  // MyMemory sometimes returns an in-band warning instead of a translation.
  if (/MYMEMORY WARNING|QUOTA|PLEASE SELECT|INVALID/i.test(t)) return null;
  return t;
}

const changed = (a: string, b: string) => a.trim().toLowerCase() !== b.trim().toLowerCase();

export async function translateText(text: string, to: TargetLang): Promise<string> {
  const trimmed = (text || "").trim();
  if (!trimmed) return "";

  try {
    if (LT_URL) {
      const res = await fetch(LT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: trimmed,
          source: "en",
          target: to,
          format: "text",
          ...(LT_KEY ? { api_key: LT_KEY } : {}),
        }),
        signal: AbortSignal.timeout(9000),
      });
      const data = (await res.json()) as { translatedText?: string };
      return data.translatedText || trimmed;
    }

    const whole = await myMemory(trimmed, to);
    if (whole && changed(whole, trimmed)) return whole;

    const words = trimmed.split(/\s+/).slice(0, 8);
    if (words.length > 1) {
      const parts: string[] = [];
      for (const w of words) {
        const tw = await myMemory(w, to);
        parts.push(tw && changed(tw, w) ? tw : w);
      }
      const joined = parts.join(" ");
      if (changed(joined, trimmed)) return joined;
    }

    return whole || trimmed;
  } catch (err) {
    logger.warn("translate: provider failed", { to, ...describeError(err) });
    return trimmed;
  }
}
