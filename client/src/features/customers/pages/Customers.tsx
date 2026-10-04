import { Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useCanEdit } from "../../../lib/adminAuth";
import type { BirthdaySmsSettings, CustomerProfile, CustomerSummary, LoyaltySettings } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { DATE, MONEY, sheet } from "../../../shared/export/excel";
import { ExcelButton } from "../../../shared/ui/ExcelButton";
import { usePageTour, type TourStep } from "../../../shared/ui/PageTour";
import {
  Alert,
  Badge,
  Button,
  Card,
  ErrorText,
  IconButton,
  Input,
  PageHeader,
  SearchInput,
  Switch,
  TableWrap,
  Tabs,
  Textarea,
} from "../../../shared/ui/ui";
import type { Segment } from "../api";
import { CreditSection, DuesCard } from "../components/CreditSection";
import {
  useBirthdaySmsSettings,
  useCreateSmsTemplate,
  useCustomerProfile,
  useCustomers,
  useDeleteSmsTemplate,
  useLoyaltySettings,
  useSaveBirthdaySmsSettings,
  useSaveLoyaltySettings,
  useSendBirthdaySmsNow,
  useSendSmsCampaign,
  useSmsCampaigns,
  useSmsTemplates,
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

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatBirthday(monthDay: string) {
  const [month, day] = monthDay.split("-");
  const label = MONTH_LABELS[Number(month) - 1];
  if (!label || !day) return "-";
  return `${Number(day)} ${label}`;
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

function BirthdaySmsCard({ canEdit }: { canEdit: boolean }) {
  const settings = useBirthdaySmsSettings();
  const save = useSaveBirthdaySmsSettings();
  const sendNow = useSendBirthdaySmsNow();
  const [draft, setDraft] = useState<BirthdaySmsSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const form = draft ?? settings.data;
  if (!form) return null;
  const set = (patch: Partial<BirthdaySmsSettings>) => {
    setSaved(false);
    setDraft({ ...form, ...patch });
  };

  async function sendBirthdaySmsNow() {
    setError(null);
    setSendResult(null);
    try {
      const result = await sendNow.mutateAsync();
      setSendResult(
        result.sentCount === 0
          ? "No one has a birthday today."
          : `Sent to ${result.sentCount} guest${result.sentCount === 1 ? "" : "s"}.`
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Birthday SMS</h2>
        <div className="flex items-center gap-3">
          <label htmlFor="birthday-sms-enabled" className="text-sm font-medium text-slate-700">
            Text guests on their birthday
          </label>
          <Switch
            id="birthday-sms-enabled"
            disabled={!canEdit}
            checked={form.enabled}
            onChange={(v) => set({ enabled: v })}
          />
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Sent automatically once a day to any guest whose birthday (from the table sign-in form) is today. Needs a
        phone number on file and only ever sends once per guest per year.
      </p>
      <label className="mt-3 block text-sm font-medium text-slate-700">
        Message template
        <Textarea
          id="birthday-sms-template"
          className="mt-1"
          rows={3}
          disabled={!canEdit}
          maxLength={300}
          value={form.template}
          onChange={(e) => set({ template: e.target.value })}
        />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          Use <code>{"{name}"}</code> and <code>{"{restaurant}"}</code> - they're filled in automatically.
        </span>
      </label>
      <ErrorText>{error}</ErrorText>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
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
            Save birthday SMS
          </Button>
          {saved && <span className="text-sm font-medium text-emerald-700">Saved</span>}
          <Button
            type="button"
            variant="secondary"
            icon={Send}
            disabled={sendNow.isPending || !!draft}
            title={draft ? "Save your changes first" : undefined}
            onClick={sendBirthdaySmsNow}
          >
            {sendNow.isPending ? "Sending..." : "Send now"}
          </Button>
          {sendResult && <span className="text-sm font-medium text-emerald-700">{sendResult}</span>}
        </div>
      )}
    </Card>
  );
}

function BulkSmsCard({ canEdit }: { canEdit: boolean }) {
  const templates = useSmsTemplates();
  const campaigns = useSmsCampaigns();
  const createTemplate = useCreateSmsTemplate();
  const deleteTemplate = useDeleteSmsTemplate();
  const sendCampaign = useSendSmsCampaign();

  const [message, setMessage] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createTemplate.mutateAsync({ name: templateName.trim(), message: templateMessage.trim() });
      setTemplateName("");
      setTemplateMessage("");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function send() {
    if (!message.trim()) return;
    if (!window.confirm("Send this message by SMS to every guest who agreed to receive offers?")) return;
    setError(null);
    setResult(null);
    try {
      const campaign = await sendCampaign.mutateAsync(message.trim());
      setResult(`Sent to ${campaign.sentCount} of ${campaign.recipientCount} guests.`);
      setMessage("");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Bulk SMS</h2>
      <p className="mt-1 text-sm text-slate-500">
        Send a one-off text - an upcoming offer, a festival greeting, a live show tonight - to every guest who agreed
        to receive offers ("Agreed to offers" segment below).
      </p>

      <label className="mt-3 block text-sm font-medium text-slate-700">
        Message
        <Textarea
          className="mt-1"
          rows={3}
          disabled={!canEdit}
          maxLength={300}
          placeholder="e.g. Diwali special this weekend - 20% off your bill. See you soon!"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      {result && (
        <Alert tone="success" onClose={() => setResult(null)} className="mt-2">
          {result}
        </Alert>
      )}
      <ErrorText>{error}</ErrorText>
      {canEdit && (
        <div className="mt-3">
          <Button type="button" icon={Send} disabled={sendCampaign.isPending || !message.trim()} onClick={send}>
            {sendCampaign.isPending ? "Sending..." : "Send to guests who agreed to offers"}
          </Button>
        </div>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-semibold text-slate-800">Saved templates</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {(templates.data ?? []).map((t) => (
            <li key={t._id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-2.5">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setMessage(t.message)}
                title="Use this template"
              >
                <p className="text-sm font-medium text-slate-800">{t.name}</p>
                <p className="truncate text-xs text-slate-500">{t.message}</p>
              </button>
              {canEdit && (
                <IconButton
                  size="sm"
                  icon={Trash2}
                  label={`Delete template ${t.name}`}
                  className="!text-red-600 hover:!bg-red-50"
                  onClick={() => {
                    if (window.confirm(`Delete template "${t.name}"?`)) deleteTemplate.mutate(t._id);
                  }}
                />
              )}
            </li>
          ))}
          {templates.data?.length === 0 && <p className="text-sm text-slate-500">No saved templates yet.</p>}
        </ul>
        {canEdit && (
          <form onSubmit={saveTemplate} className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-start">
            <Input
              placeholder="Template name"
              maxLength={60}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              required
            />
            <Input
              placeholder="Message"
              maxLength={300}
              value={templateMessage}
              onChange={(e) => setTemplateMessage(e.target.value)}
              required
            />
            <Button type="submit" variant="secondary" disabled={createTemplate.isPending}>
              Save template
            </Button>
          </form>
        )}
      </div>

      {(campaigns.data?.length ?? 0) > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-800">Recent campaigns</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {campaigns.data!.slice(0, 5).map((c) => (
              <li key={c._id} className="text-sm text-slate-600">
                <span className="text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</span>{" "}
                <span className="font-medium text-slate-800">{c.sentCount}/{c.recipientCount} sent</span> -{" "}
                <span className="truncate">{c.message}</span>
              </li>
            ))}
          </ul>
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
          <CreditSection key={`credit-${p.customer._id}`} customerId={p.customer._id} name={p.customer.name} />
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

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "customers-loyalty",
        title: "Loyalty points",
        description: "Turn loyalty on, set how many points a bill earns and what a point is worth when redeemed.",
      },
      {
        target: "customers-birthday-sms",
        title: "Birthday SMS",
        description: "Text guests automatically on their birthday, with a template you write.",
      },
      {
        target: "customers-bulk-sms",
        title: "Bulk SMS",
        description: "Send a one-off message to every guest who agreed to receive offers - for a new offer, a festival, or a live show.",
      },
      {
        target: "customers-filters",
        title: "Segments and search",
        description: "Filter by regulars, lapsed guests, birthdays this week or who's agreed to offers, or search by name/phone.",
      },
      {
        target: "customers-list",
        title: "Guest list",
        description: "Click a guest to see their visit history, loyalty ledger and edit their details.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

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
        actions={
          <ExcelButton
            fileName={`customers-${segment || "everyone"}`}
            disabled={list.length === 0}
            sheets={() => [
              sheet({
                name: "Customers",
                rows: list,
                columns: [
                  {
                    header: "Name",
                    value: (c) => c.name || "Guest",
                    width: 22,
                  },
                  { header: "Phone", value: (c) => `+${c.phone}`, width: 16 },
                  { header: "Visits", value: (c) => c.visitCount },
                  {
                    header: "Spent",
                    value: (c) => c.totalSpend,
                    format: MONEY,
                  },
                  { header: "Points", value: (c) => c.points },
                  {
                    header: "Last visit",
                    value: (c) => (c.lastVisitAt ? new Date(c.lastVisitAt) : null),
                    format: DATE,
                  },
                  {
                    header: "Tags",
                    value: (c) => c.tags.join(", "),
                    width: 20,
                  },
                ],
              }),
            ]}
          />
        }
      />
      <div data-tour="customers-loyalty">
        <LoyaltyCard canEdit={canEdit} />
      </div>
      <div data-tour="customers-birthday-sms">
        <BirthdaySmsCard canEdit={canEdit} />
      </div>
      <div data-tour="customers-bulk-sms">
        <BulkSmsCard canEdit={canEdit} />
      </div>
      {openId && <Profile id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} />}
      <DuesCard onOpen={setOpenId} />
      <Card data-tour="customers-list">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center" data-tour="customers-filters">
          <Tabs
            className="min-w-0 xl:flex-1"
            value={segment || "all"}
            onChange={(v) => setSegment(v === "all" ? "" : (v as Segment))}
            items={SEGMENTS.map((s) => ({
              value: s.key || "all",
              label: s.label,
            }))}
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
                <th>Birthday</th>
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
                  <td>{c.birthday ? formatBirthday(c.birthday) : "-"}</td>
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
