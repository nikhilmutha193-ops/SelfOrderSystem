import { useEffect, useMemo, useState } from "react";
import { api, extractErrorMessage, uploadImage } from "../../lib/apiClient";
import { Button, Card, ErrorText, Input, Select, Textarea } from "../../components/ui";
import {
  PRINT_FONT_SIZE_LABELS,
  PRINT_PAPER_SIZE_LABELS,
  type InvoiceSettings,
  type KotSettings,
  type PrintFontSize,
  type PrintPaperSize,
  type Restaurant,
  type TaxRate,
} from "../../lib/types";

// Older browsers lack supportedValuesOf, so fall back to the zones this app is
// realistically deployed in rather than leaving the picker empty.
const TIMEZONE_CHOICES: string[] =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "UTC"];

const DEFAULT_KOT_SETTINGS: KotSettings = {
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

const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  showCustomerPhone: true,
  footerNote: "Thank you for dining with us!",
  termsText: "",
  paperSize: "a5",
  fontSize: "normal",
  showLogo: true,
  showUnitPrice: true,
  showJainTag: true,
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
  // Everything before the cutoff is filed under the previous date. Past the small hours that
  // stops being "late-night trading" and starts back-dating most of a normal day, which reads
  // as the Orders filter being broken, so say so plainly before it is saved.
  const dayEndTimeWarning = useMemo(() => {
    const [hour] = dayEndTime.split(":").map(Number);
    if (!Number.isFinite(hour) || hour < 5) return null;
    const label = new Date(`2000-01-01T${dayEndTime}:00`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `Heads up: with a ${label} cutoff, every order taken between midnight and ${label} is filed under the previous date - that is most of a trading day, so the Orders date filter and daily sales will look shifted by one day. Only keep this if you genuinely serve through ${label}; otherwise use 00:00.`;
  }, [dayEndTime]);

  // Browsers disagree on zone aliases (Chromium lists Asia/Calcutta, not Asia/Kolkata), and a
  // <select> whose value matches no option silently shows the first one - which a Save would
  // then persist as the restaurant's zone. Keep the saved value in the list whatever it is.
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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewingKot, setPreviewingKot] = useState(false);
  const [previewingInvoice, setPreviewingInvoice] = useState(false);
  const [aggSecret, setAggSecret] = useState("");
  const [aggBaseUrl, setAggBaseUrl] = useState("");
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ secret: string; baseUrl: string }>("/aggregator/config")
      .then((res) => {
        setAggSecret(res.data.secret || "");
        setAggBaseUrl(res.data.baseUrl || "");
      })
      .catch(() => {
        /* non-critical - the card just shows an empty secret until generated */
      });
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
      .catch(() => {
        /* clipboard blocked - the value is still visible to copy by hand */
      });
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
      const res = await api.post(
        "/restaurant/kot-preview",
        { name, logoUrl, kotSettings },
        { responseType: "blob" }
      );
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
          customWords: chatModWords.split(/[\n,]/).map((w) => w.trim()).filter(Boolean),
        },
        taxRates,
        kotSettings,
        invoiceSettings,
      });
      setMessage("Settings saved");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Restaurant Settings</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="text-sm font-medium text-slate-700">
            Restaurant name
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Address
            <Input className="mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Browser tab title
            <Input
              className="mt-1"
              placeholder={name || "e.g. Banne.Kaffi - Order Online"}
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
            />
            <p className="mt-1 text-xs font-normal text-slate-400">
              Shown on the browser tab and when someone bookmarks the site. Leave blank to use the restaurant name.
            </p>
          </label>

          <div className="text-sm font-medium text-slate-700">
            Favicon
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {faviconUrl && <img src={faviconUrl} alt="" className="h-8 w-8 rounded border border-slate-200 object-cover" />}
              <input type="file" accept="image/*" onChange={handleFaviconFile} className="text-xs" />
              {uploadingFavicon && <span className="text-xs text-slate-400">Uploading...</span>}
              {faviconUrl && (
                <button type="button" className="text-xs text-red-600" onClick={() => setFaviconUrl("")}>
                  Remove
                </button>
              )}
            </div>
            <p className="mt-1 text-xs font-normal text-slate-400">
              The small icon on the browser tab. A square PNG around 64x64 works best.
            </p>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Public URL (for QR codes)
            <Input
              className="mt-1"
              placeholder="e.g. http://192.168.1.20:8080 or https://your-domain.com"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
            />
            <p className="mt-1 text-xs font-normal text-slate-400">
              The address customers' phones should use to reach this site - required if you're running this behind
              Docker/a LAN IP, since QR codes would otherwise encode whatever address you happen to be viewing the
              admin panel from (e.g. "localhost", which only works on this machine). Leave blank to use the current
              browser address automatically.
            </p>
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm font-medium text-slate-700">
              GST number
              <Input
                className="mt-1"
                placeholder="e.g. 22AAAAA0000A1Z5"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              FSSAI registration number
              <Input
                className="mt-1"
                placeholder="e.g. 12345678901234"
                value={fssaiLicense}
                onChange={(e) => setFssaiLicense(e.target.value)}
              />
            </label>
          </div>
          <div>
            <span className="text-sm font-medium text-slate-700">Logo</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-slate-100" />
              )}
              <div className="flex flex-col gap-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleLogoFile}
                  disabled={uploadingLogo}
                  className="text-sm text-slate-600"
                />
                <Input
                  className="w-64"
                  placeholder="or paste an image URL"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
              </div>
              {uploadingLogo && <span className="text-xs text-slate-400">Uploading...</span>}
            </div>
          </div>

          <div>
            <span className="text-sm font-medium text-slate-700">Day-end time (business day cutoff)</span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDayEndTime("00:00")}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Close before midnight <span className="font-normal text-slate-400">(split at 12am)</span>
              </button>
              <button
                type="button"
                onClick={() => setDayEndTime("02:00")}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Open past midnight <span className="font-normal text-slate-400">(e.g. closes 2am)</span>
              </button>
              <Input
                className="w-40"
                type="time"
                value={dayEndTime}
                onChange={(e) => setDayEndTime(e.target.value)}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              This is when one business day <em>rolls over</em> into the next - not your closing time. If you shut
              before midnight, leave it at 00:00 so each day matches the calendar. Only set it past midnight if you
              trade into the small hours: 02:00 means orders taken up to 2am still count toward the previous day's
              sales, dashboard, and Orders date filter.
            </p>
            {dayEndTimeWarning && (
              <p className="mt-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{dayEndTimeWarning}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Timezone
              <Select className="mt-1 block !w-72" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </label>
            <p className="mt-1 text-xs text-slate-500">
              The zone your business day is measured in. Reports, the dashboard's "today", the Orders date filter
              and kitchen token numbers all use it, so it must match where the restaurant actually is - not where
              the server happens to run. Current local time here:{" "}
              <strong>{new Date().toLocaleString([], { timeZone: timezone })}</strong>.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Preparation time</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm font-medium text-slate-700">
                Delay buffer (minutes)
                <Input
                  className="mt-1 w-32"
                  type="number"
                  min={0}
                  value={prepBufferMinutes}
                  onChange={(e) => setPrepBufferMinutes(Number(e.target.value))}
                />
              </label>
              <label className="flex-1 text-sm font-medium text-slate-700">
                Message shown above the order items
                <Input
                  className="mt-1"
                  value={prepMessageTemplate}
                  onChange={(e) => setPrepMessageTemplate(e.target.value)}
                  placeholder="Leave empty to show nothing"
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Each dish carries its own prep time under Food Items; the slowest dish in a round plus this buffer
              sets when the order is due. Ordering more later pushes the estimate out, never forward. Use{" "}
              <code className="rounded bg-slate-100 px-1">{"{minutes}"}</code> for the wait still left and{" "}
              <code className="rounded bg-slate-100 px-1">{"{time}"}</code> for the clock time it should be ready.
              Clear the field to hide the message entirely.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Chat abuse filter</p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={chatModEnabled} onChange={(e) => setChatModEnabled(e.target.checked)} />
              Filter abusive and violent language in the guest &harr; staff chat
            </label>
            {chatModEnabled && (
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="chatModMode"
                      checked={chatModMode === "mask"}
                      onChange={() => setChatModMode("mask")}
                    />
                    Mask the words with <code className="rounded bg-slate-100 px-1">***</code> (message still sends)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="chatModMode"
                      checked={chatModMode === "block"}
                      onChange={() => setChatModMode("block")}
                    />
                    Block the message entirely
                  </label>
                </div>
                <label className="text-sm font-medium text-slate-700">
                  Extra banned words <span className="font-normal text-slate-400">(comma-separated)</span>
                  <Textarea
                    className="mt-1"
                    rows={2}
                    value={chatModWords}
                    onChange={(e) => setChatModWords(e.target.value)}
                    placeholder="e.g. local slurs to block, one per comma"
                  />
                </label>
                <p className="text-xs text-slate-500">
                  A built-in list of common abusive and violent terms is always applied; add your own words above.
                  Filtered messages are marked in the Messages screen so you can still see when something was caught.
                </p>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Tax rates</p>
            <div className="flex flex-col gap-2">
              {taxRates.map((rate, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Name (e.g. CGST)"
                    value={rate.name}
                    onChange={(e) => updateTaxRate(idx, "name", e.target.value)}
                    className="!w-auto min-w-0 flex-1 basis-40"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    placeholder="Percent"
                    value={rate.percent}
                    onChange={(e) => updateTaxRate(idx, "percent", e.target.value)}
                    className="!w-24 shrink-0"
                  />
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] shrink-0 items-center px-2 text-sm text-red-600"
                    onClick={() => removeTaxRate(idx)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" className="mt-2" onClick={addTaxRate}>
              Add tax rate
            </Button>
          </div>

          <ErrorText>{error}</ErrorText>
          {message && <p className="text-sm text-green-700">{message}</p>}
          <Button type="submit" className="self-start">
            Save settings
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Online delivery (Swiggy / Zomato)</h2>
        <p className="mb-3 text-sm text-slate-500">
          Let Swiggy, Zomato or a middleware (e.g. UrbanPiper, Petpooja) push live orders straight into this system.
          Orders arrive under <strong>Orders</strong> and <strong>Dashboard</strong> as delivery orders, ready for the
          kitchen. You can also key one in by hand from <strong>New Order &rarr; Delivery</strong>.
        </p>

        {(() => {
          const base = (aggBaseUrl || publicUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
          const swiggyUrl = `${base}/api/webhooks/aggregator/swiggy`;
          const zomatoUrl = `${base}/api/webhooks/aggregator/zomato`;
          const UrlRow = ({ label, url, k }: { label: string; url: string; k: string }) => (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">{label}</span>
              <div className="flex gap-2">
                <Input className="font-mono text-xs" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="secondary" onClick={() => copyText(url, k)}>
                  {copied === k ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          );
          return (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-700">1. Webhook URLs</p>
                <p className="-mt-1 text-xs text-slate-500">
                  Paste these into your Swiggy/Zomato partner or middleware dashboard as the "new order" webhook. They
                  use your Public URL above, so set that to a public HTTPS address the aggregator can reach.
                </p>
                <UrlRow label="Swiggy" url={swiggyUrl} k="swiggy" />
                <UrlRow label="Zomato" url={zomatoUrl} k="zomato" />
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-700">2. Webhook secret</p>
                <p className="-mt-1 text-xs text-slate-500">
                  The aggregator must send this as an <code className="rounded bg-slate-100 px-1">x-webhook-secret</code>{" "}
                  header (or <code className="rounded bg-slate-100 px-1">?secret=</code> query). Keep it private;
                  regenerating it invalidates the old one.
                </p>
                <div className="flex gap-2">
                  <Input
                    className="font-mono text-xs"
                    readOnly
                    placeholder="Not generated yet"
                    value={aggSecret}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  {aggSecret && (
                    <Button type="button" variant="secondary" onClick={() => copyText(aggSecret, "secret")}>
                      {copied === "secret" ? "Copied" : "Copy"}
                    </Button>
                  )}
                  <Button type="button" onClick={regenerateSecret} disabled={rotatingSecret}>
                    {rotatingSecret ? "..." : aggSecret ? "Regenerate" : "Generate"}
                  </Button>
                </div>
              </div>

              <details className="rounded-md border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">3. Order payload format</summary>
                <p className="mt-2 text-xs text-slate-500">
                  POST JSON in this shape. Items are matched to your menu by name where possible (for prices &amp; prep
                  time); unmatched items are kept as free-form lines using the price you send.
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
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
          );
        })()}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Kitchen Order Ticket (KOT)</h2>
        <p className="mb-4 text-sm text-slate-500">Customize what's printed on KOT tickets sent to the kitchen.</p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm font-medium text-slate-700">
              Paper size
              <Select
                className="mt-1"
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
            </label>
            <label className="text-sm font-medium text-slate-700">
              Font size
              <Select
                className="mt-1"
                value={kotSettings.fontSize}
                onChange={(e) => setKotSettings((prev) => ({ ...prev, fontSize: e.target.value as PrintFontSize }))}
              >
                {FONT_SIZE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="text-sm font-medium text-slate-700">
            Header text
            <Input
              className="mt-1"
              value={kotSettings.headerText}
              onChange={(e) => setKotSettings((prev) => ({ ...prev, headerText: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={kotSettings.showLogo}
              onChange={(e) => setKotSettings((prev) => ({ ...prev, showLogo: e.target.checked }))}
            />
            Show logo
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={kotSettings.showCustomerName}
              onChange={(e) => setKotSettings((prev) => ({ ...prev, showCustomerName: e.target.checked }))}
            />
            Show customer name
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={kotSettings.showTableInfo}
              onChange={(e) => setKotSettings((prev) => ({ ...prev, showTableInfo: e.target.checked }))}
            />
            Show order/table info
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={kotSettings.showPrices}
              onChange={(e) => setKotSettings((prev) => ({ ...prev, showPrices: e.target.checked }))}
            />
            Show item prices
          </label>
          <label className="text-sm font-medium text-slate-700">
            Footer note
            <Input
              className="mt-1"
              placeholder="e.g. Prepare fresh, serve hot"
              value={kotSettings.footerNote}
              onChange={(e) => setKotSettings((prev) => ({ ...prev, footerNote: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit">Save settings</Button>
            <Button type="button" variant="secondary" onClick={previewKot} disabled={previewingKot}>
              {previewingKot ? "Generating..." : "Preview with sample order"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Invoice</h2>
        <p className="mb-4 text-sm text-slate-500">Customize what's printed on customer invoices.</p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm font-medium text-slate-700">
              Paper size
              <Select
                className="mt-1"
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
            </label>
            <label className="text-sm font-medium text-slate-700">
              Font size
              <Select
                className="mt-1"
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
            </label>
          </div>
          <p className="text-xs text-slate-500">
            GST number and FSSAI registration number (set above) print automatically on the invoice header when
            present.
          </p>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={invoiceSettings.showLogo}
              onChange={(e) => setInvoiceSettings((prev) => ({ ...prev, showLogo: e.target.checked }))}
            />
            Show logo
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={invoiceSettings.showCustomerPhone}
              onChange={(e) => setInvoiceSettings((prev) => ({ ...prev, showCustomerPhone: e.target.checked }))}
            />
            Show customer phone number
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={invoiceSettings.showUnitPrice}
              onChange={(e) => setInvoiceSettings((prev) => ({ ...prev, showUnitPrice: e.target.checked }))}
            />
            Show unit price column
          </label>
          <label className="text-sm font-medium text-slate-700">
            Footer note
            <Input
              className="mt-1"
              placeholder="e.g. Thank you for dining with us!"
              value={invoiceSettings.footerNote}
              onChange={(e) => setInvoiceSettings((prev) => ({ ...prev, footerNote: e.target.value }))}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Terms / notes
            <Textarea
              className="mt-1"
              rows={2}
              placeholder="e.g. Prices are inclusive of all taxes."
              value={invoiceSettings.termsText}
              onChange={(e) => setInvoiceSettings((prev) => ({ ...prev, termsText: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit">Save settings</Button>
            <Button type="button" variant="secondary" onClick={previewInvoice} disabled={previewingInvoice}>
              {previewingInvoice ? "Generating..." : "Preview with sample order"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
