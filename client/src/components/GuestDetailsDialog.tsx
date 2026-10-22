import { useState } from "react";

import type { RequiredDetails } from "../lib/types";
import { Button, ErrorText, Input } from "../shared/ui/ui";

export interface GuestDetails {
  customerName: string;
  members: number;
  customerPhone?: string;
  customerBirthday?: string;
  customerMarketingConsent?: boolean;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Asks for the details the admin turned on. Name and members are required; phone and birthday never are. */
export function GuestDetailsDialog({
  open,
  required,
  onClose,
  onSubmit,
}: {
  open: boolean;
  required: RequiredDetails;
  onClose: () => void;
  onSubmit: (details: GuestDetails) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState(2);
  const [phone, setPhone] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const customerName = name.trim() || "Guest";
    if (required.name && !name.trim()) return setError("Please enter your name");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        customerName,
        members: required.members ? members : 1,
        // Phone and birthday are optional: they are only sent when the guest filled them in properly.
        ...(required.phone && phone.length === 10 && { customerPhone: `+91 ${phone}` }),
        ...(required.phone && phone.length === 10 && marketingConsent && { customerMarketingConsent: true }),
        ...(required.birthday && birthDay && birthMonth && { customerBirthday: `${birthMonth}-${birthDay}` }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <form
        onSubmit={submit}
        noValidate
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-pop"
      >
        <h2 className="text-lg font-bold text-slate-900">Before we place your order</h2>
        <p className="mt-1 text-sm text-slate-500">Tell us who the order is for.</p>

        {required.name && (
          <>
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="guest-name">
              Your name
            </label>
            <Input
              id="guest-name"
              autoComplete="name"
              placeholder="e.g. Ananya"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </>
        )}

        {required.phone && (
          <>
            <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor="guest-phone">
              Phone number <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-slate-500">+91</span>
              <Input
                id="guest-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="mt-2 flex flex-col gap-2 text-sm text-slate-600">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                />
                I agree to receive offers and marketing messages on this number
              </label>
            </div>
          </>
        )}

        {required.birthday && (
          <>
            <span className="mt-3 block text-sm font-medium text-slate-700">
              Date of birth <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <div className="mt-1 flex gap-2">
              <select
                aria-label="Day"
                className="min-h-[40px] flex-1 rounded-lg border border-slate-300 px-2"
                value={birthDay}
                onChange={(e) => setBirthDay(e.target.value)}
              >
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
                  <option key={d} value={d}>
                    {Number(d)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Month"
                className="min-h-[40px] flex-1 rounded-lg border border-slate-300 px-2"
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value)}
              >
                <option value="">Month</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {required.members && (
          <>
            <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor="guest-members">
              Number of members
            </label>
            <div className="mt-1 flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={members <= 1}
                onClick={() => setMembers((m) => m - 1)}
              >
                −
              </Button>
              <Input
                id="guest-members"
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                className="text-center"
                value={members}
                onChange={(e) => setMembers(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={members >= 12}
                onClick={() => setMembers((m) => m + 1)}
              >
                +
              </Button>
            </div>
          </>
        )}

        <ErrorText>{error}</ErrorText>

        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? "Placing..." : "Place order"}
          </Button>
        </div>
      </form>
    </div>
  );
}
