import { useEffect } from "react";

// The restaurant's brand colour (restaurant.brandColor) re-tints every screen. The Tailwind
// `orange-*` scale, the landing page and the guest order pages all read `--brand-*` variables
// (index.css, styles/landing/main.css, styles/order.css), whose defaults are the built-in
// terracotta. Applying a colour sets those variables on <html>; index.html re-applies the cached
// set before the first paint so pages don't flash orange.

export const DEFAULT_BRAND_COLOR = "#c4602f";

export const BRAND_PRESETS: { label: string; color: string }[] = [
  { label: "Terracotta", color: "" },
  { label: "Red", color: "#c0262d" },
  { label: "Rose", color: "#be185d" },
  { label: "Purple", color: "#7c3aed" },
  { label: "Indigo", color: "#4338ca" },
  { label: "Blue", color: "#1d4ed8" },
  { label: "Teal", color: "#0f766e" },
  { label: "Green", color: "#15803d" },
  { label: "Mustard", color: "#a16207" },
  { label: "Coffee", color: "#7c4a1e" },
  { label: "Charcoal", color: "#334155" },
];

const CACHE_KEY = "selforder_brand_v1";
const HEX = /^#[0-9a-f]{6}$/i;
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
// OKLCH lightness of each step and its chroma relative to the strongest step, measured from the
// built-in palette, so every brand colour gets the same contrast steps as the default.
const LIGHTNESS = [0.97, 0.931, 0.86, 0.777, 0.685, 0.602, 0.517, 0.441, 0.38, 0.333, 0.227];
const CHROMA = [0.09, 0.24, 0.49, 0.73, 0.94, 1, 0.91, 0.77, 0.63, 0.5, 0.32];
const BUTTON_STEP = 6; // bg-orange-600 is the primary button, always with white text
// Darker than this and the hover/pressed shades below the button would all look the same.
const MIN_BUTTON_LIGHTNESS = 0.3;

type Lch = [l: number, c: number, h: number];

export function isBrandColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function rgbToHex(rgb: number[]): string {
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToLch([r, g, b]: number[]): Lch {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

/** Linear sRGB; components outside 0..1 mean the colour is out of gamut. */
function lchToLinear([L, C, h]: Lch): number[] {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** The colour, with chroma reduced until it fits in sRGB. */
function lchToHex([L, C, h]: Lch): string {
  const fits = (c: number) => lchToLinear([L, c, h]).every((v) => v >= -0.0001 && v <= 1.0001);
  let chroma = C;
  if (!fits(chroma)) {
    let low = 0;
    for (let i = 0; i < 20; i++) {
      const mid = (low + chroma) / 2;
      if (fits(mid)) low = mid;
      else chroma = mid;
    }
    chroma = low;
  }
  return rgbToHex(lchToLinear([L, chroma, h]).map(fromLinear));
}

function contrastWithWhite(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

/**
 * The 11-step scale for a brand colour. When white text stays readable on the colour it becomes the
 * button shade itself (a very dark one is lifted to MIN_BUTTON_LIGHTNESS) and the darker steps
 * scale down from it; a light colour keeps the default steps, so its buttons come out darker.
 */
export function brandScale(color: string): string[] {
  const [l, c, h] = rgbToLch(hexToRgb(color));
  const peak = c / CHROMA[BUTTON_STEP];
  const lightness = [...LIGHTNESS];
  let button: string | null = null;
  const anchor = Math.max(l, MIN_BUTTON_LIGHTNESS);
  if (anchor < LIGHTNESS[BUTTON_STEP - 1]) {
    const candidate = anchor === l ? color.toLowerCase() : lchToHex([anchor, c, h]);
    if (contrastWithWhite(candidate) >= 4.5) {
      button = candidate;
      for (let i = BUTTON_STEP; i < LIGHTNESS.length; i++) {
        lightness[i] = (anchor * LIGHTNESS[i]) / LIGHTNESS[BUTTON_STEP];
      }
    }
  }
  const scale = lightness.map((step, i) => lchToHex([step, peak * CHROMA[i], h]));
  if (button) scale[BUTTON_STEP] = button;
  return scale;
}

function brandVariables(color: string): Record<string, string> {
  const scale = brandScale(color);
  const vars: Record<string, string> = {};
  STEPS.forEach((step, i) => (vars[`--brand-${step}`] = scale[i]));
  // The landing and guest order pages use four named shades.
  vars["--brand-primary"] = scale[6];
  vars["--brand-primary-dark"] = scale[7];
  vars["--brand-primary-light"] = scale[4];
  vars["--brand-primary-tint"] = scale[1];
  return vars;
}

const VARIABLE_NAMES = Object.keys(brandVariables(DEFAULT_BRAND_COLOR));

/**
 * Re-tints the app with `color`, or restores the built-in palette for "" or an invalid value.
 * With `persist` (the default) the variables are cached for index.html's first-paint script.
 */
export function applyBrandColor(color: string | null | undefined, { persist = true } = {}) {
  const root = document.documentElement.style;
  VARIABLE_NAMES.forEach((name) => root.removeProperty(name));
  const vars = isBrandColor(color) ? brandVariables(color) : null;
  if (vars) Object.entries(vars).forEach(([name, value]) => root.setProperty(name, value));
  if (!persist) return;
  try {
    if (vars) localStorage.setItem(CACHE_KEY, JSON.stringify(vars));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // Without storage the colour still applies; pages just start terracotta until it loads.
  }
}

/** Shows an unsaved colour across the app while a settings page is open, then puts the saved one back. */
export function useBrandPreview(draft: string, saved: string | null) {
  useEffect(() => {
    if (saved === null) return;
    applyBrandColor(draft, { persist: false });
    return () => applyBrandColor(saved, { persist: false });
  }, [draft, saved]);
}

/**
 * The most prominent colourful shade in an image, or null when it is all white, black or grey.
 * Throws when the image can't be loaded or read (for example a cross-origin URL without CORS).
 */
export async function colorFromImage(src: string): Promise<string | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Group colourful pixels into 10° hue buckets weighted by chroma, so a small vivid mark beats
  // a large pale background, then average the pixels of the strongest neighbourhood of buckets.
  const buckets = Array.from({ length: 36 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    opaque += 1;
    const rgb = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
    const [l, c, h] = rgbToLch(rgb);
    if (c < 0.04 || l > 0.95 || l < 0.15) continue;
    const bucket = buckets[Math.floor((((h % 360) + 360) % 360) / 10) % 36];
    bucket.weight += c;
    bucket.r += rgb[0] * c;
    bucket.g += rgb[1] * c;
    bucket.b += rgb[2] * c;
  }
  const total = buckets.reduce((sum, b) => sum + b.weight, 0);
  if (opaque === 0 || total < opaque * 0.004) return null;

  let best = 0;
  let bestScore = -1;
  buckets.forEach((_, i) => {
    const score = [-1, 0, 1].reduce((sum, d) => sum + buckets[(i + d + 36) % 36].weight, 0);
    if (score > bestScore) [best, bestScore] = [i, score];
  });
  const picked = [-1, 0, 1].map((d) => buckets[(best + d + 36) % 36]);
  const weight = picked.reduce((sum, b) => sum + b.weight, 0);
  return rgbToHex([
    picked.reduce((sum, b) => sum + b.r, 0) / weight,
    picked.reduce((sum, b) => sum + b.g, 0) / weight,
    picked.reduce((sum, b) => sum + b.b, 0) / weight,
  ]);
}
