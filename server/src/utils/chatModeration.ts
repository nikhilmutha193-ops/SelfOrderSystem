/**
 * Lightweight content filter for the table<->staff chat. It catches abusive and
 * violent language so guests can't hurl slurs at staff (and staff can't at guests).
 *
 * Detection is token-based: the text is split on non-letter boundaries and each word
 * is checked against the banned set, so "class" or "Scunthorpe" never trip a substring
 * match. Simple leet substitutions (@->a, 0->o, etc.) are folded in so "f@ck" is caught
 * too. Matching is whole-word, which is the right trade-off for a small restaurant chat:
 * it won't catch every creative spelling, but it won't mangle innocent messages either.
 */

// Base list of clearly abusive / violent terms. Admins can extend this with their own
// words (e.g. local-language slurs) via Restaurant Settings.
const BASE_BANNED: string[] = [
  "fuck", "fucker", "fucking", "motherfucker", "shit", "bullshit", "bitch", "bastard",
  "asshole", "dickhead", "prick", "cunt", "slut", "whore", "wanker", "bollocks",
  "nigger", "nigga", "faggot", "retard", "chutiya", "chutiye", "bhosdike", "bhosdi",
  "madarchod", "behenchod", "bhenchod", "gaandu", "gandu", "randi", "harami", "kutta",
  "kill", "murder", "rape", "stab", "shoot", "bomb", "behead", "lynch", "slaughter",
];

const LEET: Record<string, string> = { "@": "a", "$": "s", "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" };

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .split("")
    .map((ch) => LEET[ch] ?? ch)
    .join("");
}

/** Detection variants of a token: the normalized form, and one with repeated letters
 * squeezed to a single ("shiiit" -> "shit", "fuuuck" -> "fuck") to blunt padding evasion. */
function tokenVariants(token: string): string[] {
  const norm = normalizeToken(token);
  const squeezed = norm.replace(/(.)\1+/g, "$1");
  return norm === squeezed ? [norm] : [norm, squeezed];
}

export type ChatModerationMode = "mask" | "block";

export interface ChatModerationConfig {
  enabled: boolean;
  mode: ChatModerationMode;
  customWords: string[];
}

export interface ModerationResult {
  /** The message with banned words masked (only differs from input when flagged and masking). */
  clean: string;
  /** True if any banned word was found. */
  flagged: boolean;
}

export function moderateMessage(text: string, config: ChatModerationConfig): ModerationResult {
  if (!config.enabled) return { clean: text, flagged: false };

  const banned = new Set<string>([
    ...BASE_BANNED,
    ...config.customWords.map((w) => normalizeToken(w.trim())).filter(Boolean),
  ]);

  let flagged = false;
  const clean = text.replace(/[A-Za-z0-9@$]+/g, (word) => {
    if (tokenVariants(word).some((v) => banned.has(v))) {
      flagged = true;
      return "*".repeat(word.length);
    }
    return word;
  });

  return { clean, flagged };
}
