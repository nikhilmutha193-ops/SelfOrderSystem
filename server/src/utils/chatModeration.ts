export type ChatModerationMode = "mask" | "block";

export interface ChatModerationConfig {
  enabled: boolean;
  mode: ChatModerationMode;
  customWords: string[];
}

export interface ModerationResult {
  clean: string;
  flagged: boolean;
}

const BASE_BANNED: string[] = [
  "fuck",
  "fucker",
  "fucking",
  "motherfucker",
  "shit",
  "bullshit",
  "bitch",
  "bastard",
  "asshole",
  "dickhead",
  "prick",
  "cunt",
  "slut",
  "whore",
  "wanker",
  "bollocks",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "chutiya",
  "chutiye",
  "bhosdike",
  "bhosdi",
  "madarchod",
  "behenchod",
  "bhenchod",
  "gaandu",
  "gandu",
  "randi",
  "harami",
  "kutta",
  "kill",
  "murder",
  "rape",
  "stab",
  "shoot",
  "bomb",
  "behead",
  "lynch",
  "slaughter",
];

const LEET: Record<string, string> = { "@": "a", $: "s", "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" };

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .split("")
    .map((ch) => LEET[ch] ?? ch)
    .join("");
}

function tokenVariants(token: string): string[] {
  const norm = normalizeToken(token);
  const squeezed = norm.replace(/(.)\1+/g, "$1");
  return norm === squeezed ? [norm] : [norm, squeezed];
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
