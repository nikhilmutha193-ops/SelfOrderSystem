import type { Lang } from "../../lib/i18n";

// The kiosk's own words. Dish names and descriptions come from the menu's translations (tr()).
const STRINGS = {
  touchToOrder: { en: "Touch to order", kn: "ಆರ್ಡರ್ ಮಾಡಲು ಸ್ಪರ್ಶಿಸಿ", hi: "ऑर्डर करने के लिए छुएं" },
  whereEat: { en: "Where will you eat today?", kn: "ಇಂದು ಎಲ್ಲಿ ತಿನ್ನುತ್ತೀರಿ?", hi: "आज आप कहाँ खाएँगे?" },
  eatHere: { en: "Eat here", kn: "ಇಲ್ಲೇ ತಿನ್ನಿ", hi: "यहीं खाएँ" },
  takeAway: { en: "Take away", kn: "ಪಾರ್ಸೆಲ್", hi: "पैक करके ले जाएँ" },
  startOver: { en: "Start over", kn: "ಮತ್ತೆ ಪ್ರಾರಂಭಿಸಿ", hi: "फिर से शुरू करें" },
  viewOrder: { en: "View order", kn: "ಆರ್ಡರ್ ನೋಡಿ", hi: "ऑर्डर देखें" },
  items: { en: "{n} items", kn: "{n} ಐಟಂಗಳು", hi: "{n} आइटम" },
  item: { en: "1 item", kn: "1 ಐಟಂ", hi: "1 आइटम" },
  added: { en: "Added", kn: "ಸೇರಿಸಲಾಗಿದೆ", hi: "जोड़ा गया" },
  yourOrder: { en: "Your order", kn: "ನಿಮ್ಮ ಆರ್ಡರ್", hi: "आपका ऑर्डर" },
  emptyOrder: { en: "Your order is empty", kn: "ನಿಮ್ಮ ಆರ್ಡರ್ ಖಾಲಿಯಾಗಿದೆ", hi: "आपका ऑर्डर खाली है" },
  addMore: { en: "Add more", kn: "ಇನ್ನಷ್ಟು ಸೇರಿಸಿ", hi: "और जोड़ें" },
  continueToPay: { en: "Continue to pay", kn: "ಪಾವತಿಗೆ ಮುಂದುವರಿಸಿ", hi: "भुगतान के लिए आगे बढ़ें" },
  goesWell: { en: "Goes well with your order", kn: "ನಿಮ್ಮ ಆರ್ಡರ್‌ಗೆ ಚೆನ್ನಾಗಿ ಹೊಂದುತ್ತದೆ", hi: "आपके ऑर्डर के साथ अच्छा लगेगा" },
  total: { en: "Total", kn: "ಒಟ್ಟು", hi: "कुल" },
  taxNote: { en: "Taxes are added on the next screen", kn: "ತೆರಿಗೆಗಳನ್ನು ಮುಂದಿನ ಪರದೆಯಲ್ಲಿ ಸೇರಿಸಲಾಗುತ್ತದೆ", hi: "टैक्स अगली स्क्रीन पर जोड़ा जाएगा" },
  howPay: { en: "How would you like to pay?", kn: "ಹೇಗೆ ಪಾವತಿಸಲು ಬಯಸುತ್ತೀರಿ?", hi: "आप कैसे भुगतान करना चाहेंगे?" },
  payNow: { en: "Pay now", kn: "ಈಗ ಪಾವತಿಸಿ", hi: "अभी भुगतान करें" },
  payNowHint: { en: "UPI, card or wallet", kn: "UPI, ಕಾರ್ಡ್ ಅಥವಾ ವಾಲೆಟ್", hi: "UPI, कार्ड या वॉलेट" },
  payCounter: { en: "Pay at the counter", kn: "ಕೌಂಟರ್‌ನಲ್ಲಿ ಪಾವತಿಸಿ", hi: "काउंटर पर भुगतान करें" },
  payCounterHint: { en: "Cash or card at the counter", kn: "ಕೌಂಟರ್‌ನಲ್ಲಿ ನಗದು ಅಥವಾ ಕಾರ್ಡ್", hi: "काउंटर पर नकद या कार्ड" },
  back: { en: "Back", kn: "ಹಿಂದೆ", hi: "वापस" },
  oneMoment: { en: "One moment…", kn: "ಒಂದು ಕ್ಷಣ…", hi: "एक क्षण…" },
  yourNumber: { en: "Your order number", kn: "ನಿಮ್ಮ ಆರ್ಡರ್ ಸಂಖ್ಯೆ", hi: "आपका ऑर्डर नंबर" },
  paidMessage: {
    en: "Thank you! We'll show your number on the screen when your order is ready.",
    kn: "ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ಆರ್ಡರ್ ಸಿದ್ಧವಾದಾಗ ನಿಮ್ಮ ಸಂಖ್ಯೆಯನ್ನು ಪರದೆಯಲ್ಲಿ ತೋರಿಸುತ್ತೇವೆ.",
    hi: "धन्यवाद! आपका ऑर्डर तैयार होने पर आपका नंबर स्क्रीन पर दिखेगा।",
  },
  counterMessage: {
    en: "Please pay {amount} at the counter. Your order goes to the kitchen as soon as it's paid.",
    kn: "ದಯವಿಟ್ಟು ಕೌಂಟರ್‌ನಲ್ಲಿ {amount} ಪಾವತಿಸಿ. ಪಾವತಿಸಿದ ತಕ್ಷಣ ನಿಮ್ಮ ಆರ್ಡರ್ ಅಡುಗೆಮನೆಗೆ ಹೋಗುತ್ತದೆ.",
    hi: "कृपया काउंटर पर {amount} का भुगतान करें। भुगतान होते ही आपका ऑर्डर किचन में जाएगा।",
  },
  checkLater: {
    en: "Your payment went through. Please show this number at the counter.",
    kn: "ನಿಮ್ಮ ಪಾವತಿ ಯಶಸ್ವಿಯಾಗಿದೆ. ದಯವಿಟ್ಟು ಈ ಸಂಖ್ಯೆಯನ್ನು ಕೌಂಟರ್‌ನಲ್ಲಿ ತೋರಿಸಿ.",
    hi: "आपका भुगतान हो गया। कृपया यह नंबर काउंटर पर दिखाएँ।",
  },
  printReceipt: { en: "Print receipt", kn: "ರಸೀದಿ ಮುದ್ರಿಸಿ", hi: "रसीद प्रिंट करें" },
  newOrder: { en: "Done", kn: "ಮುಗಿಯಿತು", hi: "हो गया" },
  stillThere: { en: "Are you still there?", kn: "ನೀವು ಇನ್ನೂ ಇದ್ದೀರಾ?", hi: "क्या आप अभी भी यहाँ हैं?" },
  startingOver: { en: "Starting over in {n} seconds", kn: "{n} ಸೆಕೆಂಡುಗಳಲ್ಲಿ ಮತ್ತೆ ಪ್ರಾರಂಭವಾಗುತ್ತದೆ", hi: "{n} सेकंड में फिर से शुरू होगा" },
  imHere: { en: "I'm still here", kn: "ನಾನು ಇಲ್ಲೇ ಇದ್ದೇನೆ", hi: "मैं यहीं हूँ" },
  all: { en: "All", kn: "ಎಲ್ಲಾ", hi: "सभी" },
} satisfies Record<string, Record<Lang, string>>;

export type KioskText = keyof typeof STRINGS;

export function kt(lang: Lang, key: KioskText, vars: Record<string, string | number> = {}): string {
  const text = STRINGS[key][lang] || STRINGS[key].en;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
