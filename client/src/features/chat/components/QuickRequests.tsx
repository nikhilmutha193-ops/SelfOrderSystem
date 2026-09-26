import { useState } from "react";

import { QUICK_REQUESTS } from "../../../lib/quickRequests";
import { useTableSession } from "../../../lib/useTableSession";
import { extractErrorMessage } from "../../../shared/api/client";
import { useSendChatMessage } from "../queries";

export default function QuickRequests() {
  const { orderId } = useTableSession();
  const [sendingLabel, setSendingLabel] = useState<string | null>(null);
  const [sentLabel, setSentLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sendChat = useSendChatMessage();

  if (!orderId) return null;

  async function sendRequest(req: (typeof QUICK_REQUESTS)[number]) {
    if (sendingLabel || !orderId) return;
    setSendingLabel(req.label);
    setError(null);
    try {
      await sendChat.mutateAsync({ orderId, message: req.message });
      setSentLabel(req.label);
      setTimeout(() => setSentLabel(null), 2500);
    } catch (err) {
      setError(extractErrorMessage(err));
      setTimeout(() => setError(null), 3000);
    } finally {
      setSendingLabel(null);
    }
  }

  return (
    <div className="px-4 pb-2 pt-3">
      <p className="mb-1.5 text-xs font-medium text-slate-500">Need something? Tap to notify staff</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {QUICK_REQUESTS.map((req) => (
          <button
            key={req.label}
            type="button"
            onClick={() => sendRequest(req)}
            disabled={sendingLabel === req.label}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
              sentLabel === req.label
                ? "border-green-300 bg-green-50 text-green-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span aria-hidden>{req.emoji}</span>
            {sentLabel === req.label ? "Sent!" : sendingLabel === req.label ? "Sending..." : req.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
