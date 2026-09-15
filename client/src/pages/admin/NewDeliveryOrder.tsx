import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Button, Card, ErrorText, Input, Select } from "../../components/ui";
import type { DeliveryProvider } from "../../lib/types";

export default function NewDeliveryOrder() {
  const [provider, setProvider] = useState<DeliveryProvider>("Swiggy");
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
      const res = await api.post("/orders/delivery", { provider, customerName, customerPhone, members });
      navigate(`/admin/orders/${res.data._id}`);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">New Delivery Order</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-700">
            Provider
            <Select className="mt-1" value={provider} onChange={(e) => setProvider(e.target.value as DeliveryProvider)}>
              <option value="Swiggy">Swiggy</option>
              <option value="Zomato">Zomato</option>
              <option value="Uber-Eats">Uber-Eats</option>
              <option value="Other">Other</option>
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Customer name
            <Input className="mt-1" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Customer phone
            <Input className="mt-1" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required />
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
