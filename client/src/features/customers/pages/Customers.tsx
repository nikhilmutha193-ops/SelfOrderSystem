import { useState } from "react";

import { useCanEdit } from "../../../lib/adminAuth";
import type { CustomerProfile, CustomerSummary, LoyaltySettings } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Input,
  PageHeader,
  SearchInput,
  Switch,
  TableWrap,
  Tabs,
} from "../../../shared/ui/ui";
import type { Segment } from "../api";
import {
  useCustomerProfile,
  useCustomers,
  useLoyaltySettings,
  useSaveLoyaltySettings,
  useUpdateCustomer,
} from "../queries";

const NO_CUSTOMERS: CustomerSummary[] = [];
const SEGMENTS: { key: Segment | ""; label: string }[] = [
  { key: "", label: "Everyone" },
  { key: "regulars", label: "Regulars (3+ visits)" },
  { key: "lapsed", label: "Not seen in 30 days" },
  { key: "birthdays", label: "Birthdays this week" },
  { key: "consented", label: "Agreed to offers" },
];

function formatPhone(phone: string) {
  return phone.length === 12 && phone.startsWith("91") ? `+91 ${phone.slice(2, 7)} ${phone.slice(7)}` : `+${phone}`;
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString([], { dateStyle: "medium" }) : "-";
}

function LoyaltyCard({ canEdit }: { canEdit: boolean }) {
  const settings = useLoyaltySettings();
  const save = useSaveLoyaltySettings();
  const [draft, setDraft] = useState<LoyaltySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = draft ?? settings.data;
  if (!form) return null;
  const set = (patch: Partial<LoyaltySettings>) => {
    setSaved(false);
    setDraft({ ...form, ...patch });
  };
  const number = (key: keyof LoyaltySettings, label: string, hint: string) => (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <Input
        id={`loyalty-${key}`}
        className="mt-1"
        type="number"
        min={0}
        step="any"
        disabled={!canEdit}
        value={form[key] as number}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<LoyaltySettings>)}
      />
      <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>
    </label>
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Loyalty points</h2>
        <div className="flex items-center gap-3">
          <label htmlFor="loyalty-enabled" className="text-sm font-medium text-slate-700">
            Guests earn points
          </label>
          <Switch
            id="loyalty-enabled"
            disabled={!canEdit}
            checked={form.enabled}
            onChange={(v) => set({ enabled: v })}
          />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        {number("pointsPer100", "Points per ₹100", "Earned on the paid total")}
        {number("pointValue", "₹ per point", "Discount when redeemed")}
        {number("minRedeem", "Minimum to redeem", "Points needed to use them")}
        {number("expiryDays", "Expire after (days)", "0 means never")}
      </div>
      {form.enabled && (
        <p className="mt-2 text-sm text-slate-600">
          A ₹1,000 bill earns {Math.floor(10 * form.pointsPer100)} points, worth ₹
          {(Math.floor(10 * form.pointsPer100) * form.pointValue).toFixed(0)} next time (
          {(form.pointsPer100 * form.pointValue).toFixed(1)}% back).
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      {canEdit && (
        <div className="mt-3 flex items-center gap-3">
          <Button
            type="button"
            disabled={save.isPending || !draft}
            onClick={async () => {
              setError(null);
              try {
                await save.mutateAsync(form);
                setDraft(null);
                setSaved(true);
              } catch (err) {
                setError(extractErrorMessage(err));
              }
            }}
          >
            Save loyalty rules
          </Button>
          {saved && <span className="text-sm font-medium text-emerald-700">Saved</span>}
        </div>
      )}
    </Card>
  );
}

function ProfileEditor({ profile, canEdit }: { profile: CustomerProfile; canEdit: boolean }) {
  const update = useUpdateCustomer();
  const c = profile.customer;
  const [name, setName] = useState(c.name);
  const [birthday, setBirthday] = useState(c.birthday);
  const [anniversary, setAnniversary] = useState(c.anniversary);
  const [tags, setTags] = useState(c.tags.join(", "));
  const [consent, setConsent] = useState(c.marketingConsent);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        try {
          await update.mutateAsync({
            id: c._id,
            input: {
              name: name.trim(),
              birthday: birthday.trim(),
              anniversary: anniversary.trim(),
              tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
              marketingConsent: consent,
            },
          });
          setSaved(true);
        } catch (err) {
          setError(extractErrorMessage(err));
        }
      }}
    >
      <label className="text-sm font-medium text-slate-700">
        Name
        <Input
          id="profile-name"
          className="mt-1"
          disabled={!canEdit}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Tags (comma separated)
        <Input className="mt-1" disabled={!canEdit} value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Birthday (MM-DD)
        <Input
          id="profile-birthday"
          className="mt-1"
          placeholder="08-15"
          disabled={!canEdit}
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Anniversary (MM-DD)
        <Input
          className="mt-1"
          placeholder="02-14"
          disabled={!canEdit}
          value={anniversary}
          onChange={(e) => setAnniversary(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input type="checkbox" disabled={!canEdit} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Agreed to receive offers
      </label>
      <div className="sm:col-span-2">
        <ErrorText>{error}</ErrorText>
        {canEdit && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={update.isPending}>
              Save guest
            </Button>
            {saved && <span className="text-sm font-medium text-emerald-700">Saved</span>}
          </div>
        )}
      </div>
    </form>
  );
}

