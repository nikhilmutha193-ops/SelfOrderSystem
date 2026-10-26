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
  field: "name" | "description",
): string {
  if (lang !== "en") {
    const t = obj.translations?.[lang]?.[field];
    if (t) return t;
  }
  return (field === "name" ? obj.name : obj.description) || "";
}

const UI = {
  menu: { en: "Menu", kn: "ಮೆನು", hi: "मेन्यू" },
  tapDish: { en: "Tap a dish for details", kn: "ವಿವರಗಳಿಗಾಗಿ ಖಾದ್ಯವನ್ನು ಒತ್ತಿ", hi: "विवरण के लिए व्यंजन पर टैप करें" },
  myOrder: { en: "My order", kn: "ನನ್ನ ಆರ್ಡರ್", hi: "मेरा ऑर्डर" },
  search: { en: "Search for dishes...", kn: "ಖಾದ್ಯಗಳನ್ನು ಹುಡುಕಿ...", hi: "व्यंजन खोजें..." },
  veg: { en: "Veg", kn: "ಸಸ್ಯಾಹಾರ", hi: "शाकाहारी" },
  bestsellers: { en: "★ Bestsellers", kn: "★ ಜನಪ್ರಿಯ", hi: "★ बेस्टसेलर" },
  sort: { en: "Sort", kn: "ವಿಂಗಡಿಸಿ", hi: "क्रम" },
  recommended: { en: "Recommended", kn: "ಶಿಫಾರಸು", hi: "अनुशंसित" },
  bestsellerFirst: { en: "Bestsellers first", kn: "ಜನಪ್ರಿಯ ಮೊದಲು", hi: "बेस्टसेलर पहले" },
  priceLowHigh: { en: "Price: Low to High", kn: "ಬೆಲೆ: ಕಡಿಮೆಯಿಂದ ಹೆಚ್ಚು", hi: "कीमत: कम से ज़्यादा" },
  priceHighLow: { en: "Price: High to Low", kn: "ಬೆಲೆ: ಹೆಚ್ಚಿನಿಂದ ಕಡಿಮೆ", hi: "कीमत: ज़्यादा से कम" },
  nameAsc: { en: "Name: A to Z", kn: "ಹೆಸರು: A ಇಂದ Z", hi: "नाम: A से Z" },
  clear: { en: "Clear", kn: "ತೆರವುಗೊಳಿಸಿ", hi: "हटाएँ" },
  add: { en: "ADD", kn: "ಸೇರಿಸಿ", hi: "जोड़ें" },
  customize: { en: "customize", kn: "ಕಸ್ಟಮೈಸ್", hi: "बदलें" },
  customizeBtn: { en: "Customize", kn: "ಕಸ್ಟಮೈಸ್", hi: "बदलें" },
  moreDetails: { en: "Details & customize", kn: "ವಿವರ ಮತ್ತು ಕಸ್ಟಮೈಸ್", hi: "जानकारी और बदलाव" },
  viewItems: { en: "View items", kn: "ಐಟಂಗಳನ್ನು ನೋಡಿ", hi: "आइटम देखें" },
  hideItems: { en: "Hide items", kn: "ಐಟಂಗಳನ್ನು ಮರೆಮಾಡಿ", hi: "आइटम छिपाएँ" },
  confirmOrder: { en: "Confirm your order", kn: "ನಿಮ್ಮ ಆರ್ಡರ್ ದೃಢೀಕರಿಸಿ", hi: "अपना ऑर्डर पक्का करें" },
  checkBelow: {
    en: "Check everything below before it goes to the kitchen.",
    kn: "ಅಡುಗೆಮನೆಗೆ ಹೋಗುವ ಮೊದಲು ಕೆಳಗಿನ ಎಲ್ಲವನ್ನೂ ಪರಿಶೀಲಿಸಿ.",
    hi: "रसोई में जाने से पहले नीचे सब कुछ जाँच लें।",
  },
  cartEmpty: { en: "Your cart is empty.", kn: "ನಿಮ್ಮ ಕಾರ್ಟ್ ಖಾಲಿಯಾಗಿದೆ.", hi: "आपकी कार्ट खाली है।" },
  total: { en: "Total", kn: "ಒಟ್ಟು", hi: "कुल" },
  addMore: { en: "Add more items", kn: "ಇನ್ನಷ್ಟು ಸೇರಿಸಿ", hi: "और आइटम जोड़ें" },
  confirmPlace: { en: "Confirm & place order", kn: "ದೃಢೀಕರಿಸಿ ಮತ್ತು ಆರ್ಡರ್ ಮಾಡಿ", hi: "पक्का करें और ऑर्डर दें" },
  placing: { en: "Placing...", kn: "ಆರ್ಡರ್ ಮಾಡಲಾಗುತ್ತಿದೆ...", hi: "ऑर्डर हो रहा है..." },
} as const;

export type UiKey = keyof typeof UI;

/** A fixed label of the guest menu page in the chosen language (English if missing). */
export function ui(lang: Lang, key: UiKey): string {
  return UI[key][lang] || UI[key].en;
}
