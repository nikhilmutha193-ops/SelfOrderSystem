import { PackageOpen, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import type { BillingSettings, ExtraCharge, OrderType } from "../lib/types";
import { Button, Card, CardHeader, Field, IconButton, Input, Select, Switch } from "../shared/ui/ui";

const NO_CHARGES: ExtraCharge[] = [];
const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "dine-in", label: "Dine-in" },
  { value: "takeaway", label: "Takeaway" },
  { value: "delivery", label: "Delivery" },
];

/**
 * Packaging mode (per plate or one flat amount) and the named extra charges (delivery, cutlery...).
 * An automatic charge is added to every order of the ticked types; staff can still remove it from one bill,
 * and a charge that isn't automatic is added by staff on the bills where it applies.
 */
export function ExtraChargesCard({
  settings,
  onChange,
}: {
  settings: BillingSettings;
  onChange: Dispatch<SetStateAction<BillingSettings>>;
}) {
  const charges = settings.extraCharges ?? NO_CHARGES;
  const flat = settings.packagingMode === "flat";

  function update(index: number, patch: Partial<ExtraCharge>) {
    onChange((prev) => ({
      ...prev,
      extraCharges: (prev.extraCharges ?? NO_CHARGES).map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  return (
    <Card>
      <CardHeader
        icon={PackageOpen}
        title="Packaging and extra charges"
        description="How packing is charged, and other charges that go on the bill (delivery, cutlery, parcel box...). They are added before GST."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Packaging charged"
          htmlFor="packaging-mode"
          hint={flat ? "One amount per order, whatever the number of plates." : "Each dish's own packaging charge, per plate."}
        >
          <Select
            id="packaging-mode"
            value={flat ? "flat" : "perPlate"}
            onChange={(e) =>
              onChange((prev) => ({ ...prev, packagingMode: e.target.value === "flat" ? "flat" : "perPlate" }))
            }
          >
            <option value="perPlate">Per plate (set on each dish)</option>
            <option value="flat">Flat, once per order</option>
          </Select>
        </Field>
        {flat && (
          <Field
            label="Flat packaging (₹)"
            htmlFor="packaging-flat"
            hint="Added to takeaway and delivery orders, and to any order with a dish marked Pack."
          >
            <Input
              id="packaging-flat"
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={settings.packagingFlatCharge ?? 0}
              onChange={(e) =>
                onChange((prev) => ({ ...prev, packagingFlatCharge: Math.max(Number(e.target.value) || 0, 0) }))
              }
            />
          </Field>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {charges.map((charge, index) => (
          <div key={charge.key ?? index} className="rounded-xl border border-slate-200 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
              <Field label="Name" htmlFor={`charge-name-${index}`}>
                <Input
                  id={`charge-name-${index}`}
                  maxLength={40}
                  placeholder="Delivery charge"
                  value={charge.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                />
              </Field>
              <Field label="Type" htmlFor={`charge-type-${index}`}>
                <Select
                  id={`charge-type-${index}`}
                  value={charge.type}
                  onChange={(e) => update(index, { type: e.target.value === "percent" ? "percent" : "fixed" })}
                >
                  <option value="fixed">Fixed ₹</option>
                  <option value="percent">% of bill</option>
                </Select>
              </Field>
              <Field label={charge.type === "percent" ? "Percent" : "Amount (₹)"} htmlFor={`charge-value-${index}`}>
                <Input
                  id={`charge-value-${index}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.5"
                  value={charge.value}
                  onChange={(e) => update(index, { value: Math.max(Number(e.target.value) || 0, 0) })}
                />
              </Field>
              <div className="flex items-end">
                <IconButton
                  icon={Trash2}
                  label={`Remove ${charge.name || "charge"}`}
                  className="!text-red-600 hover:!bg-red-50"
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      extraCharges: (prev.extraCharges ?? NO_CHARGES).filter((_, i) => i !== index),
                    }))
                  }
                />
              </div>
            </div>
            <div className="mt-2 divide-y divide-slate-100">
              <Switch
                id={`charge-active-${index}`}
                checked={charge.active}
                onChange={(on) => update(index, { active: on })}
                label="In use"
                description="Turn off to hide it from bills without deleting it."
              />
              <Switch
                id={`charge-auto-${index}`}
                checked={charge.autoApply}
                onChange={(on) => update(index, { autoApply: on })}
                label="Add automatically"
                description="Put it on every order of the types below. Otherwise staff add it on the bills where it applies."
              />
            </div>
            {charge.autoApply && (
              <div className="mt-2 flex flex-wrap gap-2">
                {ORDER_TYPES.map((type) => {
                  const on = charge.orderTypes.includes(type.value);
                  return (
                    <label
                      key={type.value}
                      className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                        on ? "border-orange-400 bg-orange-50 text-orange-800" : "border-slate-300 text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          update(index, {
                            orderTypes: on
                              ? charge.orderTypes.filter((t) => t !== type.value)
                              : [...charge.orderTypes, type.value],
                          })
                        }
                      />
                      {type.label}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={Plus}
            disabled={charges.length >= 10}
            onClick={() =>
              onChange((prev) => ({
                ...prev,
                extraCharges: [
                  ...(prev.extraCharges ?? NO_CHARGES),
                  { name: "", type: "fixed", value: 0, orderTypes: [], autoApply: false, active: true },
                ],
              }))
            }
          >
            Add a charge
          </Button>
          <p className="mt-2 text-xs text-slate-500">Press Save settings at the bottom to apply changes.</p>
        </div>
      </div>
    </Card>
  );
}
