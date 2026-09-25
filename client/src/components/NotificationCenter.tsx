import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../lib/apiClient";
import type { DashboardSummary } from "../lib/types";

interface Toast {
  id: number;
  text: string;
}

type Note = { freq: number; at: number; dur: number; type?: OscillatorType };

let toastId = 0;

let audioCtx: AudioContext | null = null;

function showDesktopNotification(text: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Restaurant admin", { body: text, tag: "resto-admin" });
    }
  } catch {
    // Notifications unavailable/blocked - the toast + sound still fire.
  }
}

// Each admin picks the tone their own device plays; these are the choices.
export const NOTIFICATION_TONES: { id: string; label: string; notes: Note[] }[] = [
  {
    id: "bell",
    label: "Bell",
    notes: [
      { freq: 988, at: 0, dur: 0.9 },
      { freq: 1480, at: 0, dur: 0.9 },
    ],
  },
  {
    id: "chime",
    label: "Chime (3 notes)",
    notes: [
      { freq: 784, at: 0, dur: 0.4 },
      { freq: 988, at: 0.16, dur: 0.4 },
      { freq: 1319, at: 0.32, dur: 0.7 },
    ],
  },
  { id: "ding", label: "Ding", notes: [{ freq: 1047, at: 0, dur: 0.6 }] },
  {
    id: "doorbell",
    label: "Doorbell (ding-dong)",
    notes: [
      { freq: 660, at: 0, dur: 0.5 },
      { freq: 523, at: 0.35, dur: 0.7 },
    ],
  },
  {
    id: "marimba",
    label: "Marimba (soft)",
    notes: [
      { freq: 523, at: 0, dur: 0.35, type: "triangle" },
      { freq: 659, at: 0.12, dur: 0.35, type: "triangle" },
      { freq: 784, at: 0.24, dur: 0.5, type: "triangle" },
    ],
  },
  {
    id: "beep",
    label: "Beep",
    notes: [
      { freq: 880, at: 0, dur: 0.12, type: "square" },
      { freq: 880, at: 0.2, dur: 0.12, type: "square" },
    ],
  },
];

const TONE_KEY = "admin_notif_tone";

const VOLUME_KEY = "admin_notif_volume";

const DEFAULT_TONE = "bell";

const DEFAULT_VOLUME = 0.25;

function readTone(): string {
  try {
    return localStorage.getItem(TONE_KEY) || DEFAULT_TONE;
  } catch {
    return DEFAULT_TONE;
  }
}

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function playTone(toneId: string, volume: number) {
  if (volume <= 0) return; // muted
  const tone = NOTIFICATION_TONES.find((t) => t.id === toneId) ?? NOTIFICATION_TONES[0];
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;

    tone.notes.forEach((note) => {
      const start = now + note.at;
      const end = start + note.dur;
      const gain = audioCtx!.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.connect(audioCtx!.destination);

      const osc = audioCtx!.createOscillator();
      osc.type = note.type ?? "sine";
      osc.frequency.value = note.freq;
      osc.connect(gain);
      osc.start(start);
      osc.stop(end);
    });
  } catch {
    // Web Audio unavailable/blocked - the toast still shows visually either way.
  }
}

function playNotificationSound() {
  playTone(readTone(), readVolume());
}

export default function NotificationCenter() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prev = useRef<DashboardSummary | null>(null);
  const [clearing, setClearing] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [tone, setTone] = useState<string>(() => readTone());
  const [volume, setVolume] = useState<number>(() => readVolume());

  function changeTone(id: string) {
    setTone(id);
    try {
      localStorage.setItem(TONE_KEY, id);
    } catch {}
    playTone(id, volume);
  }

  function changeVolume(v: number) {
    setVolume(v);
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {}
  }

  async function enableDesktopAlerts() {
    try {
      const perm = await Notification.requestPermission();
      setNotifPerm(perm);
    } catch {}
  }

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
              playNotificationSound();
              showDesktopNotification(text);
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

  async function clearNotifications() {
    setClearing(true);
    setToasts([]);
    try {
      await api.patch("/orders/chat/read-all");
      const res = await api.get<DashboardSummary>("/dashboard/summary");
      prev.current = res.data;
      setSummary(res.data);
    } catch {
      // Non-critical: the next poll will resync the counts.
    } finally {
      setClearing(false);
    }
  }

  const badgeCount = (summary?.pendingKotItems || 0) + (summary?.unreadChatCount || 0);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-6 w-6"
        >
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
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Notifications</p>
              <button
                type="button"
                onClick={clearNotifications}
                disabled={clearing}
                className="rounded px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50"
              >
                {clearing ? "Clearing..." : "Clear"}
              </button>
            </div>
            {notifPerm === "default" && (
              <button
                type="button"
                onClick={enableDesktopAlerts}
                className="mb-2 w-full rounded-md bg-orange-50 px-2 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100"
              >
                🔔 Enable desktop alerts
              </button>
            )}
            {notifPerm === "denied" && (
              <p className="mb-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
                Desktop alerts are blocked in your browser settings. Sound &amp; on-screen alerts still work.
              </p>
            )}

            <div className="mb-2 rounded-md border border-slate-200 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="notif-tone" className="text-xs font-semibold text-slate-600">
                  Alert sound
                </label>
                <button
                  type="button"
                  onClick={() => playTone(tone, volume || DEFAULT_VOLUME)}
                  className="rounded px-2 py-0.5 text-[11px] font-medium text-orange-600 hover:bg-orange-50"
                >
                  ▶ Test
                </button>
              </div>
              <select
                id="notif-tone"
                value={tone}
                onChange={(e) => changeTone(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
              >
                {NOTIFICATION_TONES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-slate-500">{volume <= 0 ? "🔇" : "🔊"}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="Alert volume"
                  className="flex-1 accent-orange-600"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Saved on this device. Set volume to 0 to mute alerts here.
              </p>
            </div>

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
