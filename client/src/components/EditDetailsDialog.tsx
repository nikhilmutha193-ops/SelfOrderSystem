import { useEffect, useState } from "react";

import { ordersApi } from "../features/orders/api";
import { api, extractErrorMessage } from "../shared/api/client";
import { BirthdayFields } from "../shared/ui/BirthdayFields";
import { Button, ErrorText, Input } from "../shared/ui/ui";

/** Lets a guest fill in the phone number / birthday they skipped on the sign-in form, without
 *  having to leave the menu page. Pre-fills whatever we already know (phone from the order,
 *  birthday looked up by phone, same as the sign-in form) so it reads as "add what's missing",
 *  not a blank form that throws away details already given. */
export function EditDetailsDialog({
  open,
  onClose,
  orderId,
  defaultPhone = "",
  defaultBirthday = "",
  defaultMarketingConsent = false,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  defaultPhone?: string;
  /** "MM-DD" already on this order, e.g. given at sign-in without a phone number - the only place
   *  it's recorded until a phone exists to save it against a Customer. */
  defaultBirthday?: string;
  /** Already agreed to offers (at sign-in, or on an earlier visit) - hides the checkbox instead of
   *  re-asking, same "only add what's missing" rule as phone/birthday. */
  defaultMarketingConsent?: boolean;
}) {
  const [phone, setPhone] = useState(defaultPhone);
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setPhone((p) => p || defaultPhone);
  }, [open, defaultPhone]);

  useEffect(() => {
    if (!open || !defaultBirthday) return;
    const [month, day] = defaultBirthday.split("-");
    setBirthMonth((prev) => prev || month);
    setBirthDay((prev) => prev || day);
  }, [open, defaultBirthday]);

  // If we already know this guest's birthday from an earlier visit (looked up by phone), show it
  // instead of asking again.
  useEffect(() => {
    if (!open || phone.length !== 10) return;
    api
      .get<{ name: string; birthday: string } | null>("/customers/guest-lookup", { params: { phone } })
      .then((res) => {
        const birthday = res.data?.birthday;
        if (!birthday) return;
        const [month, day] = birthday.split("-");
        setBirthMonth((prev) => prev || month);
        setBirthDay((prev) => prev || day);
      })
      .catch(() => {
        /* best effort - a failed lookup just leaves the fields blank for the guest to fill in */
      });
  }, [open, phone]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = phone.trim();
    if (!trimmed && !(birthDay && birthMonth)) {
      setError("Add a phone number or a birthday first");
      return;
    }
    setSaving(true);
    try {
      await ordersApi.updateCustomer(orderId, {
        ...(trimmed && { customerPhone: `+91 ${trimmed}` }),
        ...(birthDay && birthMonth && { customerBirthday: `${birthMonth}-${birthDay}` }),
        ...(marketingConsent && { customerMarketingConsent: true }),
      });
      setSaved(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setSaved(false);
    setError(null);
    setMarketingConsent(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Your details"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {saved ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm text-green-700">Thanks, saved!</p>
            <Button onClick={close}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Add your details</h2>
            <p className="text-sm text-slate-500">Didn't share your phone or birthday earlier? Add them now.</p>
            <label className="text-sm font-medium text-slate-700">
              Phone number
              <Input
                className="mt-1"
                type="tel"
                inputMode="tel"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^\d]/g, "");
                  setPhone(next);
                  if (!next) setMarketingConsent(false);
                }}
              />
            </label>
            {!defaultMarketingConsent && (
              <label className={`flex items-start gap-2 text-sm ${phone ? "text-slate-600" : "text-slate-400"}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={marketingConsent}
                  disabled={!phone}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                />
                Agreed to receive new offers and marketing messages on this number
              </label>
            )}
            <div>
              <span className="text-sm font-medium text-slate-700">Date of birth</span>
              <div className="mt-1">
                <BirthdayFields day={birthDay} month={birthMonth} onDayChange={setBirthDay} onMonthChange={setBirthMonth} />
              </div>
            </div>
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
