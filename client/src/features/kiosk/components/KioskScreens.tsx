import { Banknote, CheckCircle2, CreditCard, Printer, ShoppingBag, TabletSmartphone, Utensils } from "lucide-react";
import { useEffect, useState } from "react";

import { LANGS, type Lang } from "../../../lib/i18n";
import { extractErrorMessage } from "../../../shared/api/client";
import { kioskApi } from "../api";
import { kt, rupees } from "../strings";

const bigButton =
  "flex min-h-[88px] w-full items-center justify-center gap-3 rounded-2xl px-6 text-2xl font-bold transition active:scale-[0.99] disabled:opacity-50";

/** First run on a new screen: the staff enter the code shown on the Kiosks page. */
export function PairScreen({ onPaired }: { onPaired: (token: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pair(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await kioskApi.pair(code.trim());
      onPaired(token);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-slate-100 p-6">
      <form onSubmit={pair} className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-white p-8 shadow-pop">
        <TabletSmartphone size={40} className="text-orange-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-slate-900">Set up this kiosk</h1>
        <p className="text-slate-600">
          In the admin, open <b>Kiosks &amp; Pickup Board</b>, add a kiosk and type its pairing code here.
        </p>
        <input
          aria-label="Pairing code"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="h-16 rounded-xl border-2 border-slate-300 text-center font-mono text-3xl tracking-[0.3em] uppercase focus:border-orange-500 focus:outline-none"
        />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button type="submit" disabled={busy || code.trim().length !== 8} className={`${bigButton} bg-orange-600 text-white`}>
          {busy ? "Pairing…" : "Pair kiosk"}
        </button>
      </form>
    </div>
  );
}

/** The idle screen: slides of the restaurant's photos, the name, and "Touch to order". */
export function AttractScreen({
  name,
  logoUrl,
  images,
  lang,
  onLang,
  onStart,
}: {
  name: string;
  logoUrl: string;
  images: string[];
  lang: Lang;
  onLang: (lang: Lang) => void;
  onStart: () => void;
}) {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    const id = window.setInterval(() => setSlide((s) => (s + 1) % images.length), 6000);
    return () => window.clearInterval(id);
  }, [images.length]);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-orange-700 text-white">
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === slide ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/70" />
      <button type="button" onClick={onStart} className="relative flex flex-1 flex-col items-center justify-center gap-6 p-8">
        {logoUrl && <img src={logoUrl} alt="" className="h-32 w-32 rounded-full object-cover ring-4 ring-white/80" />}
        <span className="text-center text-5xl font-extrabold drop-shadow-lg sm:text-6xl">{name}</span>
        <span className="mt-8 animate-pulse rounded-full bg-white px-12 py-6 text-3xl font-bold text-orange-700 shadow-pop">
          {kt(lang, "touchToOrder")}
        </span>
      </button>
      <div className="relative flex justify-center gap-3 p-6">
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => onLang(l.code)}
            aria-pressed={lang === l.code}
            className={`min-h-[56px] rounded-full px-6 text-lg font-semibold ${
              lang === l.code ? "bg-white text-slate-900" : "bg-white/20 text-white backdrop-blur"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OrderTypeScreen({
  lang,
  eatIn,
  takeaway,
  onPick,
  onBack,
}: {
  lang: Lang;
  eatIn: boolean;
  takeaway: boolean;
  onPick: (type: "dine-in" | "takeaway") => void;
  onBack: () => void;
}) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-10 bg-slate-100 p-8">
      <h1 className="text-center text-4xl font-bold text-slate-900">{kt(lang, "whereEat")}</h1>
      <div className="grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        {eatIn && (
          <button
            type="button"
            onClick={() => onPick("dine-in")}
            className="flex aspect-square flex-col items-center justify-center gap-6 rounded-3xl bg-white text-3xl font-bold text-slate-900 shadow-pop active:scale-[0.99]"
          >
            <Utensils size={96} className="text-orange-600" aria-hidden="true" />
            {kt(lang, "eatHere")}
          </button>
        )}
        {takeaway && (
          <button
            type="button"
            onClick={() => onPick("takeaway")}
            className="flex aspect-square flex-col items-center justify-center gap-6 rounded-3xl bg-white text-3xl font-bold text-slate-900 shadow-pop active:scale-[0.99]"
          >
            <ShoppingBag size={96} className="text-orange-600" aria-hidden="true" />
            {kt(lang, "takeAway")}
          </button>
        )}
      </div>
      <button type="button" onClick={onBack} className="min-h-[56px] px-6 text-xl font-semibold text-slate-600">
        {kt(lang, "back")}
      </button>
    </div>
  );
}

export function PayScreen({
  lang,
  total,
  online,
  counter,
  busy,
  error,
  onOnline,
  onCounter,
  onBack,
}: {
  lang: Lang;
  total: number;
  online: boolean;
  counter: boolean;
  busy: boolean;
  error: string | null;
  onOnline: () => void;
  onCounter: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <p className="text-2xl font-semibold text-slate-600">{kt(lang, "total")}</p>
        <p className="text-6xl font-extrabold text-slate-900">{rupees(total)}</p>
      </div>
      <h2 className="text-3xl font-bold text-slate-900">{kt(lang, "howPay")}</h2>
      <div className="flex w-full max-w-xl flex-col gap-4">
        {online && (
          <button type="button" onClick={onOnline} disabled={busy} className={`${bigButton} bg-orange-600 text-white`}>
            <CreditCard size={32} aria-hidden="true" />
            <span className="flex flex-col items-start leading-tight">
              {kt(lang, "payNow")}
              <span className="text-base font-medium opacity-90">{kt(lang, "payNowHint")}</span>
            </span>
          </button>
        )}
        {counter && (
          <button
            type="button"
            onClick={onCounter}
            disabled={busy}
            className={`${bigButton} border-2 border-slate-300 bg-white text-slate-900`}
          >
            <Banknote size={32} aria-hidden="true" />
            <span className="flex flex-col items-start leading-tight">
              {kt(lang, "payCounter")}
              <span className="text-base font-medium text-slate-500">{kt(lang, "payCounterHint")}</span>
            </span>
          </button>
        )}
        {!online && !counter && (
          <p className="rounded-xl bg-amber-50 p-4 text-center text-lg text-amber-900">
            Paying isn't set up on this kiosk yet. Please order at the counter.
          </p>
        )}
        {busy && <p className="text-center text-xl text-slate-500">{kt(lang, "oneMoment")}</p>}
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-lg font-medium text-red-700">{error}</p>}
        <button type="button" onClick={onBack} disabled={busy} className="min-h-[64px] text-xl font-semibold text-slate-600">
          {kt(lang, "back")}
        </button>
      </div>
    </div>
  );
}

export function DoneScreen({
  lang,
  number,
  kind,
  amount,
  onPrint,
  onDone,
}: {
  lang: Lang;
  number: number | null | undefined;
  kind: "paid" | "counter" | "check";
  amount: number;
  onPrint: () => void;
  onDone: () => void;
}) {
  const [left, setLeft] = useState(25);
  useEffect(() => {
    const id = window.setInterval(() => setLeft((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) onDone();
  }, [left, onDone]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-slate-100 p-8 text-center">
      <CheckCircle2 size={88} className={kind === "counter" ? "text-amber-500" : "text-green-600"} aria-hidden="true" />
      <p className="text-2xl font-semibold text-slate-600">{kt(lang, "yourNumber")}</p>
      <p className="text-[9rem] leading-none font-extrabold text-slate-900 tabular-nums">{number ?? "—"}</p>
      <p className="max-w-xl text-2xl text-slate-700">
        {kind === "paid"
          ? kt(lang, "paidMessage")
          : kind === "counter"
            ? kt(lang, "counterMessage", { amount: rupees(amount) })
            : kt(lang, "checkLater")}
      </p>
      <div className="mt-4 flex w-full max-w-xl flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onPrint} className={`${bigButton} border-2 border-slate-300 bg-white text-slate-900`}>
          <Printer size={28} aria-hidden="true" />
          {kt(lang, "printReceipt")}
        </button>
        <button type="button" onClick={onDone} className={`${bigButton} bg-orange-600 text-white`}>
          {kt(lang, "newOrder")} ({left})
        </button>
      </div>
    </div>
  );
}

/** "Are you still there?" with a countdown; anything but a tap on "I'm still here" starts over. */
export function IdleOverlay({ lang, onStay, onReset }: { lang: Lang; onStay: () => void; onReset: () => void }) {
  const [left, setLeft] = useState(15);
  useEffect(() => {
    const id = window.setInterval(() => setLeft((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) onReset();
  }, [left, onReset]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6" role="alertdialog" aria-modal="true">
      <div className="flex w-full max-w-lg flex-col items-center gap-5 rounded-3xl bg-white p-8 text-center shadow-pop">
        <p className="text-3xl font-bold text-slate-900">{kt(lang, "stillThere")}</p>
        <p className="text-xl text-slate-600">{kt(lang, "startingOver", { n: Math.max(0, left) })}</p>
        <button type="button" onClick={onStay} className={`${bigButton} bg-orange-600 text-white`}>
          {kt(lang, "imHere")}
        </button>
        <button type="button" onClick={onReset} className="min-h-[56px] text-lg font-semibold text-slate-600">
          {kt(lang, "startOver")}
        </button>
      </div>
    </div>
  );
}

/** Opened by five quick taps on the top-left corner: device options for staff. */
export function DeviceMenu({
  name,
  autoPrint,
  onAutoPrint,
  onUnpair,
  onClose,
}: {
  name: string;
  autoPrint: boolean;
  onAutoPrint: (value: boolean) => void;
  onUnpair: () => void;
  onClose: () => void;
}) {
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-white p-6 shadow-pop">
        <h2 className="text-xl font-bold text-slate-900">Kiosk: {name}</h2>
        <label className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 text-lg">
          Print a receipt after each order
          <input type="checkbox" checked={autoPrint} onChange={(e) => onAutoPrint(e.target.checked)} className="!h-6 !w-6" />
        </label>
        <p className="text-sm text-slate-500">
          Receipts go to this screen's default printer. Start Chrome with <code>--kiosk --kiosk-printing</code> so it
          prints without a dialog.
        </p>
        {confirmUnpair ? (
          <button type="button" onClick={onUnpair} className="min-h-[56px] rounded-xl bg-red-600 text-lg font-semibold text-white">
            Yes, unpair this kiosk
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmUnpair(true)}
            className="min-h-[56px] rounded-xl border-2 border-red-200 text-lg font-semibold text-red-700"
          >
            Unpair this kiosk
          </button>
        )}
        <button type="button" onClick={onClose} className="min-h-[56px] rounded-xl bg-slate-100 text-lg font-semibold text-slate-800">
          Close
        </button>
      </div>
    </div>
  );
}
