import { Clock } from "lucide-react";
import { useState } from "react";

import type { KotQueueGroup, OrderItem } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Button, ErrorText } from "../../../shared/ui/ui";
import { formatElapsed, useNow } from "../../kitchen/kds";
import { useServeItem } from "../../kitchen/queries";
import { tableCode } from "../tableCode";

const SERVE_SOON_MIN = 2;
const SERVE_LATE_MIN = 5;

interface Section {
  key: string;
  title: string;
  customers: string[];
  ready: OrderItem[];
  cooking: OrderItem[];
  waiting: OrderItem[];
  oldestReady: number | null;
}

function sectionsOf(groups: KotQueueGroup[]): Section[] {
  const map = new Map<string, Section>();
  for (const { order, items } of groups) {
    const code = tableCode(order);
    const key = code ? `t:${code}` : `o:${order._id}`;
    const title = code ? `Table ${code}` : order.orderType === "takeaway" ? "Takeaway" : "Counter";
    const section = map.get(key) ?? {
      key,
      title,
      customers: [],
      ready: [],
      cooking: [],
      waiting: [],
      oldestReady: null,
    };
    if (order.customerName && !section.customers.includes(order.customerName)) {
      section.customers.push(order.customerName);
    }
    for (const item of items) {
      if (item.kotRound == null) continue;
      if (item.status === "ready") {
        section.ready.push(item);
        const at = item.readyAt ? new Date(item.readyAt).getTime() : NaN;
        if (Number.isFinite(at)) section.oldestReady = Math.min(section.oldestReady ?? at, at);
      } else if (item.status === "preparing") section.cooking.push(item);
      else if (item.status === "pending") section.waiting.push(item);
    }
    map.set(key, section);
  }
  // Tables with food to serve first, the longest-waiting at the top.
  return [...map.values()]
    .filter((s) => s.ready.length + s.cooking.length + s.waiting.length > 0)
    .sort((a, b) => {
      if (a.ready.length > 0 !== b.ready.length > 0) return a.ready.length > 0 ? -1 : 1;
      return (a.oldestReady ?? Infinity) - (b.oldestReady ?? Infinity);
    });
}

function waitTone(minutes: number) {
  if (minutes >= SERVE_LATE_MIN) return "bg-red-600 text-white";
  if (minutes >= SERVE_SOON_MIN) return "bg-orange-500 text-white";
  return "bg-green-600 text-white";
}

export function ReadyList({ groups }: { groups: KotQueueGroup[] }) {
  const serve = useServeItem();
  const now = useNow(1000);
  const [error, setError] = useState<string | null>(null);
  const sections = sectionsOf(groups);

  async function serveItems(items: OrderItem[]) {
    setError(null);
    try {
      await Promise.all(items.map((i) => serve.mutateAsync(i._id)));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <ErrorText>{error}</ErrorText>
      {sections.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">Nothing is waiting to be served.</p>
      )}
      {sections.map((s) => {
        const waitingMinutes = s.oldestReady != null ? Math.floor((now - s.oldestReady) / 60_000) : 0;
        const inKitchen = s.cooking.length + s.waiting.length;
        return (
          <section
            key={s.key}
            className={`rounded-xl border bg-white p-3 shadow-sm ${s.ready.length ? "border-green-300" : "border-slate-200"}`}
          >
            <header className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-800">{s.title}</h3>
                {s.customers.length > 0 && <p className="truncate text-xs text-slate-500">{s.customers.join(", ")}</p>}
              </div>
              {s.oldestReady != null && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${waitTone(waitingMinutes)}`}
                  title="How long the oldest ready dish has been waiting to be served"
                >
                  <Clock size={13} aria-hidden="true" />
                  {formatElapsed(now - s.oldestReady)}
                </span>
              )}
            </header>

            {s.ready.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-wide text-green-700 uppercase">
                    Ready to serve · {s.ready.length}
                  </p>
                  {s.ready.length > 1 && (
                    <Button
                      size="sm"
                      className="!bg-green-600 hover:!bg-green-700"
                      disabled={serve.isPending}
                      onClick={() => serveItems(s.ready)}
                    >
                      Serve all
                    </Button>
                  )}
                </div>
                <ul className="mt-1 flex flex-col gap-2">
                  {s.ready.map((item) => (
                    <li key={item._id} className="flex items-center justify-between gap-3">
                      <span className="text-sm">
                        <span className="font-semibold">{item.quantity}×</span> {item.foodName}
                        {item.readyAt && (
                          <span className="ml-2 text-xs text-slate-500 tabular-nums">
                            ready {formatElapsed(now - new Date(item.readyAt).getTime())} ago
                          </span>
                        )}
                        {item.note && <span className="block text-xs text-slate-500">{item.note}</span>}
                      </span>
                      <Button
                        className="shrink-0 !bg-green-600 hover:!bg-green-700"
                        disabled={serve.isPending}
                        onClick={() => serveItems([item])}
                      >
                        Served
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {inKitchen > 0 && (
              <div className={s.ready.length ? "mt-3 border-t border-slate-100 pt-2" : ""}>
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  In the kitchen · {inKitchen}
                </p>
                <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-600">
                  {s.cooking.map((item) => (
                    <li key={item._id} className="flex justify-between gap-2">
                      <span>
                        <span className="font-semibold">{item.quantity}×</span> {item.foodName}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-sky-700">Cooking</span>
                    </li>
                  ))}
                  {s.waiting.map((item) => (
                    <li key={item._id} className="flex justify-between gap-2">
                      <span>
                        <span className="font-semibold">{item.quantity}×</span> {item.foodName}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-amber-700">Waiting</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
