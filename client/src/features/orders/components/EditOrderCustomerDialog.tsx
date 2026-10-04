import { useEffect, useState } from "react";

import type { Order } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { BirthdayFields } from "../../../shared/ui/BirthdayFields";
import { Dialog } from "../../../shared/ui/Dialog";
import { Button, ErrorText, Input } from "../../../shared/ui/ui";
import { useUpdateOrderCustomer } from "../queries";

/** Lets staff fix or fill in the guest name/phone/birthday on an order - the same fields the
 *  guest's own sign-in form and "Add your details" dialog collect, editable from the order side
 *  for a phone-order typo, a walk-in whose details weren't caught at sign-in, etc. */
export function EditOrderCustomerDialog({
  order,
  open,
  onClose,
}: {
  order: Pick<Order, "_id" | "customerName" | "customerPhone" | "customerBirthday">;
  open: boolean;
  onClose: () => void;
}) {
  const update = useUpdateOrderCustomer();
  const [name, setName] = useState(order.customerName);
  const [phone, setPhone] = useState(order.customerPhone);
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(order.customerName);
    setPhone(order.customerPhone);
    const [month, day] = (order.customerBirthday ?? "").split("-");
    setBirthDay(day ?? "");
    setBirthMonth(month ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order._id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await update.mutateAsync({
        orderId: order._id,
        input: {
          customerName: name.trim(),
          customerPhone: phone.trim(),
          ...(birthDay && birthMonth && { customerBirthday: `${birthMonth}-${birthDay}` }),
        },
      });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Guest details"
      dismissible={!update.isPending}
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="text-sm font-medium text-slate-700">
          Name
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Phone <span className="font-normal text-slate-400">(optional)</span>
          <Input className="mt-1" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <div>
          <span className="text-sm font-medium text-slate-700">
            Date of birth <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <div className="mt-1">
            <BirthdayFields day={birthDay} month={birthMonth} onDayChange={setBirthDay} onMonthChange={setBirthMonth} />
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
      </div>
    </Dialog>
  );
}
