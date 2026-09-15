import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/apiClient";
import type { DashboardSummary } from "../lib/types";

interface Toast {
  id: number;
  text: string;
}

let toastId = 0;
let audioCtx: AudioContext | null = null;

function playBellSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    gain.connect(audioCtx.destination);

    // two overtones for a bell-like "ding" rather than a flat beep
    [988, 1480].forEach((freq) => {
      const osc = audioCtx!.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.9);
    });
  } catch {
    // Web Audio unavailable/blocked - the toast still shows visually either way.
  }
}

export default function NotificationCenter() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prev = useRef<DashboardSummary | null>(null);

  useEffect(() => {
    function poll() {
      api
        .get<DashboardSummary>("/dashboard/summary")
        .then((res) => {
          const next = res.data;
          const last = prev.current;
          if (last) {
            const pushToast = (text: string) => {
              const id = ++toastId;
              setToasts((t) => [...t, { id, text }]);
              playBellSound();
              setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
            };
            if (next.openOrdersToday > last.openOrdersToday) pushToast("New order placed");
            if (next.pendingKotItems > last.pendingKotItems) pushToast("New items ready to send to kitchen");
            if (next.unreadChatCount > last.unreadChatCount) pushToast("New message from a table");
          }
          prev.current = next;
          setSummary(next);
        })
        .catch(() => {
          // Silently skip - the rest of the admin panel already surfaces auth/network errors.
        });
    }
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, []);

  const badgeCount = (summary?.pendingKotItems || 0) + (summary?.unreadChatCount || 0);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"
          />
        </svg>
        {badgeCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
            <p className="mb-2 text-sm font-semibold text-slate-800">Notifications</p>
            <div className="flex flex-col gap-2 text-sm">
              <Link
                to="/admin/kot"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="text-slate-600">Items waiting for KOT</span>
                <span className={`font-semibold ${summary?.pendingKotItems ? "text-orange-600" : "text-slate-400"}`}>
                  {summary?.pendingKotItems ?? 0}
                </span>
              </Link>
              <Link
                to="/admin/messages"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="text-slate-600">Unread table messages</span>
                <span className={`font-semibold ${summary?.unreadChatCount ? "text-orange-600" : "text-slate-400"}`}>
                  {summary?.unreadChatCount ?? 0}
                </span>
              </Link>
              <Link
                to="/admin/orders?type=dine-in"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="text-slate-600">Open orders today</span>
                <span className="font-semibold text-slate-700">{summary?.openOrdersToday ?? 0}</span>
              </Link>
            </div>
          </div>
        </>
      )}

      <div className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-md border border-orange-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-lg"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-orange-600" />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