function Profile({ id, canEdit, onClose }: { id: string; canEdit: boolean; onClose: () => void }) {
  const profile = useCustomerProfile(id);
  const p = profile.data;
  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{p?.customer.name || "Guest"}</h2>
          {p && (
            <p className="text-sm text-slate-500">
              {formatPhone(p.customer.phone)} · {p.customer.visitCount} visits · ₹{p.customer.totalSpend.toFixed(0)}{" "}
              spent · {p.customer.points} points
              {p.customer.expiringSoon > 0 && ` (${p.customer.expiringSoon} expire within 30 days)`}
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
      <ErrorText>{profile.error ? extractErrorMessage(profile.error) : null}</ErrorText>
      {p && (
        <div className="flex flex-col gap-4">
          <ProfileEditor key={p.customer._id} profile={p} canEdit={canEdit} />
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Visits</h3>
              <ul className="flex flex-col divide-y divide-slate-100 text-sm">
                {p.orders.map((o) => (
                  <li key={o._id} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {when(o.date)} · {o.invoiceNumber ?? o.orderType}
                      {o.status === "cancelled" && <span className="text-red-600"> · cancelled</span>}
                      {o.pointsUsed > 0 && <span className="text-slate-500"> · used {o.pointsUsed} pts</span>}
                    </span>
                    <span className="tabular-nums">{o.total != null ? `₹${o.total.toFixed(2)}` : "-"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Points history</h3>
              <ul className="flex flex-col divide-y divide-slate-100 text-sm">
                {p.ledger.map((e) => (
                  <li key={e._id} className="flex justify-between gap-2 py-1.5">
                    <span className="text-slate-600">
                      {when(e.createdAt)} · {e.note || e.type}
                    </span>
                    <span className={`tabular-nums ${e.points < 0 ? "text-red-600" : "text-green-700"}`}>
                      {e.points > 0 ? "+" : ""}
                      {e.points}
                    </span>
                  </li>
                ))}
                {p.ledger.length === 0 && <li className="py-1.5 text-slate-400">No points yet</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Customers() {
  const canEdit = useCanEdit("customers");
  const [segment, setSegment] = useState<Segment | "">("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const customers = useCustomers(segment || undefined, search || undefined);
  const list = customers.data ?? NO_CUSTOMERS;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Customers"
        description={
          <>
            Guests are added by phone number from the table form, the POS and the captain app, and updated when they
            pay.
          </>
        }
      />
      <LoyaltyCard canEdit={canEdit} />
      {openId && <Profile id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} />}
      <Card>
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center">
          <Tabs
            className="min-w-0 xl:flex-1"
            value={segment || "all"}
            onChange={(v) => setSegment(v === "all" ? "" : (v as Segment))}
            items={SEGMENTS.map((s) => ({ value: s.key || "all", label: s.label }))}
          />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q.trim());
            }}
          >
            <SearchInput
              id="customer-search"
              className="min-w-0 flex-1 xl:w-64"
              placeholder="Name or phone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </div>
        <ErrorText>{customers.error ? extractErrorMessage(customers.error) : null}</ErrorText>
        <TableWrap>
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Phone</th>
                <th className="text-right">Visits</th>
                <th className="text-right">Spent</th>
                <th className="text-right">Points</th>
                <th>Last visit</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr
                  key={c._id}
                  data-customer={c.name}
                  className="cursor-pointer border-t border-slate-100 hover:bg-orange-50"
                  onClick={() => setOpenId(c._id)}
                >
                  <td>
                    {c.name || "Guest"}{" "}
                    {c.tags.map((t) => (
                      <Badge key={t} tone="blue">
                        {t}
                      </Badge>
                    ))}
                  </td>
                  <td className="tabular-nums">{formatPhone(c.phone)}</td>
                  <td className="text-right tabular-nums">{c.visitCount}</td>
                  <td className="text-right tabular-nums">₹{c.totalSpend.toFixed(0)}</td>
                  <td className="text-right tabular-nums">{c.points}</td>
                  <td>{when(c.lastVisitAt)}</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No guests here yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
