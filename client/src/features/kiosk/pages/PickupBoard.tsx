import { BellRing, CookingPot, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { usePickupBoard } from "../queries";

const NO_NUMBERS: number[] = [];

/** A short two-note chime. Browsers only allow sound after a tap on the page, hence the sound button. */
function chime(context: AudioContext) {
  const now = context.currentTime;
  [880, 1320].forEach((frequency, i) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.5);
    osc.connect(gain).connect(context.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.55);
  });
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** The TV by the counter: numbers being prepared, and numbers ready to collect. Read-only, no login. */
export default function PickupBoard() {
  const board = usePickupBoard();
  const preparing = board.data?.preparing ?? NO_NUMBERS;
  const ready = board.data?.ready ?? NO_NUMBERS;
  const now = useClock();
  const [audio, setAudio] = useState<AudioContext | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const seenReady = useRef<Set<number> | null>(null);

  // Numbers that just turned ready glow for a few seconds (and chime when sound is on).
  useEffect(() => {
    if (!board.data) return;
    const previous = seenReady.current;
    seenReady.current = new Set(ready);
    if (!previous) return;
    const added = ready.filter((n) => !previous.has(n));
    if (added.length === 0) return;
    if (audio) chime(audio);
    setFresh((current) => new Set([...current, ...added]));
    const id = window.setTimeout(
      () => setFresh((current) => new Set([...current].filter((n) => !added.includes(n)))),
      8000,
    );
    return () => window.clearTimeout(id);
  }, [board.data, ready, audio]);

  function toggleSound() {
    if (audio) {
      void audio.close();
      setAudio(null);
      return;
    }
    const context = new AudioContext();
    chime(context);
    setAudio(context);
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-950 text-white">
      <header className="flex shrink-0 items-center gap-4 px-8 py-5">
        {board.data?.logoUrl && <img src={board.data.logoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />}
        <h1 className="min-w-0 flex-1 truncate text-3xl font-bold">{board.data?.restaurantName ?? ""}</h1>
        {board.isError && <span className="rounded-full bg-amber-500 px-4 py-1.5 text-lg font-semibold text-slate-900">Reconnecting…</span>}
        <span className="text-3xl font-semibold tabular-nums text-slate-300">
          {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
        <button
          type="button"
          onClick={toggleSound}
          aria-label={audio ? "Turn sound off" : "Turn sound on"}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-slate-200 hover:bg-white/20"
        >
          {audio ? <Volume2 size={26} aria-hidden="true" /> : <VolumeX size={26} aria-hidden="true" />}
        </button>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-6 px-8 pb-8 md:grid-cols-[2fr_3fr]">
        <section className="flex min-h-0 flex-col rounded-3xl bg-white/5 p-6">
          <h2 className="mb-5 flex items-center gap-3 text-4xl font-bold text-slate-300">
            <CookingPot size={40} aria-hidden="true" />
            Preparing
          </h2>
          <div className="grid content-start gap-4 overflow-hidden [grid-template-columns:repeat(auto-fill,minmax(8rem,1fr))]">
            {preparing.map((n) => (
              <span key={n} className="rounded-2xl bg-white/10 py-4 text-center text-6xl font-bold tabular-nums text-slate-200">
                {n}
              </span>
            ))}
          </div>
        </section>
        <section className="flex min-h-0 flex-col rounded-3xl bg-orange-600 p-6">
          <h2 className="mb-5 flex items-center gap-3 text-4xl font-bold">
            <BellRing size={40} aria-hidden="true" />
            Ready to collect
          </h2>
          <div className="grid content-start gap-4 overflow-hidden [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]">
            {ready.map((n) => (
              <span
                key={n}
                className={`rounded-2xl py-5 text-center text-7xl font-extrabold tabular-nums transition ${
                  fresh.has(n) ? "animate-pulse bg-white text-orange-700 ring-8 ring-white/40" : "bg-white/20 text-white"
                }`}
              >
                {n}
              </span>
            ))}
          </div>
          {ready.length === 0 && <p className="text-2xl text-white/80">Numbers appear here when the order is ready.</p>}
        </section>
      </main>
    </div>
  );
}
