import {
  Building2,
  Check,
  Clock,
  CookingPot,
  Copy,
  Eye,
  ImagePlus,
  Percent,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { currentFinancialYearLabel } from "../../features/orders/status";
import {
  PRINT_FONT_SIZE_LABELS,
  PRINT_PAPER_SIZE_LABELS,
  type BillingSettings,
  type InvoiceSettings,
  type KotSettings,
  type PrintFontSize,
  type PrintPaperSize,
  type Restaurant,
  type TaxRate,
} from "../../lib/types";
import { api, extractErrorMessage, uploadImage } from "../../shared/api/client";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ErrorText,
  Field,
  IconButton,
  Input,
  Page,
  PageHeader,
  Select,
  Switch,
  Tabs,
  Textarea,
} from "../../shared/ui/ui";

type SectionKey = "general" | "day" | "taxes" | "kot" | "billing" | "invoice" | "chat" | "delivery";

const SECTIONS: { value: SectionKey; label: string; icon: LucideIcon }[] = [
  { value: "general", label: "General", icon: Building2 },
  { value: "day", label: "Business day", icon: Clock },
  { value: "taxes", label: "Taxes", icon: Percent },
  { value: "kot", label: "Kitchen tickets", icon: CookingPot },
  { value: "billing", label: "Billing", icon: Wallet },
  { value: "invoice", label: "Invoice", icon: ReceiptText },
  { value: "chat", label: "Guest chat", icon: ShieldAlert },
  { value: "delivery", label: "Online delivery", icon: Truck },
];

function ToggleRow({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="py-3">
      <Switch id={id} checked={checked} onChange={onChange} label={label} description={description} />
    </div>
  );
}

