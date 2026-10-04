import { CircleHelp, TriangleAlert } from "lucide-react";
import { useSyncExternalStore } from "react";

import { currentConfirm, settleConfirm, subscribeConfirm } from "./confirm";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

export default function ConfirmHost() {
  const pending = useSyncExternalStore(subscribeConfirm, currentConfirm, currentConfirm);
  if (!pending) return null;

  const danger = (pending.tone ?? "danger") === "danger";
  const Icon = danger ? TriangleAlert : CircleHelp;

  return (
    <Dialog
      key={pending.id}
      open
      size="sm"
      onClose={() => settleConfirm(pending.id, false)}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => settleConfirm(pending.id, false)}>
            {pending.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            autoFocus
            onClick={() => settleConfirm(pending.id, true)}
          >
            {pending.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      <div role="alertdialog" aria-label={pending.title} className="flex gap-4 pt-1">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            danger ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"
          }`}
        >
          <Icon size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{pending.title}</h2>
          {pending.message && <div className="mt-1 text-sm text-slate-600">{pending.message}</div>}
        </div>
      </div>
    </Dialog>
  );
}
