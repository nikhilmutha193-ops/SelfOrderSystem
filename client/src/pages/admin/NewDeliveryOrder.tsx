import { useState } from "react";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Button, Card, ErrorText, Input } from "../../components/ui";
import OrderDetail from "./OrderDetail";

type OrderKind = "dine-in" | "takeaway";

/**
 * Staff-taken counter order. The form on the left creates the order; its detail
 * workspace (menu picker, KOT, payment) opens on the right, on the same screen, so
 * the whole counter flow is one view. The columns stack on narrow screens.
 */
export default function NewOrder() {
  const [kind, setKind] = useState<OrderKind>("dine-in");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [members, setMembers] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = kind === "takeaway" ? "/orders/takeaway" : "/orders/counter";
      const res = await api.post(endpoint, { customerName, customerPhone, members });
      setActiveOrderId(res.data._id);
      setActiveName(customerName || "the counter");
      // Clear the form so it's ready for the next order; the right panel keeps the created one.
      setCustomerName("");
      setCustomerPhone("");
      setMembers(1);
      setKind("dine-in");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">New Order</h1>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        {/* Left: create form (always visible) */}
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-800">Start an order</h2>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex gap-2">
              {(["dine-in", "takeaway"] as OrderKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`min-h-[44px] flex-1 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                    kind === k
                      ? "border-orange-600 bg-orange-50 text-orange-700"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {k === "dine-in" ? "Dine-in" : "Take away"}
                </button>
              ))}
            </div>

            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Taken at the counter, so no table is assigned. Create the order, then add items on the right.
            </p>

            <label className="text-sm font-medium text-slate-700">
              Customer name
              <Input className="mt-1" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Customer phone <span className="font-normal text-slate-400">(optional)</span>
              <Input className="mt-1" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Members / items count
              <Input
                className="mt-1"
                type="number"
                min={1}
                value={members}
                onChange={(e) => setMembers(Number(e.target.value))}
              />
            </label>

            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : activeOrderId ? "Create another order" : "Create order & add items"}
            </Button>
          </form>
        </Card>

        {/* Right: the created order's workspace, or a prompt */}
        <div className="min-w-0">
          {activeOrderId ? (
            <>
              <p className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
                Editing order for {activeName}. Add items and take payment below.
              </p>
              <OrderDetail key={activeOrderId} orderId={activeOrderId} embedded />
            </>
          ) : (
            <Card className="flex min-h-[220px] items-center justify-center text-center">
              <p className="text-sm text-slate-400">
                Fill in the form and create an order.
                <br />
                Its menu, kitchen tickets and payment will appear here.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
