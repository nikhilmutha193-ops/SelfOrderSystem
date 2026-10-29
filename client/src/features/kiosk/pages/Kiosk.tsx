import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import DishDialog, { type DishAddPayload } from "../../../components/DishDialog";
import { newId } from "../../../lib/id";
import { LANGS, type Lang } from "../../../lib/i18n";
import { suggestionsFor } from "../../../lib/recommendations";
import type { CartLine, MenuCategory, MenuFoodItem, OrderDetailResponse } from "../../../lib/types";
import { extractErrorMessage, setActiveAuth } from "../../../shared/api/client";
import { brandThemeColor, openRazorpayCheckout } from "../../payments/razorpayCheckout";
import { printHtml } from "../../pos/offlinePrint";
import { getKioskToken, kioskApi, setKioskToken } from "../api";
import { KioskMenu } from "../components/KioskMenu";
import { KioskReview } from "../components/KioskReview";
import {
  AttractScreen,
  DeviceMenu,
  DoneScreen,
  IdleOverlay,
  OrderTypeScreen,
  PairScreen,
  PayScreen,
} from "../components/KioskScreens";
import { kioskReceiptHtml } from "../receipt";
import { kt } from "../strings";

type Step = "attract" | "type" | "menu" | "review" | "pay" | "done";
type OrderType = "dine-in" | "takeaway";

const NO_MENU: MenuCategory[] = [];
const AUTO_PRINT_KEY = "selforder_kiosk_autoprint";
// Steps where a guest is in the middle of ordering, so walking away should start over.
const ACTIVE_STEPS: Step[] = ["type", "menu", "review", "pay"];

function readAutoPrint() {
  try {
    return localStorage.getItem(AUTO_PRINT_KEY) === "1";
  } catch {
    return false;
  }
}

function sameLine(line: CartLine, foodId: string, payload: DishAddPayload) {
  return (
    line.foodItemId === foodId &&
    (line.note ?? "") === payload.note &&
    !!line.isJain === payload.isJain &&
    JSON.stringify(line.modifiers ?? []) === JSON.stringify(payload.modifiers)
  );
}

export default function Kiosk() {
  const [token, setToken] = useState(getKioskToken);

  // A kiosk never acts as a signed-in staff member, even if someone used this browser before.
  useEffect(() => setActiveAuth(null), []);

  if (!token) {
    return (
      <PairScreen
        onPaired={(next) => {
          setKioskToken(next);
          setToken(next);
        }}
      />
    );
  }
  return (
    <KioskApp
      onUnpaired={() => {
        setKioskToken(null);
        setToken(null);
      }}
    />
  );
}

