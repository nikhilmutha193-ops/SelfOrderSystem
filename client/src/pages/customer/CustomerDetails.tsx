import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, storeToken, setActiveAuth, extractErrorMessage } from "../../lib/apiClient";
import { Button, Card, ErrorText, Input } from "../../components/ui";

export default function CustomerDetails() {
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
      const res = await api.post("/orders/dine-in", { customerName, customerPhone, members });
      storeToken("table", res.data.token);
      setActiveAuth({ role: "table", token: res.data.token });
      navigate("/order/menu");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-800">Tell us about your visit</h1>
      </div>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-700">
            Your name
            <Input className="mt-1" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Phone number
            <Input
              className="mt-1"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Number of members
            <Input
              className="mt-1"
              type="number"
              min={1}
              value={members}
              onChange={(e) => setMembers(Number(e.target.value))}
              required
            />
          </label>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={loading}>
            {loading ? "Starting order..." : "Continue to menu"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
