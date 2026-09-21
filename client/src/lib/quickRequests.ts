/** Preset one-tap requests guests can send to staff without typing - shared between the
 *  inline quick-request bar on the menu and the "Quick assist" chips inside the chat panel. */
export const QUICK_REQUESTS = [
  { emoji: "🙋", label: "Call waiter", message: "I'd like to request a waiter, please." },
  { emoji: "🧹", label: "Clean table", message: "Could you please clean our table?" },
  { emoji: "💧", label: "Water bottle", message: "Could we get a water bottle, please?" },
  { emoji: "🧻", label: "Extra napkins", message: "Could we get some extra napkins, please?" },
  { emoji: "🧾", label: "Request bill", message: "Could we get the bill, please?" },
] as const;
