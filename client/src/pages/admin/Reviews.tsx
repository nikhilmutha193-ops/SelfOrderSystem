import { useEffect, useMemo, useState } from "react";

import { buildTableQrFrame } from "../../lib/qrFrame";
import type { Review } from "../../lib/types";
import { useCanEdit } from "../../lib/adminAuth";
import { api, extractErrorMessage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import { Alert, Badge, Button, Card, ErrorText, Input, PageHeader, Select } from "../../shared/ui/ui";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500">
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

interface FeedbackQrLook {
  showLogo: boolean;
  showName: boolean;
  showAddress: boolean;
  heading: string;
  instructionText: string;
  accentColor: string;
}

interface FeedbackSettings {
  googleReviewUrl: string;
  googleMinStars: number;
  googleFetchConfigured: boolean;
  hasSerpApiKey: boolean;
  googlePlaceId: string;
  qr: FeedbackQrLook;
}

type SourceFilter = "all" | "table" | "qr" | "google";

const SOURCE_LABEL: Record<NonNullable<Review["source"]>, string> = {
  table: "Table guest",
  qr: "Feedback QR",
  google: "Google",
};

const DEFAULT_LOOK: FeedbackQrLook = {
  showLogo: true,
  showName: true,
  showAddress: false,
  heading: "Rate your visit",
  instructionText: "Scan to share your feedback",
  accentColor: "#ea580c",
};

/** The QR guests scan to leave feedback without signing in to a table, and where happy guests are sent next. */
function FeedbackQrCard({ canEdit, onSynced }: { canEdit: boolean; onSynced: () => void }) {
  const feedbackUrl = `${window.location.origin}/feedback`;
  const [brand, setBrand] = useState<{ name: string; logoUrl: string; address: string }>({
    name: "",
    logoUrl: "",
    address: "",
  });
  const [look, setLook] = useState<FeedbackQrLook>(DEFAULT_LOOK);
  const [logoSrc, setLogoSrc] = useState<string | undefined>(undefined);
  const [card, setCard] = useState("");
  const [settings, setSettings] = useState<FeedbackSettings | null>(null);
  const [googleUrl, setGoogleUrl] = useState("");
  const [minStars, setMinStars] = useState(4);
  // Fetching Google reviews: the SerpApi key is only ever typed in here, never read back.
  const [serpKey, setSerpKey] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "sync" | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<{ name: string; logoUrl?: string; address?: string }>("/restaurant/public")
      .then((res) => setBrand({ name: res.data.name, logoUrl: res.data.logoUrl ?? "", address: res.data.address ?? "" }))
      .catch(() => undefined);
    loadSettings(true);
  }, []);

  function loadSettings(first = false) {
    api
      .get<FeedbackSettings>("/reviews/settings")
      .then((res) => {
        setSettings(res.data);
        if (first) {
          setGoogleUrl(res.data.googleReviewUrl);
          setMinStars(res.data.googleMinStars);
          setPlaceId(res.data.googlePlaceId);
          setLook({ ...DEFAULT_LOOK, ...res.data.qr });
        }
      })
      .catch((err) => setError(extractErrorMessage(err)));
  }

  // The logo is read through the server so the card can be drawn on a canvas and downloaded.
  useEffect(() => {
    if (!brand.logoUrl || !look.showLogo) {
      setLogoSrc(undefined);
      return;
    }
    let objectUrl: string | undefined;
    let cancelled = false;
    api
      .get("/restaurant/logo", { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setLogoSrc(objectUrl);
      })
      .catch(() => setLogoSrc(brand.logoUrl));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [brand.logoUrl, look.showLogo]);

  // The framed card: logo, name, QR and the lines under it, redrawn as the choices change.
  useEffect(() => {
    let cancelled = false;
    buildTableQrFrame({
      orderUrl: feedbackUrl,
      heading: look.heading,
      restaurantName: brand.name,
      logoUrl: logoSrc,
      address: brand.address,
      instructionText: look.instructionText,
      accentColor: look.accentColor,
      showLogo: look.showLogo,
      showName: look.showName,
      showAddress: look.showAddress,
    })
      .then((url) => {
        if (!cancelled) setCard(url);
      })
      .catch(() => {
        if (!cancelled) setCard("");
      });
    return () => {
      cancelled = true;
    };
  }, [feedbackUrl, look, brand, logoSrc]);

  async function save() {
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      await api.put("/reviews/settings", {
        googleReviewUrl: googleUrl.trim(),
        googleMinStars: minStars,
        qr: look,
        googlePlaceId: placeId.trim(),
        ...(serpKey.trim() && { serpApiKey: serpKey.trim() }),
      });
      setSerpKey("");
      loadSettings();
      setMessage("Saved");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      const res = await api.post<{ fetched: number; added: number; duplicates: number }>("/reviews/google/sync");
      const { fetched, added, duplicates } = res.data;
      setMessage(
        fetched === 0
          ? "Google returned no reviews."
          : `${fetched} Google review${fetched === 1 ? "" : "s"} fetched: ${added} new, ${duplicates} already here.`,
      );
      onSynced();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const change = (changes: Partial<FeedbackQrLook>) => setLook((prev) => ({ ...prev, ...changes }));

  return (
    <Card data-tour="feedback-qr" className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2">
          {card ? (
            <img src={card} alt="Feedback QR card" className="h-72 rounded-lg border border-slate-200 object-contain" />
          ) : (
            <div className="h-72 w-52 rounded-lg bg-slate-100" />
          )}
          <a
            href={card}
            download="feedback-qr.png"
            className="text-sm font-medium text-orange-700 hover:underline"
            aria-disabled={!card}
          >
            Download QR card
          </a>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900">Feedback QR</h2>
          <p className="text-sm text-slate-500">
            Print this card for the counter or the bill. Guests who scan it get a feedback form (no table sign-in) that
            looks like the table sign-in page.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <code className="min-w-0 truncate rounded bg-slate-100 px-2 py-1">{feedbackUrl}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(feedbackUrl).then(() => setCopied(true));
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <a className="text-orange-700 hover:underline" href="/feedback" target="_blank" rel="noopener">
              Open the page
            </a>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3">
            <p className="text-sm font-medium text-slate-700">Customize the card</p>
            <div className="flex flex-wrap gap-4 text-sm font-medium text-slate-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={look.showLogo}
                  disabled={!canEdit}
                  onChange={(e) => change({ showLogo: e.target.checked })}
                />
                Logo
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={look.showName}
                  disabled={!canEdit}
                  onChange={(e) => change({ showName: e.target.checked })}
                />
                Restaurant name
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={look.showAddress}
                  disabled={!canEdit}
                  onChange={(e) => change({ showAddress: e.target.checked })}
                />
                Address
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_5rem]">
              <label className="text-sm font-medium text-slate-700">
                Big text under the QR
                <Input
                  className="mt-1"
                  maxLength={40}
                  value={look.heading}
                  disabled={!canEdit}
                  onChange={(e) => change({ heading: e.target.value })}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Small text below
                <Input
                  className="mt-1"
                  maxLength={80}
                  value={look.instructionText}
                  disabled={!canEdit}
                  onChange={(e) => change({ instructionText: e.target.value })}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Frame colour
                <input
                  type="color"
                  className="mt-1 block h-9 w-full cursor-pointer rounded-md border border-slate-300"
                  value={look.accentColor}
                  disabled={!canEdit}
                  onChange={(e) => change({ accentColor: e.target.value })}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_10rem]">
        <label className="text-sm font-medium text-slate-700">
          Google review link
          <Input
            className="mt-1"
            placeholder="https://g.page/r/.../review"
            value={googleUrl}
            disabled={!canEdit}
            onChange={(e) => setGoogleUrl(e.target.value)}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            In Google Business Profile choose "Ask for reviews" and copy the link. Google lets a guest post a review only
            on its own page, so happy guests are sent there.
          </span>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Offer Google from
          <Select className="mt-1" value={minStars} disabled={!canEdit} onChange={(e) => setMinStars(Number(e.target.value))}>
            {[5, 4, 3].map((n) => (
              <option key={n} value={n}>
                {n} stars and up
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {canEdit && (
          <Button onClick={save} loading={busy === "save"}>
            Save
          </Button>
        )}
        {canEdit && (
          <Button
            variant="secondary"
            onClick={sync}
            loading={busy === "sync"}
            disabled={settings ? !settings.googleFetchConfigured : false}
          >
            Fetch Google reviews
          </Button>
        )}
        {settings && !settings.googleFetchConfigured && (
          <span className="text-xs text-slate-500">
            Enter the SerpApi key and the Google place below, then press Save. Each Google review is added once.
          </span>
        )}
      </div>

      <details className="rounded-lg border border-slate-200 p-3" open={settings ? !settings.googleFetchConfigured : false}>
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Fetch Google reviews: setup {settings?.googleFetchConfigured && <span className="text-green-700">(done)</span>}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            SerpApi key
            <Input
              className="mt-1"
              type="password"
              autoComplete="off"
              placeholder={settings?.hasSerpApiKey ? "Saved: type a new one to change it" : "Paste your SerpApi key"}
              value={serpKey}
              disabled={!canEdit}
              onChange={(e) => setSerpKey(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Google place
            <Input
              className="mt-1"
              placeholder="0x3bae1670c9b44e6d:0xf8dfc3e8517e4fe0 or ChIJ..."
              value={placeId}
              disabled={!canEdit}
              onChange={(e) => setPlaceId(e.target.value)}
            />
          </label>
        </div>
        <ol className="mt-3 list-decimal pl-5 text-xs text-slate-500">
          <li>
            Make a free account at <span className="font-medium">serpapi.com</span> and copy the API key from its
            dashboard (the free plan covers 100 searches a month; the site checks Google at most every 30 minutes).
          </li>
          <li>
            Find your restaurant on Google Maps. The address bar link holds the place's data ID: the part that looks like{" "}
            <code>0x3bae…:0x…</code> after <code>!1s</code>. A place ID that starts with <code>ChIJ</code> works too.
          </li>
          <li>Paste both here and press Save, then Fetch Google reviews. The key is stored encrypted and never shown again.</li>
        </ol>
      </details>
      <ErrorText>{error}</ErrorText>
      {message && <Alert tone="success">{message}</Alert>}
    </Card>
  );
}

export default function Reviews() {
  const canEdit = useCanEdit("reviews");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceFilter>("all");

  function load() {
    api
      .get<Review[]>("/reviews")
      .then((res) => setReviews(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  async function setApproved(review: Review, isApproved: boolean) {
    try {
      await api.patch(`/reviews/${review._id}/approve`, { isApproved });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function remove(review: Review) {
    if (
      !(await confirmDialog({
        title: "Delete this review?",
        message:
          review.source === "google"
            ? `The review from ${review.customerName} is removed. It would come back the next time Google reviews are fetched: use Hide to keep it off the website.`
            : `The review from ${review.customerName} is removed for good.`,
        confirmLabel: "Delete review",
      }))
    )
      return;
    try {
      await api.delete(`/reviews/${review._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const visible = reviews.filter((r) => source === "all" || (r.source ?? "table") === source);
  const hidden = visible.filter((r) => !r.isApproved);
  const shown = visible.filter((r) => r.isApproved);

  function tableCode(review: Review) {
    return typeof review.tableId === "object" ? review.tableId?.code : undefined;
  }

  function renderReview(review: Review) {
    const code = tableCode(review);
    const from = review.source ?? "table";
    return (
      <Card key={review._id} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-800">
              {review.customerName}
              {code && <span className="ml-2 text-xs font-normal text-slate-400">Table {code}</span>}
            </p>
            <Stars rating={review.rating} />
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={review.isApproved ? "green" : "amber"}>{review.isApproved ? "Shown" : "Hidden"}</Badge>
            <Badge tone="blue">{SOURCE_LABEL[from]}</Badge>
          </span>
        </div>
        {review.comment && <p className="text-sm text-slate-600">{review.comment}</p>}
        <p className="text-xs text-slate-400">
          {review.relativeDate ?? new Date(review.createdAt).toLocaleString()}
          {review.phone && ` · ${review.phone}`}
        </p>
        {canEdit && (
          <div className="flex gap-3 text-sm">
            {review.isApproved ? (
              <button
                className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100"
                onClick={() => setApproved(review, false)}
              >
                Hide
              </button>
            ) : (
              <button className="text-green-700 hover:underline" onClick={() => setApproved(review, true)}>
                Show on website
              </button>
            )}
            <button
              className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-red-600 hover:bg-red-50"
              onClick={() => remove(review)}
            >
              Delete
            </button>
          </div>
        )}
      </Card>
    );
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "feedback-qr",
        title: "Feedback QR",
        description:
          "Print this QR: guests scan it to leave feedback without signing in. Happy guests are sent on to your Google review page.",
      },
      {
        target: "reviews-pending",
        title: "Hidden feedback",
        description: "New feedback waits here until you show it on the website. Anything you hide goes back here.",
      },
      {
        target: "reviews-approved",
        title: "Shown on the website",
        description: "Shown publicly on the landing page, including Google reviews. Hide one to pull it down.",
      },
    ],
    [],
  );
  usePageTour(tourSteps);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Customer Feedback"
        description={
          <>
            Feedback from tables, the feedback QR and Google. New feedback stays hidden until you show it on the
            website; you can hide any of it again.
          </>
        }
      />

      <ErrorText>{error}</ErrorText>

      <FeedbackQrCard canEdit={canEdit} onSynced={load} />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Where feedback came from">
        {(["all", "table", "qr", "google"] as SourceFilter[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={source === s}
            onClick={() => setSource(s)}
            className={`min-h-[36px] rounded-full border px-3 text-sm font-medium ${
              source === s ? "border-orange-600 bg-orange-50 text-orange-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s === "all" ? "All" : SOURCE_LABEL[s]}
          </button>
        ))}
      </div>

      <div data-tour="reviews-pending">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Hidden ({hidden.length})</h2>
        {hidden.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing waiting or hidden.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{hidden.map(renderReview)}</div>
        )}
      </div>

      <div data-tour="reviews-approved">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Shown on the website ({shown.length})</h2>
        {shown.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing is shown yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{shown.map(renderReview)}</div>
        )}
      </div>
    </div>
  );
}
