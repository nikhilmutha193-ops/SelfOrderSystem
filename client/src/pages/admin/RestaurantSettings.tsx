import { useEffect, useState } from "react";
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
  const [tagline, setTagline] = useState("");
  const [aboutText, setAboutText] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const [newHeroUrl, setNewHeroUrl] = useState("");
  const [uploadingHero, setUploadingHero] = useState(false);
  const [dayEndTime, setDayEndTime] = useState("00:00");
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [kotSettings, setKotSettings] = useState<KotSettings>(DEFAULT_KOT_SETTINGS);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewingKot, setPreviewingKot] = useState(false);
  const [previewingInvoice, setPreviewingInvoice] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

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
        setTagline(res.data.tagline || "");
        setAboutText(res.data.aboutText || "");
        setPublicUrl(res.data.publicUrl || "");
        setHeroImages(res.data.heroImages || []);
        setDayEndTime(res.data.dayEndTime || "00:00");
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

  async function handleHeroFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploadingHero(true);
    try {
      const url = await uploadImage(file, "banner");
      setHeroImages((prev) => [...prev, url]);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploadingHero(false);
    }
  }

  function addHeroUrl() {
    const url = newHeroUrl.trim();
    if (!url) return;
    setHeroImages((prev) => [...prev, url]);
    setNewHeroUrl("");
  }

  function removeHeroImage(idx: number) {
    setHeroImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveHeroImage(idx: number, direction: -1 | 1) {
    setHeroImages((prev) => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
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

  async function seedSampleContent() {
    setError(null);
    setSeedResult(null);
    setSeeding(true);
    try {
      const res = await api.post<{ message: string }>("/restaurant/seed-landing");
      setSeedResult(res.data.message);
      // Tagline/about may have just been filled in, so pull the saved values back.
      const fresh = await api.get<Restaurant>("/restaurant/settings");
      setTagline(fresh.data.tagline || "");
      setAboutText(fresh.data.aboutText || "");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSeeding(false);
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
        tagline,
        aboutText,
        publicUrl,
        heroImages,
        dayEndTime,
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
                onClick={() => setDayEndTime("23:00")}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Today <span className="font-normal text-slate-400">(e.g. closes 11pm)</span>
              </button>
              <button
                type="button"
                onClick={() => setDayEndTime("02:00")}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Tomorrow <span className="font-normal text-slate-400">(e.g. closes 2am)</span>
              </button>
              <Input
                className="w-40"
                type="time"
                value={dayEndTime}
                onChange={(e) => setDayEndTime(e.target.value)}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Use the buttons for a quick starting point, then fine-tune the exact time in the field. A time before
              midnight closes the same day; a time after midnight means you stay open past midnight and the business
              day rolls over then. Either way, orders placed before this time still count toward the previous day's
              sales, dashboard, and billing instead of splitting into the next calendar day. Use 00:00 for a standard
              midnight cutoff.
            </p>
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
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Public landing page</h2>
        <p className="mb-3 text-sm text-slate-500">These appear at the top of your public landing page.</p>

        <div className="mb-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-700">Starting from scratch?</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Fills empty sections with clearly-labelled sample content so the page isn't blank while you set up. It only
            fills blanks - nothing you've already written is changed, and hero images are never touched.
          </p>
          <Button type="button" variant="secondary" className="mt-2" onClick={seedSampleContent} disabled={seeding}>
            {seeding ? "Adding..." : "Add sample content"}
          </Button>
          {seedResult && <p className="mt-2 text-sm text-green-700">{seedResult}</p>}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="text-sm font-medium text-slate-700">
            Tagline
            <Input
              className="mt-1"
              placeholder="e.g. Authentic flavors, made with love"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            About text
            <Textarea className="mt-1" rows={3} value={aboutText} onChange={(e) => setAboutText(e.target.value)} />
          </label>
          <div>
            <span className="text-sm font-medium text-slate-700">Hero slideshow</span>
            <p className="mt-0.5 text-xs text-slate-500">
              Add one or more images to rotate through on the landing page hero banner.
            </p>

            {heroImages.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {heroImages.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-md border border-slate-200 p-2">
                    <img src={url} alt="" className="h-14 w-24 rounded object-cover" />
                    <span className="flex-1 truncate text-xs text-slate-500">{url}</span>
                    <div className="flex items-center gap-1 text-sm">
                      <button
                        type="button"
                        className="text-slate-500 hover:underline disabled:opacity-30"
                        disabled={idx === 0}
                        onClick={() => moveHeroImage(idx, -1)}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="text-slate-500 hover:underline disabled:opacity-30"
                        disabled={idx === heroImages.length - 1}
                        onClick={() => moveHeroImage(idx, 1)}
                      >
                        Down
                      </button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => removeHeroImage(idx)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">Upload a slide</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleHeroFile}
                  disabled={uploadingHero}
                  className="text-sm text-slate-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">or add an image URL</span>
                <div className="flex gap-2">
                  <Input
                    className="w-64"
                    placeholder="https://..."
                    value={newHeroUrl}
                    onChange={(e) => setNewHeroUrl(e.target.value)}
                  />
                  <Button type="button" variant="secondary" onClick={addHeroUrl}>
                    Add
                  </Button>
                </div>
              </div>
              {uploadingHero && <span className="text-xs text-slate-400">Uploading...</span>}
            </div>
          </div>
          <Button type="submit" className="self-start">
            Save settings
          </Button>
        </form>
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