function KioskApp({ onUnpaired }: { onUnpaired: () => void }) {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: ["kiosk", "config"],
    queryFn: kioskApi.config,
    refetchInterval: 5 * 60_000,
    retry: (count, err) => count < 3 && (err as { response?: { status?: number } }).response?.status !== 401,
  });
  const config = configQuery.data;

  const [lang, setLang] = useState<Lang>("en");
  const [step, setStep] = useState<Step>("attract");
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [dishFor, setDishFor] = useState<MenuFoodItem | null>(null);
  const [placed, setPlaced] = useState<OrderDetailResponse | null>(null);
  const [done, setDone] = useState<{ kind: "paid" | "counter" | "check"; detail: OrderDetailResponse } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idlePrompt, setIdlePrompt] = useState(false);
  const [deviceMenu, setDeviceMenu] = useState(false);
  const [autoPrint, setAutoPrint] = useState(readAutoPrint);
  // Set on every touch (and when a guest starts); only read while someone is ordering.
  const lastTouch = useRef(0);
  const checkoutOpen = useRef(false);
  const cornerTaps = useRef<number[]>([]);

  const menuQuery = useQuery({
    queryKey: ["kiosk", "menu", orderType],
    queryFn: () => kioskApi.menu(orderType!),
    enabled: !!orderType,
    staleTime: 60_000,
  });
  const menu = menuQuery.data ?? NO_MENU;
  const recsQuery = useQuery({
    queryKey: ["kiosk", "recommendations"],
    queryFn: kioskApi.recommendations,
    staleTime: 5 * 60_000,
  });
  const foodById = useMemo(() => {
    const map = new Map<string, MenuFoodItem>();
    for (const c of menu) for (const s of c.subcategories) for (const f of s.foodItems) map.set(f._id, f);
    return map;
  }, [menu]);
  const suggestions = useMemo(
    () =>
      suggestionsFor(
        recsQuery.data,
        cart.map((l) => l.foodItemId),
      )
        .map((id) => foodById.get(id))
        .filter((f): f is MenuFoodItem => Boolean(f)),
    [recsQuery.data, cart, foodById],
  );

  // A removed kiosk gets 401 on everything: back to pairing.
  const configStatus = (configQuery.error as { response?: { status?: number } } | null)?.response?.status;
  useEffect(() => {
    if (configStatus === 401) onUnpaired();
  }, [configStatus, onUnpaired]);

  const reset = useCallback(() => {
    if (placed && placed.order.status === "open" && !placed.order.kiosk?.payAtCounter) {
      void kioskApi.cancel(placed.order._id).catch(() => undefined);
    }
    setStep("attract");
    setOrderType(null);
    setCart([]);
    setDishFor(null);
    setPlaced(null);
    setDone(null);
    setBusy(false);
    setError(null);
    setIdlePrompt(false);
    setLang("en");
    // Pick up sold-out dishes and price changes for the next guest.
    void queryClient.invalidateQueries({ queryKey: ["kiosk", "menu"] });
  }, [placed, queryClient]);

  // Walk-away detection: any touch counts as activity.
  useEffect(() => {
    const touch = () => {
      lastTouch.current = Date.now();
    };
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, []);
  const idleSeconds = config?.settings.idleSeconds ?? 60;
  useEffect(() => {
    if (!ACTIVE_STEPS.includes(step) || idlePrompt) return;
    const id = window.setInterval(() => {
      if (!checkoutOpen.current && Date.now() - lastTouch.current > idleSeconds * 1000) setIdlePrompt(true);
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, idlePrompt, idleSeconds]);

  if (!config) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-100 p-8 text-center text-xl text-slate-500">
        {configQuery.error && configStatus !== 401 ? (
          <span>
            Can't reach the restaurant right now. Retrying…
            <br />
            <span className="text-sm">{extractErrorMessage(configQuery.error)}</span>
          </span>
        ) : (
          "Loading…"
        )}
      </div>
    );
  }
  const { settings, restaurant } = config;

  function start() {
    lastTouch.current = Date.now();
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    if (settings.eatIn && settings.takeaway) setStep("type");
    else {
      setOrderType(settings.takeaway ? "takeaway" : "dine-in");
      setStep("menu");
    }
  }

  function addLine(food: MenuFoodItem, payload: DishAddPayload) {
    const price = food.price + payload.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
    setCart((lines) => {
      const index = lines.findIndex((l) => sameLine(l, food._id, payload));
      if (index >= 0) {
        return lines.map((l, i) => (i === index ? { ...l, quantity: l.quantity + payload.quantity } : l));
      }
      return [
        ...lines,
        {
          lineId: newId(),
          foodItemId: food._id,
          name: food.name,
          price,
          quantity: payload.quantity,
          modifiers: payload.modifiers,
          note: payload.note || undefined,
          isJain: payload.isJain || undefined,
        },
      ];
    });
  }

  function pick(food: MenuFoodItem) {
    if (food.modifierGroups?.length) setDishFor(food);
    else addLine(food, { quantity: 1, modifiers: [], note: "", isJain: false });
  }

  function changeQuantity(lineId: string, delta: number) {
    setCart((lines) =>
      lines.flatMap((l) => (l.lineId !== lineId ? [l] : l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }])),
    );
  }

  async function continueToPay() {
    if (!orderType || cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await kioskApi.placeOrder(
        {
          orderType,
          items: cart.map((l) => ({
            foodItemId: l.foodItemId,
            quantity: l.quantity,
            note: l.note,
            isJain: l.isJain,
            modifiers: l.modifiers?.map(({ groupName, label }) => ({ groupName, label })),
          })),
        },
        newId(),
      );
      setPlaced(detail);
      setStep("pay");
    } catch (err) {
      setError(extractErrorMessage(err));
      void queryClient.invalidateQueries({ queryKey: ["kiosk", "menu"] });
    } finally {
      setBusy(false);
    }
  }

  function backToReview() {
    if (placed) void kioskApi.cancel(placed.order._id).catch(() => undefined);
    setPlaced(null);
    setError(null);
    setStep("review");
  }

  function finish(kind: "paid" | "counter" | "check", detail: OrderDetailResponse) {
    setDone({ kind, detail });
    setPlaced(null);
    setStep("done");
    if (autoPrint) printHtml(kioskReceiptHtml(detail, restaurant.name, kind !== "counter"));
  }

  async function payOnline() {
    if (!placed) return;
    setBusy(true);
    setError(null);
    try {
      const checkout = await kioskApi.checkout(placed.order._id);
      checkoutOpen.current = true;
      const outcome = await openRazorpayCheckout(checkout, brandThemeColor()).finally(() => {
        checkoutOpen.current = false;
        lastTouch.current = Date.now();
      });
      if (outcome.kind === "dismissed") return;
      if (outcome.kind === "failed") {
        setError(`${outcome.message} You weren't charged.`);
        return;
      }
      const { status } = await kioskApi.confirm(outcome.confirmation);
      const detail = await kioskApi.order(placed.order._id);
      finish(status === "mismatch" || status === "duplicate" ? "check" : "paid", detail);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function payCounter() {
    if (!placed) return;
    setBusy(true);
    setError(null);
    try {
      finish("counter", await kioskApi.payAtCounter(placed.order._id));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Five taps on the top-left corner within three seconds open the staff menu.
  function cornerTap() {
    const now = Date.now();
    cornerTaps.current = [...cornerTaps.current.filter((t) => now - t < 3000), now];
    if (cornerTaps.current.length >= 5) {
      cornerTaps.current = [];
      setDeviceMenu(true);
    }
  }

  let screen: React.ReactNode;
  if (step === "attract") {
    screen = (
      <AttractScreen
        name={restaurant.name}
        logoUrl={restaurant.logoUrl}
        images={restaurant.heroImages}
        lang={lang}
        onLang={setLang}
        onStart={start}
      />
    );
  } else if (step === "type") {
    screen = (
      <OrderTypeScreen
        lang={lang}
        eatIn={settings.eatIn}
        takeaway={settings.takeaway}
        onPick={(type) => {
          setOrderType(type);
          setStep("menu");
        }}
        onBack={reset}
      />
    );
  } else if (step === "done" && done) {
    screen = (
      <DoneScreen
        lang={lang}
        number={done.detail.order.pickupNumber}
        kind={done.kind}
        amount={done.detail.totals.grandTotal}
        onPrint={() => printHtml(kioskReceiptHtml(done.detail, restaurant.name, done.kind !== "counter"))}
        onDone={reset}
      />
    );
  } else {
    screen = (
      <div className="flex h-dvh flex-col bg-slate-100">
        <header className="flex shrink-0 items-center gap-3 bg-white px-4 py-3 shadow-card">
          {restaurant.logoUrl && <img src={restaurant.logoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold text-slate-900">{restaurant.name}</p>
            <p className="text-sm font-medium text-slate-500">
              {orderType === "takeaway" ? kt(lang, "takeAway") : kt(lang, "eatHere")}
            </p>
          </div>
          <select
            aria-label="Language"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-base"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="flex min-h-[48px] items-center gap-2 rounded-xl bg-slate-100 px-4 text-base font-semibold text-slate-700"
          >
            <RotateCcw size={18} aria-hidden="true" />
            {kt(lang, "startOver")}
          </button>
        </header>
        {step === "menu" &&
          (menuQuery.isLoading ? (
            <p className="flex-1 p-10 text-center text-xl text-slate-500">{kt(lang, "oneMoment")}</p>
          ) : (
            <KioskMenu menu={menu} lang={lang} cart={cart} onPick={pick} onReview={() => setStep("review")} />
          ))}
        {step === "review" && (
          <KioskReview
            lang={lang}
            cart={cart}
            foodById={foodById}
            suggestions={suggestions}
            busy={busy}
            error={error}
            onQuantity={changeQuantity}
            onPick={pick}
            onBack={() => setStep("menu")}
            onContinue={continueToPay}
          />
        )}
        {step === "pay" && placed && (
          <PayScreen
            lang={lang}
            total={placed.totals.grandTotal}
            online={config.onlinePayment}
            counter={settings.payAtCounter}
            busy={busy}
            error={error}
            onOnline={payOnline}
            onCounter={payCounter}
            onBack={backToReview}
          />
        )}
      </div>
    );
  }

  return (
    <div className="select-none" onContextMenu={(e) => e.preventDefault()}>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={cornerTap}
        className="fixed top-0 left-0 z-40 h-12 w-12 opacity-0"
      />
      {screen}
      <DishDialog
        food={dishFor}
        lang={lang}
        onClose={() => setDishFor(null)}
        onAdd={(food, payload) => {
          addLine(food, payload);
          setDishFor(null);
        }}
      />
      {idlePrompt && (
        <IdleOverlay
          lang={lang}
          onStay={() => {
            lastTouch.current = Date.now();
            setIdlePrompt(false);
          }}
          onReset={reset}
        />
      )}
      {deviceMenu && (
        <DeviceMenu
          name={config.device.name}
          autoPrint={autoPrint}
          onAutoPrint={(value) => {
            setAutoPrint(value);
            try {
              localStorage.setItem(AUTO_PRINT_KEY, value ? "1" : "0");
            } catch {
              // Remembered for this visit only.
            }
          }}
          onUnpair={onUnpaired}
          onClose={() => setDeviceMenu(false)}
        />
      )}
    </div>
  );
}
