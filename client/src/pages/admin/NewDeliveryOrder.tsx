import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Button, Card, ErrorText, Input } from "../../components/ui";

type OrderKind = "dine-in" | "takeaway";

/**
 * Staff-taken order. No table is chosen here - it is taken at the counter, and a
 * guest who wants a table scans that table's QR code instead.
 */
export default function NewOrder() {
  const [kind, setKind] = useState<OrderKind>("dine-in");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [members, setMembers] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = kind === "takeaway" ? "/orders/takeaway" : "/orders/counter";
      const res = await api.post(endpoint, { customerName, customerPhone, members });
      // Straight to the order so staff can add items and take payment.
      navigate(`/admin/orders/${res.data._id}`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">New Order</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex gap-2">
            {(["dine-in", "takeaway"] as OrderKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`min-h-[44px] flex-1 rounded-md border px-3 text-sm font-semibold transition-colors ${
                  kind === k
                    ? "border-orange-600 bg-orange-50 text-orange-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {k === "dine-in" ? "Dine-in" : "Take away"}
              </button>
            ))}
          </div>

          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Taken at the counter, so no table is assigned. Add the items on the next screen, then take payment.
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
            {loading ? "Creating..." : "Create order"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
