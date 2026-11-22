import { Dialog } from "../../../shared/ui/Dialog";
import { Button } from "../../../shared/ui/ui";

interface Shortcut {
  keys: string;
  does: string;
}

/** Every POS shortcut, shown by F1 or ?. Keep it in step with the key handler in Pos.tsx. */
const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: "Order",
    items: [
      { keys: "F2", does: "Search dishes (Enter adds the first match)" },
      { keys: "0-9", does: "Quantity for the next dish you tap" },
      { keys: "F8", does: "Save and send the KOT" },
      { keys: "F9", does: "Bill and print the invoice" },
      { keys: "F10", does: "Settle: take the payment" },
      { keys: "Alt + H", does: "Hold the order" },
      { keys: "Alt + K", does: "KOT + invoice as two slips" },
      { keys: "Esc", does: "Clear the search and the quantity" },
    ],
  },
  {
    group: "Go to",
    items: [
      { keys: "Alt + 1", does: "Dine-in (table map)" },
      { keys: "Alt + 2", does: "Takeaway / New order (a fresh one)" },
      { keys: "Alt + 3", does: "Cashier" },
      { keys: "Alt + C", does: "Cash drawer" },
      { keys: "F1 or ?", does: "This list" },
    ],
  },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Keyboard shortcuts"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col gap-4 text-sm">
        {SHORTCUTS.map((group) => (
          <section key={group.group}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.group}</h3>
            <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
              {group.items.map((s) => (
                <li key={s.keys} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-slate-700">{s.does}</span>
                  <kbd className="shrink-0 rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-800">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