function ChoiceCard({
  name,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
        checked ? "border-orange-400 bg-orange-50/60 ring-1 ring-orange-400" : "border-slate-200 hover:bg-slate-50"
      }`}
    >
      <input type="radio" name={name} className="mt-0.5" checked={checked} onChange={onChange} />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
    </label>
  );
}

const TIMEZONE_CHOICES: string[] =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "UTC"];

const DEFAULT_KOT_SETTINGS: KotSettings = {
  guestOrderMode: "auto",
  headerText: "Kitchen Order Ticket",
  showCustomerName: true,
  showTableInfo: true,
  footerNote: "",
  paperSize: "thermal80",
  fontSize: "normal",
  showLogo: false,
  showPrices: false,
  showJainTag: true,
};

const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  serviceChargePercent: 0,
  maxStaffDiscountPercent: 10,
  upiVpa: "",
  upiPayeeName: "",
};

const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  invoicePrefix: "INV",
  placeOfSupply: "",
  showCustomerPhone: true,
  footerNote: "Thank you for dining with us!",
  termsText: "",
  paperSize: "a5",
  fontSize: "normal",
  showLogo: true,
  showUnitPrice: true,
  showJainTag: true,
  autoPrintBill: false,
};

const PAPER_SIZE_OPTIONS = Object.entries(PRINT_PAPER_SIZE_LABELS) as [PrintPaperSize, string][];
const FONT_SIZE_OPTIONS = Object.entries(PRINT_FONT_SIZE_LABELS) as [PrintFontSize, string][];

export default function RestaurantSettings() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [siteTitle, setSiteTitle] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [gstin, setGstin] = useState("");
  const [fssaiLicense, setFssaiLicense] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [dayEndTime, setDayEndTime] = useState("00:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const dayEndTimeWarning = useMemo(() => {
    const [hour] = dayEndTime.split(":").map(Number);
    if (!Number.isFinite(hour) || hour < 5) return null;
    const label = new Date(`2000-01-01T${dayEndTime}:00`).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return `Heads up: with a ${label} cutoff, every order taken between midnight and ${label} is filed under the previous date - that is most of a trading day, so the Orders date filter and daily sales will look shifted by one day. Only keep this if you genuinely serve through ${label}; otherwise use 00:00.`;
  }, [dayEndTime]);

  const timezoneOptions = useMemo(
    () => (TIMEZONE_CHOICES.includes(timezone) ? TIMEZONE_CHOICES : [timezone, ...TIMEZONE_CHOICES]),
    [timezone]
  );
  const [prepBufferMinutes, setPrepBufferMinutes] = useState<number>(2);
  const [prepMessageTemplate, setPrepMessageTemplate] = useState(
    "Your order should be ready in about {minutes} minutes (around {time})."
  );
  const [chatModEnabled, setChatModEnabled] = useState(true);
  const [chatModMode, setChatModMode] = useState<"mask" | "block">("mask");
  const [chatModWords, setChatModWords] = useState("");
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [kotSettings, setKotSettings] = useState<KotSettings>(DEFAULT_KOT_SETTINGS);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS);
  const [billingSettings, setBillingSettings] = useState<BillingSettings>(DEFAULT_BILLING_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewingKot, setPreviewingKot] = useState(false);
  const [previewingInvoice, setPreviewingInvoice] = useState(false);
  const [aggSecret, setAggSecret] = useState("");
  const [aggBaseUrl, setAggBaseUrl] = useState("");
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [params, setParams] = useSearchParams();
  const section = (SECTIONS.find((s) => s.value === params.get("section"))?.value ?? "general") as SectionKey;
  function openSection(next: SectionKey) {
    setParams({ section: next }, { replace: true });
    setMessage(null);
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "settings-sections",
        title: "Eight sections",
        description:
          "General (name, address, logo, GSTIN), Business day (day-end time, timezone), Taxes, Kitchen tickets, Billing, Invoice, Guest chat and Online delivery. Switch sections here - each has its own Save.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  useEffect(() => {
    api
      .get<{ secret: string; baseUrl: string }>("/aggregator/config")
      .then((res) => {
        setAggSecret(res.data.secret || "");
        setAggBaseUrl(res.data.baseUrl || "");
      })
      .catch(() => {});
  }, []);

  async function regenerateSecret() {
    setError(null);
    setRotatingSecret(true);
    try {
      const res = await api.post<{ secret: string }>("/aggregator/secret");
      setAggSecret(res.data.secret);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setRotatingSecret(false);
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
      })
      .catch(() => {});
  }

  useEffect(() => {
    api
      .get<Restaurant>("/restaurant/settings")
      .then((res) => {
        setName(res.data.name);
        setAddress(res.data.address || "");
        setLogoUrl(res.data.logoUrl || "");
        setSiteTitle(res.data.siteTitle || "");
        setFaviconUrl(res.data.faviconUrl || "");
        setGstin(res.data.gstin || "");
        setFssaiLicense(res.data.fssaiLicense || "");
        setPublicUrl(res.data.publicUrl || "");
        setDayEndTime(res.data.dayEndTime || "00:00");
        if (res.data.timezone) setTimezone(res.data.timezone);
        setPrepBufferMinutes(res.data.prepBufferMinutes ?? 2);
        if (res.data.prepMessageTemplate !== undefined) setPrepMessageTemplate(res.data.prepMessageTemplate);
        if (res.data.chatModeration) {
          setChatModEnabled(res.data.chatModeration.enabled);
          setChatModMode(res.data.chatModeration.mode);
          setChatModWords((res.data.chatModeration.customWords || []).join(", "));
        }
        setTaxRates(res.data.taxRates);
        if (res.data.kotSettings) setKotSettings(res.data.kotSettings);
        if (res.data.invoiceSettings) setInvoiceSettings(res.data.invoiceSettings);
        if (res.data.billingSettings) setBillingSettings({ ...DEFAULT_BILLING_SETTINGS, ...res.data.billingSettings });
      })
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  function updateTaxRate(idx: number, field: keyof TaxRate, value: string) {
    setTaxRates((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: field === "percent" ? Number(value) : value } : t))
    );
  }

  function addTaxRate() {
    setTaxRates((prev) => [...prev, { name: "", percent: 0 }]);
  }

  function removeTaxRate(idx: number) {
    setTaxRates((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploadingLogo(true);
    try {
      const url = await uploadImage(file, "logo");
      setLogoUrl(url);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleFaviconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploadingFavicon(true);
    try {
      setFaviconUrl(await uploadImage(file, "logo"));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploadingFavicon(false);
    }
  }

  async function previewKot() {
    setError(null);
    // Open synchronously so it isn't popup-blocked once the await below resolves.
    const pdfTab = window.open("", "_blank");
    setPreviewingKot(true);
    try {
      const res = await api.post("/restaurant/kot-preview", { name, logoUrl, kotSettings }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      if (pdfTab) pdfTab.location.href = url;
    } catch (err) {
      pdfTab?.close();
      setError(extractErrorMessage(err));
    } finally {
      setPreviewingKot(false);
    }
  }

  async function previewInvoice() {
    setError(null);
    const pdfTab = window.open("", "_blank");
    setPreviewingInvoice(true);
    try {
      const res = await api.post(
        "/restaurant/invoice-preview",
        { name, logoUrl, address, gstin, fssaiLicense, taxRates, invoiceSettings },
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(res.data);
      if (pdfTab) pdfTab.location.href = url;
    } catch (err) {
      pdfTab?.close();
      setError(extractErrorMessage(err));
    } finally {
      setPreviewingInvoice(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      await api.put("/restaurant/settings", {
        name,
        address,
        logoUrl,
        siteTitle,
        faviconUrl,
        gstin,
        fssaiLicense,
        publicUrl,
        dayEndTime,
        timezone,
        prepBufferMinutes,
        prepMessageTemplate,
        chatModeration: {
          enabled: chatModEnabled,
          mode: chatModMode,
          customWords: chatModWords
            .split(/[\n,]/)
            .map((w) => w.trim())
            .filter(Boolean),
        },
        taxRates,
        kotSettings,
        invoiceSettings,
        billingSettings,
      });
      setMessage("Settings saved");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const aggBase = (aggBaseUrl || publicUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(
    /\/$/,
    ""
  );
  const webhookUrls = [
    { label: "Swiggy", url: `${aggBase}/api/webhooks/aggregator/swiggy`, key: "swiggy" },
    { label: "Zomato", url: `${aggBase}/api/webhooks/aggregator/zomato`, key: "zomato" },
  ];
  const current = SECTIONS.find((s) => s.value === section)!;

  return (
    <Page>
      <PageHeader
        title="Restaurant Settings"
        description="Your restaurant's details, business day, taxes, tickets and bills. Changes apply as soon as you save."
      />

      <div className="lg:hidden" data-tour="settings-sections">
        <Tabs value={section} onChange={openSection} items={SECTIONS} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[14rem_1fr]">
        <nav
          aria-label="Settings sections"
          data-tour="settings-sections"
          className="sticky top-24 hidden flex-col gap-1 lg:flex"
        >
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = s.value === section;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => openSection(s.value)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors ${
                  active
                    ? "bg-white text-orange-700 shadow-card ring-1 ring-slate-200"
                    : "text-slate-600 hover:bg-white/70"
                }`}
              >
                <Icon size={16} className={active ? "text-orange-600" : "text-slate-400"} aria-hidden="true" />
                {s.label}
              </button>
            );
          })}
        </nav>

        <form onSubmit={submit} className="flex min-w-0 flex-col gap-5">
          {section === "general" && (
            <>
              <Card>
                <CardHeader
                  icon={Building2}
                  title="Restaurant details"
                  description="Printed on bills and shown to guests."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Restaurant name" htmlFor="rs-name">
                    <Input id="rs-name" value={name} onChange={(e) => setName(e.target.value)} required />
                  </Field>
                  <Field label="Address" htmlFor="rs-address">
                    <Input id="rs-address" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </Field>
                  <Field label="GST number" htmlFor="rs-gstin" hint="Prints on the invoice header.">
                    <Input
                      id="rs-gstin"
                      placeholder="e.g. 22AAAAA0000A1Z5"
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value)}
                    />
                  </Field>
                  <Field label="FSSAI registration number" htmlFor="rs-fssai" hint="Prints on the invoice header.">
                    <Input
                      id="rs-fssai"
                      placeholder="e.g. 12345678901234"
                      value={fssaiLicense}
                      onChange={(e) => setFssaiLicense(e.target.value)}
                    />
                  </Field>
                </div>
              </Card>

              <Card>
                <CardHeader icon={ImagePlus} title="Branding" description="Logo, browser tab title and icon." />
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <ImagePlus size={20} aria-hidden="true" />
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="text-sm font-medium text-slate-700">Logo</span>
                      <input
                        type="file"
                        aria-label="Upload logo"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={handleLogoFile}
                        disabled={uploadingLogo}
                      />
                      <Input
                        aria-label="Logo URL"
                        placeholder="or paste an image URL"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                      />
                      {uploadingLogo && <span className="text-xs text-slate-500">Uploading…</span>}
                    </div>
                  </div>
                  <Field
                    label="Browser tab title"
                    htmlFor="rs-site-title"
                    hint="Shown on the browser tab and bookmarks. Leave blank to use the restaurant name."
                  >
                    <Input
                      id="rs-site-title"
                      placeholder={name || "e.g. Banne.Kaffi - Order Online"}
                      value={siteTitle}
                      onChange={(e) => setSiteTitle(e.target.value)}
                    />
                  </Field>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-slate-700">Favicon</span>
                    <div className="flex flex-wrap items-center gap-3">
                      {faviconUrl && (
                        <img
                          src={faviconUrl}
                          alt=""
                          className="h-9 w-9 rounded-md border border-slate-200 object-cover"
                        />
                      )}
                      <input type="file" aria-label="Upload favicon" accept="image/*" onChange={handleFaviconFile} />
                      {uploadingFavicon && <span className="text-xs text-slate-500">Uploading…</span>}
                      {faviconUrl && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={Trash2}
                          className="!text-red-600 hover:!bg-red-50"
                          onClick={() => setFaviconUrl("")}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      The small icon on the browser tab. A square PNG around 64×64 works best.
                    </p>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title="Public address" description="Used in table QR codes and shared bill links." />
                <Field
                  label="Public URL"
                  htmlFor="rs-public-url"
                  hint="Needed when running behind Docker or a LAN IP, since QR codes would otherwise use the address you're viewing the admin from (like localhost). Leave blank to use the current address."
                >
                  <Input
                    id="rs-public-url"
                    inputMode="url"
                    placeholder="e.g. http://192.168.1.20:8080 or https://your-domain.com"
                    value={publicUrl}
                    onChange={(e) => setPublicUrl(e.target.value)}
                  />
                </Field>
              </Card>
            </>
          )}

          {section === "day" && (
            <>
              <Card>
                <CardHeader
                  icon={Clock}
                  title="Business day"
                  description="When one trading day rolls over into the next. Dashboards, reports, token numbers and date filters all use it."
                />
                <div className="flex flex-col gap-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ChoiceCard
                      name="day-end"
                      checked={dayEndTime === "00:00"}
                      onChange={() => setDayEndTime("00:00")}
                      title="Close before midnight"
                      description="Each day matches the calendar (split at 12am)."
                    />
                    <ChoiceCard
                      name="day-end"
                      checked={dayEndTime !== "00:00"}
                      onChange={() => setDayEndTime(dayEndTime === "00:00" ? "02:00" : dayEndTime)}
                      title="Open past midnight"
                      description="Late orders count toward the previous day."
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Day-end time"
                      htmlFor="rs-day-end"
                      hint="This is when the day rolls over, not your closing time."
                    >
                      <Input
                        id="rs-day-end"
                        type="time"
                        value={dayEndTime}
                        onChange={(e) => setDayEndTime(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Timezone"
                      htmlFor="rs-timezone"
                      hint={
                        <>
                          Local time there: <strong>{new Date().toLocaleString([], { timeZone: timezone })}</strong>
                        </>
                      }
                    >
                      <Select id="rs-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                        {timezoneOptions.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  {dayEndTimeWarning && <Alert tone="warning">{dayEndTimeWarning}</Alert>}
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Preparation time"
                  description="Each dish has its own prep time under Food Items. The slowest dish in a round plus this buffer sets when the order is due."
                />
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <Field label="Delay buffer (min)" htmlFor="rs-prep-buffer">
                    <Input
                      id="rs-prep-buffer"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={prepBufferMinutes}
                      onChange={(e) => setPrepBufferMinutes(Number(e.target.value))}
                    />
                  </Field>
                  <Field
                    label="Message shown to the guest"
                    htmlFor="rs-prep-message"
                    hint={
                      <>
                        Use <code className="rounded bg-slate-100 px-1">{"{minutes}"}</code> for the wait left and{" "}
                        <code className="rounded bg-slate-100 px-1">{"{time}"}</code> for the ready time. Leave empty to
                        hide it.
                      </>
                    }
                  >
                    <Input
                      id="rs-prep-message"
                      value={prepMessageTemplate}
                      onChange={(e) => setPrepMessageTemplate(e.target.value)}
                      placeholder="Leave empty to show nothing"
                    />
                  </Field>
                </div>
              </Card>
            </>
          )}

          {section === "taxes" && (
            <Card>
              <CardHeader
                icon={Percent}
                title="Tax rates"
                description="Applied to the taxable value of every bill. Paid bills keep the rates they were billed with."
                actions={
                  <Button type="button" size="sm" variant="soft" icon={Plus} onClick={addTaxRate}>
                    Add tax
                  </Button>
                }
              />
              <div className="flex flex-col gap-2">
                {taxRates.length === 0 && <p className="text-sm text-slate-500">No taxes. Bills will show no GST.</p>}
                {taxRates.map((rate, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      aria-label="Tax name"
                      placeholder="Name (e.g. CGST)"
                      value={rate.name}
                      onChange={(e) => updateTaxRate(idx, "name", e.target.value)}
                      className="flex-1"
                    />
                    <div className="relative w-28 shrink-0">
                      <Input
                        aria-label="Tax percent"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="0.01"
                        placeholder="0"
                        value={rate.percent}
                        onChange={(e) => updateTaxRate(idx, "percent", e.target.value)}
                        className="pr-7"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">
                        %
                      </span>
                    </div>
                    <IconButton
                      icon={Trash2}
                      label="Remove tax"
                      className="!text-red-600 hover:!bg-red-50"
                      onClick={() => removeTaxRate(idx)}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {section === "kot" && (
            <>
              <Card>
                <CardHeader
                  title="Guest orders from the table QR"
                  description="What happens when a guest places an order."
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoiceCard
                    name="guest-order-mode"
                    checked={kotSettings.guestOrderMode === "auto"}
                    onChange={() => setKotSettings((prev) => ({ ...prev, guestOrderMode: "auto" }))}
                    title="Send to the kitchen straight away"
                    description="The KOT prints as soon as the guest places the order."
                  />
                  <ChoiceCard
                    name="guest-order-mode"
                    checked={kotSettings.guestOrderMode === "accept"}
                    onChange={() => setKotSettings((prev) => ({ ...prev, guestOrderMode: "accept" }))}
                    title="Wait for staff to accept"
                    description="New items wait in the Kitchen Queue until someone prints the KOT."
                  />
                </div>
              </Card>

              <Card>
                <CardHeader
                  icon={CookingPot}
                  title="Kitchen Order Ticket"
                  description="What's printed on tickets sent to the kitchen."
                  actions={
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      icon={Eye}
                      loading={previewingKot}
                      onClick={previewKot}
                    >
                      Preview
                    </Button>
                  }
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Paper size" htmlFor="kot-paper">
                    <Select
                      id="kot-paper"
                      value={kotSettings.paperSize}
                      onChange={(e) =>
                        setKotSettings((prev) => ({ ...prev, paperSize: e.target.value as PrintPaperSize }))
                      }
                    >
                      {PAPER_SIZE_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Font size" htmlFor="kot-font">
                    <Select
                      id="kot-font"
                      value={kotSettings.fontSize}
                      onChange={(e) =>
                        setKotSettings((prev) => ({ ...prev, fontSize: e.target.value as PrintFontSize }))
                      }
                    >
                      {FONT_SIZE_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Header text" htmlFor="kot-header">
                    <Input
                      id="kot-header"
                      value={kotSettings.headerText}
                      onChange={(e) => setKotSettings((prev) => ({ ...prev, headerText: e.target.value }))}
                    />
                  </Field>
                  <Field label="Footer note" htmlFor="kot-footer">
                    <Input
                      id="kot-footer"
                      placeholder="e.g. Prepare fresh, serve hot"
                      value={kotSettings.footerNote}
                      onChange={(e) => setKotSettings((prev) => ({ ...prev, footerNote: e.target.value }))}
                    />
                  </Field>
                </div>
                <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                  <ToggleRow
                    id="kot-logo"
                    checked={kotSettings.showLogo}
                    onChange={(v) => setKotSettings((prev) => ({ ...prev, showLogo: v }))}
                    label="Show logo"
                  />
                  <ToggleRow
                    id="kot-customer"
                    checked={kotSettings.showCustomerName}
                    onChange={(v) => setKotSettings((prev) => ({ ...prev, showCustomerName: v }))}
                    label="Show customer name"
                  />
                  <ToggleRow
                    id="kot-table"
                    checked={kotSettings.showTableInfo}
                    onChange={(v) => setKotSettings((prev) => ({ ...prev, showTableInfo: v }))}
                    label="Show order and table info"
                  />
                  <ToggleRow
                    id="kot-prices"
                    checked={kotSettings.showPrices}
                    onChange={(v) => setKotSettings((prev) => ({ ...prev, showPrices: v }))}
                    label="Show item prices"
                  />
                </div>
              </Card>
            </>
          )}

          {section === "billing" && (
            <Card>
              <CardHeader
                icon={Wallet}
                title="Billing and payments"
                description="Service charge, how much discount staff can give, and the UPI ID printed as a QR code on unpaid bills."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Service charge (%)"
                  htmlFor="service-charge"
                  hint="0 turns it off. Staff can remove it per bill."
                >
                  <Input
                    id="service-charge"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={20}
                    step="0.5"
                    value={billingSettings.serviceChargePercent}
                    onChange={(e) =>
                      setBillingSettings((prev) => ({ ...prev, serviceChargePercent: Number(e.target.value) || 0 }))
                    }
                  />
                </Field>
                <Field label="Staff discount limit (%)" htmlFor="staff-discount-limit" hint="The owner has no limit.">
                  <Input
                    id="staff-discount-limit"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={billingSettings.maxStaffDiscountPercent}
                    onChange={(e) =>
                      setBillingSettings((prev) => ({ ...prev, maxStaffDiscountPercent: Number(e.target.value) || 0 }))
                    }
                  />
                </Field>
                <Field label="UPI ID" htmlFor="upi-vpa">
                  <Input
                    id="upi-vpa"
                    placeholder="restaurant@okicici"
                    value={billingSettings.upiVpa}
                    onChange={(e) => setBillingSettings((prev) => ({ ...prev, upiVpa: e.target.value.trim() }))}
                  />
                </Field>
                <Field label="UPI payee name" htmlFor="upi-payee">
                  <Input
                    id="upi-payee"
                    maxLength={60}
                    placeholder={name || "Restaurant name"}
                    value={billingSettings.upiPayeeName}
                    onChange={(e) => setBillingSettings((prev) => ({ ...prev, upiPayeeName: e.target.value }))}
                  />
                </Field>
              </div>
            </Card>
          )}

          {section === "invoice" && (
            <Card>
              <CardHeader
                icon={ReceiptText}
                title="Invoice"
                description="What's printed on customer bills. GST and FSSAI numbers print automatically when set."
                actions={
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={Eye}
                    loading={previewingInvoice}
                    onClick={previewInvoice}
                  >
                    Preview
                  </Button>
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Invoice prefix"
                  htmlFor="invoice-prefix"
                  hint={`Bills are numbered ${invoiceSettings.invoicePrefix || "INV"}/${currentFinancialYearLabel()}/000001 and restart each April.`}
                >
                  <Input
                    id="invoice-prefix"
                    className="uppercase"
                    maxLength={3}
                    value={invoiceSettings.invoicePrefix}
                    onChange={(e) =>
                      setInvoiceSettings((prev) => ({
                        ...prev,
                        invoicePrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                      }))
                    }
                  />
                </Field>
                <Field label="Place of supply (state)" htmlFor="place-of-supply">
                  <Input
                    id="place-of-supply"
                    maxLength={60}
                    value={invoiceSettings.placeOfSupply}
                    onChange={(e) => setInvoiceSettings((prev) => ({ ...prev, placeOfSupply: e.target.value }))}
                    placeholder="Karnataka"
                  />
                </Field>
                <Field label="Paper size" htmlFor="invoice-paper">
                  <Select
                    id="invoice-paper"
                    value={invoiceSettings.paperSize}
                    onChange={(e) =>
                      setInvoiceSettings((prev) => ({ ...prev, paperSize: e.target.value as PrintPaperSize }))
                    }
                  >
                    {PAPER_SIZE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Font size" htmlFor="invoice-font">
                  <Select
                    id="invoice-font"
                    value={invoiceSettings.fontSize}
                    onChange={(e) =>
                      setInvoiceSettings((prev) => ({ ...prev, fontSize: e.target.value as PrintFontSize }))
                    }
                  >
                    {FONT_SIZE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Footer note" htmlFor="invoice-footer">
                  <Input
                    id="invoice-footer"
                    placeholder="e.g. Thank you for dining with us!"
                    value={invoiceSettings.footerNote}
                    onChange={(e) => setInvoiceSettings((prev) => ({ ...prev, footerNote: e.target.value }))}
                  />
                </Field>
                <Field label="Terms / notes" htmlFor="invoice-terms">
                  <Textarea
                    id="invoice-terms"
                    rows={2}
                    placeholder="e.g. Prices are inclusive of all taxes."
                    value={invoiceSettings.termsText}
                    onChange={(e) => setInvoiceSettings((prev) => ({ ...prev, termsText: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                <ToggleRow
                  id="invoice-logo"
                  checked={invoiceSettings.showLogo}
                  onChange={(v) => setInvoiceSettings((prev) => ({ ...prev, showLogo: v }))}
                  label="Show logo"
                />
                <ToggleRow
                  id="invoice-phone"
                  checked={invoiceSettings.showCustomerPhone}
                  onChange={(v) => setInvoiceSettings((prev) => ({ ...prev, showCustomerPhone: v }))}
                  label="Show customer phone number"
                />
                <ToggleRow
                  id="invoice-unit"
                  checked={invoiceSettings.showUnitPrice}
                  onChange={(v) => setInvoiceSettings((prev) => ({ ...prev, showUnitPrice: v }))}
                  label="Show unit price column"
                />
                <ToggleRow
                  id="invoice-autoprint"
                  checked={invoiceSettings.autoPrintBill}
                  onChange={(v) => setInvoiceSettings((prev) => ({ ...prev, autoPrintBill: v }))}
                  label="Print bills automatically"
                  description="Sends the bill to the bill printer as soon as it's generated."
                />
              </div>
            </Card>
          )}

          {section === "chat" && (
            <Card>
              <CardHeader
                icon={ShieldAlert}
                title="Chat abuse filter"
                description="A built-in list of abusive and violent terms is always applied when this is on. Filtered messages are marked in Messages."
              />
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-slate-200 px-4">
                  <ToggleRow
                    id="chat-filter"
                    checked={chatModEnabled}
                    onChange={setChatModEnabled}
                    label="Filter abusive language"
                    description="Checks messages between guests and staff."
                  />
                </div>
                {chatModEnabled && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ChoiceCard
                        name="chatModMode"
                        checked={chatModMode === "mask"}
                        onChange={() => setChatModMode("mask")}
                        title="Mask the words"
                        description="Replaced with *** and the message still sends."
                      />
                      <ChoiceCard
                        name="chatModMode"
                        checked={chatModMode === "block"}
                        onChange={() => setChatModMode("block")}
                        title="Block the message"
                        description="The message isn't sent at all."
                      />
                    </div>
                    <Field label="Extra banned words" htmlFor="chat-words" hint="Separate words with commas.">
                      <Textarea
                        id="chat-words"
                        rows={2}
                        value={chatModWords}
                        onChange={(e) => setChatModWords(e.target.value)}
                        placeholder="e.g. local slurs to block"
                      />
                    </Field>
                  </>
                )}
              </div>
            </Card>
          )}

          {section === "delivery" && (
            <>
              <Card>
                <CardHeader
                  icon={Truck}
                  title="Online delivery (Swiggy / Zomato)"
                  description="Let Swiggy, Zomato or a middleware push live orders into this system. They arrive as delivery orders, ready for the kitchen."
                />
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">1. Webhook URLs</h3>
                      <p className="text-xs text-slate-500">
                        Paste these into the partner or middleware dashboard as the "new order" webhook. They use your
                        Public URL, so set that to a public HTTPS address first.
                      </p>
                    </div>
                    {webhookUrls.map((w) => (
                      <Field key={w.key} label={w.label} htmlFor={`webhook-${w.key}`}>
                        <div className="flex gap-2">
                          <Input
                            id={`webhook-${w.key}`}
                            className="font-mono text-xs"
                            readOnly
                            value={w.url}
                            onFocus={(e) => e.currentTarget.select()}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            icon={copied === w.key ? Check : Copy}
                            onClick={() => copyText(w.url, w.key)}
                          >
                            {copied === w.key ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </Field>
                    ))}
                  </div>

                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-5">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">2. Webhook secret</h3>
                      <p className="text-xs text-slate-500">
                        Sent as an <code className="rounded bg-slate-100 px-1">x-webhook-secret</code> header (or{" "}
                        <code className="rounded bg-slate-100 px-1">?secret=</code>). Regenerating it invalidates the
                        old one.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        aria-label="Webhook secret"
                        className="min-w-0 flex-1 font-mono text-xs"
                        readOnly
                        placeholder="Not generated yet"
                        value={aggSecret}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      {aggSecret && (
                        <Button
                          type="button"
                          variant="secondary"
                          icon={copied === "secret" ? Check : Copy}
                          onClick={() => copyText(aggSecret, "secret")}
                        >
                          {copied === "secret" ? "Copied" : "Copy"}
                        </Button>
                      )}
                      <Button type="button" icon={RefreshCw} loading={rotatingSecret} onClick={regenerateSecret}>
                        {aggSecret ? "Regenerate" : "Generate"}
                      </Button>
                    </div>
                  </div>

                  <details className="rounded-xl border border-slate-200 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                      3. Order payload format
                    </summary>
                    <p className="mt-2 text-xs text-slate-500">
                      POST JSON in this shape. Items are matched to your menu by name where possible; unmatched items
                      are kept as free-form lines using the price you send.
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                      {`{
  "externalOrderId": "SW-123456",
  "customerName": "Ananya",
  "customerPhone": "+91 98765 43210",
  "instructions": "Ring the bell twice",
  "paymentMethod": "online",
  "items": [
    { "name": "Masala Dosa", "quantity": 2, "price": 120 },
    { "name": "Filter Coffee", "quantity": 1, "price": 40, "note": "less sugar" }
  ]
}`}
                    </pre>
                  </details>
                </div>
              </Card>
              <ErrorText>{error}</ErrorText>
            </>
          )}

          {section !== "delivery" && (
            <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-raised backdrop-blur md:bottom-4">
              <div className="min-w-0 flex-1 text-sm">
                {error ? (
                  <span className="font-medium text-red-600">{error}</span>
                ) : message ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                    <Check size={16} aria-hidden="true" />
                    {message}
                  </span>
                ) : (
                  <span className="text-slate-500">Editing {current.label.toLowerCase()} settings</span>
                )}
              </div>
              <Button type="submit" loading={saving} icon={Check}>
                Save settings
              </Button>
            </div>
          )}
        </form>
      </div>
    </Page>
  );
}
