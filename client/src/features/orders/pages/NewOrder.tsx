import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import type { DeliveryProvider } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { BirthdayFields } from "../../../shared/ui/BirthdayFields";
import { usePageTour, type TourStep } from "../../../shared/ui/PageTour";
import { Button, Card, ErrorText, Input, PageHeader, Select } from "../../../shared/ui/ui";
import { useStartStaffOrder } from "../queries";
import OrderDetail from "./OrderDetail";

type OrderKind = "dine-in" | "takeaway" | "delivery";

const DELIVERY_PROVIDERS: DeliveryProvider[] = ["Swiggy", "Zomato", "Uber-Eats", "Other"];

export default function NewOrder() {
  const [kind, setKind] = useState<OrderKind>("dine-in");
  const [provider, setProvider] = useState<DeliveryProvider>("Swiggy");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [members, setMembers] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const startOrder = useStartStaffOrder();
  const loading = startOrder.isPending;
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string>("");
  const [collapsed, setCollapsed] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const customer = {
        customerName,
        customerPhone,
        members,
        ...(birthDay && birthMonth && { customerBirthday: `${birthMonth}-${birthDay}` }),
      };
      const order = await startOrder.mutateAsync(
        kind === "delivery" ? { kind, provider, ...customer } : { kind, ...customer }
      );
      setActiveOrderId(order._id);
      setActiveName(customerName || (kind === "delivery" ? provider : "the counter"));
      // Clear the form so it's ready for the next order, and collapse it - the right panel keeps
      // the created one, and "New order" below brings the form back when it's actually needed.
      setCustomerName("");
      setCustomerPhone("");
      setBirthDay("");
      setBirthMonth("");
      setMembers(1);
      setKind("dine-in");
      setCollapsed(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const startForm = (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Start an order</h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex gap-2" data-tour="neworder-kind">
          {(["dine-in", "takeaway", "delivery"] as OrderKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`min-h-[44px] flex-1 rounded-xl border px-2 text-sm font-semibold transition-colors ${
                kind === k
                  ? "border-orange-600 bg-orange-50 text-orange-700"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {k === "dine-in" ? "Dine-in" : k === "takeaway" ? "Take away" : "Delivery"}
            </button>
          ))}
        </div>

        {kind === "delivery" && (
          <label className="text-sm font-medium text-slate-700">
            Delivery partner
            <Select className="mt-1" value={provider} onChange={(e) => setProvider(e.target.value as DeliveryProvider)}>
              {DELIVERY_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </label>
        )}

        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {kind === "delivery"
            ? "Key in a Swiggy/Zomato order taken over the phone or from the partner app, then add its items on the right. Orders sent through the live webhook appear automatically in Orders."
            : "Taken at the counter, so no table is assigned. Create the order, then add items on the right."}
        </p>

        <label className="text-sm font-medium text-slate-700" data-tour="neworder-customer">
          Customer name
          <Input className="mt-1" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Customer phone <span className="font-normal text-slate-400">(optional)</span>
          <Input className="mt-1" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        </label>
        <div>
          <span className="text-sm font-medium text-slate-700">
            Date of birth <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <div className="mt-1">
            <BirthdayFields day={birthDay} month={birthMonth} onDayChange={setBirthDay} onMonthChange={setBirthMonth} />
          </div>
        </div>
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
        <Button type="submit" disabled={loading} data-tour="neworder-submit">
          {loading ? "Creating..." : activeOrderId ? "Create another order" : "Create order & add items"}
        </Button>
      </form>
    </Card>
  );

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "neworder-kind",
        title: "Order type",
        description: "Dine-in (no table assigned here), take-away, or a Swiggy/Zomato delivery keyed in by hand.",
      },
      {
        target: "neworder-customer",
        title: "Customer details",
        description: "Name, phone, birthday and the member/item count - all optional except name.",
      },
      {
        target: "neworder-submit",
        title: "Create the order",
        description: "Creates it and opens its menu on the right so you can add items.",
      },
      {
        target: "neworder-panel",
        title: "Add items and take payment",
        description: "Once created, the order's menu, kitchen tickets and billing appear here.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  const orderPanel = (
    <div className="min-w-0" data-tour="neworder-panel">
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
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader title="New Order" />

      {collapsed ? (
        // Collapsed: stack full-width instead of reserving a whole sidebar column for a one-line
        // bar - that left a big empty column next to the order panel for no reason.
        <div className="flex flex-col gap-4">
          <Card className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Start an order</p>
              <p className="truncate text-xs text-slate-500">Editing {activeName}'s order</p>
            </div>
            <Button type="button" variant="secondary" icon={Plus} onClick={() => setCollapsed(false)}>
              New order
            </Button>
          </Card>
          {orderPanel}
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
          {startForm}
          {orderPanel}
        </div>
      )}
    </div>
  );
}
