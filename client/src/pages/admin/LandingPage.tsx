import { useEffect, useMemo, useState } from "react";

import { useCanEdit } from "../../lib/adminAuth";
import type { LandingContent } from "../../lib/types";
import { api, extractErrorMessage, uploadImage } from "../../shared/api/client";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import { Button, Card, ErrorText, Input, PageHeader, Select, Textarea } from "../../shared/ui/ui";

type Section = keyof LandingContent;

type HAlign = "" | "left" | "center" | "right";

type VAlign = "" | "top" | "center" | "bottom";

function Field({
  label,
  value,
  onChange,
  hint,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      {multiline ? (
        <Textarea
          className="mt-1"
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input className="mt-1" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <p className="mt-1 text-xs font-normal text-slate-400">{hint}</p>}
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function ImagePicker({
  label,
  value,
  onChange,
  onError,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {value && <img src={value} alt="" className="h-14 w-14 rounded-md border border-slate-200 object-cover" />}
        <input
          type="file"
          accept="image/*"
          className="text-xs"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            try {
              onChange(await uploadImage(file, "banner"));
            } catch (err) {
              onError(extractErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />
        {busy && <span className="text-xs text-slate-400">Uploading...</span>}
        {value && (
          <button type="button" className="text-xs text-red-600" onClick={() => onChange("")}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  fallbackHint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fallbackHint: string;
}) {
  return (
    <div className="text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour`}
          // A native picker has no "unset", so an empty value shows the design's colour.
          value={value || "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1"
        />
        <Input
          className="!w-32"
          value={value}
          placeholder="default"
          onChange={(e) => onChange(e.target.value.trim())}
        />
        {value && (
          <button type="button" className="text-xs font-semibold text-orange-700" onClick={() => onChange("")}>
            Use default
          </button>
        )}
      </div>
      <p className="mt-1 text-xs font-normal text-slate-400">{fallbackHint}</p>
    </div>
  );
}

const HALIGN_OPTIONS: { value: HAlign; label: string }[] = [
  { value: "", label: "Default" },
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const VALIGN_OPTIONS: { value: VAlign; label: string }[] = [
  { value: "", label: "Default" },
  { value: "top", label: "Top" },
  { value: "center", label: "Center" },
  { value: "bottom", label: "Bottom" },
];

function SegmentedPicker<T extends string>({
  label,
  value,
  options,
  onChange,
  defaultHint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  defaultHint: string;
}) {
  return (
    <div className="text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={`min-h-[38px] rounded-md border px-3 text-sm font-semibold transition-colors ${
              value === opt.value
                ? "border-orange-600 bg-orange-50 text-orange-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs font-normal text-slate-400">{defaultHint}</p>
    </div>
  );
}

/**
 * A story written as several paragraphs: each has its own box and can be moved or removed. They are saved as one text
 * with a blank line between them, which is also how the landing page splits it again.
 */
function ParagraphsField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [paragraphs, setParagraphs] = useState<string[]>(() => {
    const parts = value.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    return parts.length ? parts : [""];
  });
  function update(next: string[]) {
    setParagraphs(next);
    onChange(next.map((p) => p.trim()).filter(Boolean).join("\n\n"));
  }
  const move = "text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-30";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {paragraphs.map((text, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-lg border border-slate-200 p-2">
          <Textarea
            aria-label={`${label}, paragraph ${i + 1}`}
            rows={3}
            value={text}
            placeholder={`Paragraph ${i + 1}`}
            onChange={(e) => update(paragraphs.map((p, j) => (j === i ? e.target.value : p)))}
          />
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400">Paragraph {i + 1}</span>
            <button
              type="button"
              className={move}
              disabled={i === 0}
              onClick={() => {
                const next = [...paragraphs];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                update(next);
              }}
            >
              Move up
            </button>
            <button
              type="button"
              className={move}
              disabled={i === paragraphs.length - 1}
              onClick={() => {
                const next = [...paragraphs];
                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                update(next);
              }}
            >
              Move down
            </button>
            {paragraphs.length > 1 && (
              <button
                type="button"
                className="text-xs font-semibold text-red-600"
                onClick={() => update(paragraphs.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
      <div>
        <Button type="button" variant="secondary" onClick={() => setParagraphs([...paragraphs, ""])}>
          Add paragraph
        </Button>
      </div>
    </div>
  );
}

interface LandingDish {
  _id: string;
  name: string;
  price: number;
  imageUrl: string;
  categoryName: string;
  shown: boolean;
}

/** Which dishes the landing page's menu shows: a switch for each active dish, with its picture. Saved as you switch. */
function LandingDishes({ canEdit }: { canEdit: boolean }) {
  const [dishes, setDishes] = useState<LandingDish[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<LandingDish[]>("/restaurant/landing-menu")
      .then((res) => setDishes(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, []);

  async function toggle(dish: LandingDish, show: boolean) {
    setError(null);
    setDishes((list) => list.map((d) => (d._id === dish._id ? { ...d, shown: show } : d)));
    try {
      await api.put(`/restaurant/landing-menu/${dish._id}`, { show });
    } catch (err) {
      setDishes((list) => list.map((d) => (d._id === dish._id ? { ...d, shown: !show } : d)));
      setError(extractErrorMessage(err));
    }
  }

  const term = search.trim().toLowerCase();
  const visible = dishes.filter((d) => !term || `${d.name} ${d.categoryName}`.toLowerCase().includes(term));
  const shownCount = dishes.filter((d) => d.shown).length;

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Dishes on the landing page</h3>
          <p className="text-xs text-slate-500">
            {shownCount} of {dishes.length} shown, each with its picture. Switching a dish saves at once; the Save button
            below is for the texts.
          </p>
        </div>
        <Input
          className="!w-52"
          type="search"
          placeholder="Search dishes"
          aria-label="Search dishes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {loaded && dishes.length === 0 && <p className="text-sm text-slate-400">No active dishes yet.</p>}
      <ul className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
        {visible.map((dish) => (
          <li
            key={dish._id}
            className={`flex items-center gap-3 rounded-lg border p-2 ${dish.shown ? "border-orange-200 bg-orange-50/40" : "border-slate-200"}`}
          >
            {dish.imageUrl ? (
              <img src={dish.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" loading="lazy" />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-lg text-slate-400">
                {dish.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">{dish.name}</span>
              <span className="block truncate text-xs text-slate-500">
                {dish.categoryName && `${dish.categoryName} · `}₹{dish.price.toFixed(2)}
                {!dish.imageUrl && " · no picture"}
              </span>
            </span>
            <Toggle label="Show" value={dish.shown} onChange={(v) => canEdit && void toggle(dish, v)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Where a menu link can go: the sections of the landing page, the order page, or any link of the owner's own. */
const LINK_TARGETS: { href: string; label: string }[] = [
  { href: "#serve", label: "What We Serve" },
  { href: "#menu", label: "Menu highlights" },
  { href: "/menu-card", label: "Menu card page" },
  { href: "#today-special", label: "Today's Specials" },
  { href: "#gallery", label: "Reels" },
  { href: "#story", label: "Our Story" },
  { href: "#team", label: "Our Team" },
  { href: "#reviews", label: "Reviews" },
  { href: "#awards", label: "Awards" },
  { href: "#locations", label: "Visit Us" },
  { href: "/order", label: "Order page" },
];

const STANDARD_NAV = [
  { label: "What We Serve", href: "#serve", visible: true },
  { label: "Menu", href: "#menu", visible: true },
  { label: "Our Story", href: "#story", visible: true },
  { label: "Visit Us", href: "#locations", visible: true },
];

function RowActions({
  onRemove,
  onUp,
  onDown,
}: {
  onRemove: () => void;
  onUp?: (() => void) | null;
  onDown?: (() => void) | null;
}) {
  const move = "text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-30";
  return (
    <div className="flex items-center gap-4">
      {(onUp !== undefined || onDown !== undefined) && (
        <>
          <button type="button" className={move} disabled={!onUp} onClick={onUp ?? undefined}>
            Move up
          </button>
          <button type="button" className={move} disabled={!onDown} onClick={onDown ?? undefined}>
            Move down
          </button>
        </>
      )}
      <button type="button" className="text-xs font-semibold text-red-600" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

export default function LandingPageEditor() {
  const [content, setContent] = useState<LandingContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = useCanEdit("landing");

  const tourSteps: TourStep[] = useMemo(
    () => [
      { target: "landing-hero", title: "Hero banner", description: "The main banner slides at the top of the page." },
      {
        target: "landing-serve",
        title: "What We Serve",
        description: "The cuisine/category highlights band under the hero.",
      },
      {
        target: "landing-menu",
        title: "Menu highlights",
        description: "Shows dishes marked Bestseller under Food Items, with the wording you set here.",
      },
      {
        target: "landing-today-special",
        title: "Today's Specials",
        description: "Shows dishes marked Today's Special under Food Items, grouped by category.",
      },
      {
        target: "landing-reviews",
        title: "Reviews / feedback",
        description: "The guest feedback section: switch it, rename it and choose how many reviews show.",
      },
      { target: "landing-story", title: "Our Story", description: "Your restaurant's story section." },
      { target: "landing-outlets", title: "Outlets", description: "Your locations, each with an address and map link." },
      { target: "landing-reels", title: "Reels", description: "Embedded Instagram/video reels." },
      {
        target: "landing-cta",
        title: "Call-to-action band",
        description: "A banner inviting guests to order, book or follow you.",
      },
      { target: "landing-footer", title: "Footer", description: "Tagline and contact/social links shown in the footer." },
      ...(canEdit
        ? [
            {
              target: "landing-save",
              title: "Save",
              description: "Nothing here goes live until you save.",
            },
          ]
        : []),
    ],
    [canEdit]
  );
  usePageTour(tourSteps);

  useEffect(() => {
    api
      .get<LandingContent>("/restaurant/landing-content")
      .then((res) => setContent(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  function patch<S extends Section>(section: S, changes: Partial<LandingContent[S]>) {
    setContent((prev) => (prev ? { ...prev, [section]: { ...prev[section], ...changes } } : prev));
  }

  async function save() {
    if (!content) return;
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const res = await api.put<LandingContent>("/restaurant/landing-content", content);
      setContent(res.data);
      setMessage("Landing page saved");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (error && !content) return <ErrorText>{error}</ErrorText>;
  if (!content) return <p className="text-sm text-slate-500">Loading...</p>;

  const { hero, serve, menu, todaySpecial, story, outlets, reels, partnership, footer } = content;
  const nav = content.nav?.items ?? [];
  const menuCard = content.menuCard ?? { enabled: true, eyebrow: "Our Menu", title: "The menu card", lead: "", images: [] };
  const reviews = content.reviews ?? {
    enabled: true,
    eyebrow: "Testimonials",
    title: "What our guests say",
    lead: "",
    maxItems: 6,
    showGoogle: true,
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Landing Page"
        description={
          <>
            Everything on your public page. Dishes, team, awards and reviews come from their own sections - this is the
            wording around them.
          </>
        }
      />

      <ErrorText>{error}</ErrorText>
      {message && <p className="text-sm font-medium text-emerald-700">{message}</p>}

      <div className="gap-6 xl:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
        <Card data-tour="landing-hero">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Hero banner</h2>
          <p className="mb-3 text-xs text-slate-500">
            Add a portrait version of each banner for phones - a wide image has to be cropped to fill a tall screen.
            Leave it blank and the banner is shown whole instead, with the wording beneath it.
          </p>

          <div className="mb-4 flex flex-col gap-3">
            {(hero.slides ?? []).map((s, i) => {
              const upd = (changes: Partial<typeof s>) =>
                patch("hero", { slides: (hero.slides ?? []).map((x, j) => (i === j ? { ...x, ...changes } : x)) });
              return (
                <div key={i} className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
                  <ImagePicker
                    label={`Slide ${i + 1} - wide (desktop)`}
                    value={s.desktopUrl}
                    onError={setError}
                    onChange={(url) => upd({ desktopUrl: url })}
                  />
                  <ImagePicker
                    label="Portrait (phones)"
                    value={s.mobileUrl}
                    onError={setError}
                    onChange={(url) => upd({ mobileUrl: url })}
                  />
                  <RowActions
                    onRemove={() => patch("hero", { slides: (hero.slides ?? []).filter((_, j) => j !== i) })}
                  />
                </div>
              );
            })}
            <Button
              type="button"
              variant="secondary"
              onClick={() => patch("hero", { slides: [...(hero.slides ?? []), { desktopUrl: "", mobileUrl: "" }] })}
            >
              Add banner slide
            </Button>
            {(hero.slides ?? []).length === 0 && (
              <p className="text-xs text-slate-400">
                No slides yet - add a banner slide above to show a hero image on the landing page.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <SegmentedPicker
                label="Text alignment - mobile"
                value={hero.textAlignMobile}
                options={HALIGN_OPTIONS}
                onChange={(v) => patch("hero", { textAlignMobile: v })}
                defaultHint="Default: centered"
              />
              <SegmentedPicker
                label="Text alignment - desktop"
                value={hero.textAlignDesktop}
                options={HALIGN_OPTIONS}
                onChange={(v) => patch("hero", { textAlignDesktop: v })}
                defaultHint="Default: left-aligned"
              />
              <SegmentedPicker
                label="Vertical position - mobile"
                value={hero.verticalAlignMobile}
                options={VALIGN_OPTIONS}
                onChange={(v) => patch("hero", { verticalAlignMobile: v })}
                defaultHint="Default: bottom of the banner"
              />
              <SegmentedPicker
                label="Vertical position - desktop"
                value={hero.verticalAlignDesktop}
                options={VALIGN_OPTIONS}
                onChange={(v) => patch("hero", { verticalAlignDesktop: v })}
                defaultHint="Default: vertically centered"
              />
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Field label="Eyebrow" value={hero.eyebrow} onChange={(v) => patch("hero", { eyebrow: v })} />
              </div>
              <Toggle
                label="Show"
                value={hero.showEyebrow !== false}
                onChange={(v) => patch("hero", { showEyebrow: v })}
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Field
                  label="Headline"
                  value={hero.headline}
                  onChange={(v) => patch("hero", { headline: v })}
                  hint="Keep it short - it sits over the banner artwork."
                />
              </div>
              <Toggle
                label="Show"
                value={hero.showHeadline !== false}
                onChange={(v) => patch("hero", { showHeadline: v })}
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Field
                  label="Subtitle"
                  multiline
                  value={hero.subtitle}
                  onChange={(v) => patch("hero", { subtitle: v })}
                />
              </div>
              <Toggle
                label="Show"
                value={hero.showSubtitle !== false}
                onChange={(v) => patch("hero", { showSubtitle: v })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ColorField
                label="Eyebrow colour"
                value={hero.eyebrowColor || ""}
                onChange={(v) => patch("hero", { eyebrowColor: v })}
                fallbackHint="Default: white on terracotta"
              />
              <ColorField
                label="Headline colour"
                value={hero.headlineColor || ""}
                onChange={(v) => patch("hero", { headlineColor: v })}
                fallbackHint="Default: white"
              />
              <ColorField
                label="Subtitle colour"
                value={hero.subtitleColor || ""}
                onChange={(v) => patch("hero", { subtitleColor: v })}
                fallbackHint="Default: soft white"
              />
            </div>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              The banner is a photo, so keep enough contrast to stay readable - pale text on a bright image disappears.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Primary button"
                value={hero.primaryLabel}
                onChange={(v) => patch("hero", { primaryLabel: v })}
              />
              <Field
                label="Secondary button"
                value={hero.secondaryLabel}
                onChange={(v) => patch("hero", { secondaryLabel: v })}
              />
            </div>
          </div>
        </Card>

        <Card data-tour="landing-serve">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">What We Serve</h2>
            <Toggle label="Show" value={serve.enabled} onChange={(v) => patch("serve", { enabled: v })} />
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Title" value={serve.title} onChange={(v) => patch("serve", { title: v })} />
            <Field label="Intro" multiline value={serve.lead} onChange={(v) => patch("serve", { lead: v })} />
            <Field label="Hint under the cards" value={serve.hint} onChange={(v) => patch("serve", { hint: v })} />

            <div className="flex flex-col gap-3">
              {serve.items.map((item, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                  <Field
                    label={`Card ${i + 1} title`}
                    value={item.title}
                    onChange={(v) =>
                      patch("serve", { items: serve.items.map((x, j) => (i === j ? { ...x, title: v } : x)) })
                    }
                  />
                  <Field
                    label="Description"
                    multiline
                    value={item.text}
                    onChange={(v) =>
                      patch("serve", { items: serve.items.map((x, j) => (i === j ? { ...x, text: v } : x)) })
                    }
                  />
                  <ImagePicker
                    label="Illustration"
                    value={item.imageUrl}
                    onError={setError}
                    onChange={(url) =>
                      patch("serve", { items: serve.items.map((x, j) => (i === j ? { ...x, imageUrl: url } : x)) })
                    }
                  />
                  <RowActions onRemove={() => patch("serve", { items: serve.items.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => patch("serve", { items: [...serve.items, { title: "", text: "", imageUrl: "" }] })}
              >
                Add card
              </Button>
            </div>
          </div>
        </Card>

        <Card data-tour="landing-menu">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Menu highlights</h2>
            <Toggle label="Show" value={menu.enabled} onChange={(v) => patch("menu", { enabled: v })} />
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Pick the dishes below; each shows with its picture. Until you choose, the dishes marked{" "}
            <strong>Bestseller</strong> under Food Items are used.
          </p>
          <div className="flex flex-col gap-3">
            <Field label="Eyebrow" value={menu.eyebrow} onChange={(v) => patch("menu", { eyebrow: v })} />
            <Field label="Title" value={menu.title} onChange={(v) => patch("menu", { title: v })} />
            <Field label="Intro" multiline value={menu.lead} onChange={(v) => patch("menu", { lead: v })} />
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <Toggle
                label="Show the order button"
                value={menu.showCta !== false}
                onChange={(v) => patch("menu", { showCta: v })}
              />
              {menu.showCta !== false && (
                <Field label="Button label" value={menu.ctaLabel} onChange={(v) => patch("menu", { ctaLabel: v })} />
              )}
              <Toggle
                label="Show the View the menu card button (when there are menu card photos)"
                value={menu.showCardButton !== false}
                onChange={(v) => patch("menu", { showCardButton: v })}
              />
            </div>
          </div>
          <LandingDishes canEdit={canEdit} />
        </Card>

        <Card data-tour="landing-menu-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Menu card page</h2>
            <Toggle label="Show" value={menuCard.enabled} onChange={(v) => patch("menuCard", { enabled: v })} />
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Upload photos of your printed menu card, one for each page. They are not on the landing page itself: guests
            see them on their own page, <strong>/menu-card</strong>, and tap one to enlarge it. The landing page's menu
            section gets a <strong>View the menu card</strong> button, and you can add a link to it under Navigation menu.{" "}
            <a className="font-medium text-orange-700 hover:underline" href="/menu-card" target="_blank" rel="noopener">
              Open the page
            </a>
          </p>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Eyebrow" value={menuCard.eyebrow} onChange={(v) => patch("menuCard", { eyebrow: v })} />
              <Field label="Title" value={menuCard.title} onChange={(v) => patch("menuCard", { title: v })} />
            </div>
            <Field label="Intro" multiline value={menuCard.lead} onChange={(v) => patch("menuCard", { lead: v })} />
            {menuCard.images.map((photo, i) => {
              const upd = (changes: Partial<typeof photo>) =>
                patch("menuCard", { images: menuCard.images.map((x, j) => (i === j ? { ...x, ...changes } : x)) });
              const swap = (to: number) => {
                const images = [...menuCard.images];
                [images[i], images[to]] = [images[to], images[i]];
                patch("menuCard", { images });
              };
              return (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                  <ImagePicker
                    label={`Page ${i + 1}`}
                    value={photo.imageUrl}
                    onChange={(url) => upd({ imageUrl: url })}
                    onError={setError}
                  />
                  <Field label="Caption (optional)" value={photo.caption} onChange={(v) => upd({ caption: v })} />
                  <RowActions
                    onRemove={() => patch("menuCard", { images: menuCard.images.filter((_, j) => j !== i) })}
                    onUp={i > 0 ? () => swap(i - 1) : null}
                    onDown={i < menuCard.images.length - 1 ? () => swap(i + 1) : null}
                  />
                </div>
              );
            })}
            <Button
              type="button"
              variant="secondary"
              onClick={() => patch("menuCard", { images: [...menuCard.images, { imageUrl: "", caption: "" }] })}
            >
              Add a page
            </Button>
          </div>
        </Card>

        <Card data-tour="landing-nav">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Navigation menu</h2>
          <p className="mb-3 text-xs text-slate-500">
            The links at the top of the landing page and under Quick Links in the footer. Rename them, hide or reorder
            them, point one at a section, the order page or any web address.
          </p>
          {nav.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-slate-600">Using the standard menu: What We Serve, Menu, Our Story, Visit Us.</p>
              <Button type="button" variant="secondary" onClick={() => patch("nav", { items: STANDARD_NAV })}>
                Customize the menu
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {nav.map((link, i) => {
                const upd = (changes: Partial<typeof link>) =>
                  patch("nav", { items: nav.map((x, j) => (i === j ? { ...x, ...changes } : x)) });
                const swap = (to: number) => {
                  const items = [...nav];
                  [items[i], items[to]] = [items[to], items[i]];
                  patch("nav", { items });
                };
                const known = LINK_TARGETS.some((t) => t.href === link.href);
                return (
                  <div
                    key={i}
                    className={`flex flex-col gap-2 rounded-lg border border-slate-200 p-3 ${link.visible ? "" : "bg-slate-50 opacity-70"}`}
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Name" value={link.label} onChange={(v) => upd({ label: v })} />
                      <label className="text-sm font-medium text-slate-700">
                        Goes to
                        <Select
                          className="mt-1"
                          value={known ? link.href : "custom"}
                          onChange={(e) => upd({ href: e.target.value === "custom" ? "https://" : e.target.value })}
                        >
                          {LINK_TARGETS.map((t) => (
                            <option key={t.href} value={t.href}>
                              {t.label}
                            </option>
                          ))}
                          <option value="custom">Another link...</option>
                        </Select>
                      </label>
                    </div>
                    {!known && (
                      <Field
                        label="Link"
                        value={link.href}
                        placeholder="https://..."
                        onChange={(v) => upd({ href: v })}
                      />
                    )}
                    <Toggle label="Show this link" value={link.visible} onChange={(v) => upd({ visible: v })} />
                    <RowActions
                      onRemove={() => patch("nav", { items: nav.filter((_, j) => j !== i) })}
                      onUp={i > 0 ? () => swap(i - 1) : null}
                      onDown={i < nav.length - 1 ? () => swap(i + 1) : null}
                    />
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={nav.length >= 12}
                  onClick={() => patch("nav", { items: [...nav, { label: "", href: "#menu-card", visible: true }] })}
                >
                  Add a link
                </Button>
                <Button type="button" variant="ghost" onClick={() => patch("nav", { items: [] })}>
                  Back to the standard menu
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card data-tour="landing-today-special">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Today's Specials</h2>
            <Toggle label="Show" value={todaySpecial.enabled} onChange={(v) => patch("todaySpecial", { enabled: v })} />
          </div>
          <p className="mb-3 text-xs text-slate-500">
            The dishes listed here are the ones marked <strong>Today's Special</strong> under Food Items, grouped by
            their menu category.
          </p>
          <div className="flex flex-col gap-3">
            <Field label="Eyebrow" value={todaySpecial.eyebrow} onChange={(v) => patch("todaySpecial", { eyebrow: v })} />
            <Field label="Title" value={todaySpecial.title} onChange={(v) => patch("todaySpecial", { title: v })} />
            <Field label="Intro" multiline value={todaySpecial.lead} onChange={(v) => patch("todaySpecial", { lead: v })} />
          </div>
        </Card>

        <Card data-tour="landing-reviews">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Reviews / feedback</h2>
            <Toggle label="Show" value={reviews.enabled} onChange={(v) => patch("reviews", { enabled: v })} />
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Shows the feedback you marked <strong>Show on website</strong> under Feedback: guests' own (table and feedback
            QR) and, if you like, Google reviews. The section stays hidden until at least one review is shown.
          </p>
          <div className="flex flex-col gap-3">
            <Field label="Eyebrow" value={reviews.eyebrow} onChange={(v) => patch("reviews", { eyebrow: v })} />
            <Field label="Title" value={reviews.title} onChange={(v) => patch("reviews", { title: v })} />
            <Field label="Intro" multiline value={reviews.lead} onChange={(v) => patch("reviews", { lead: v })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                How many to show
                <Input
                  className="mt-1"
                  type="number"
                  min={1}
                  max={12}
                  value={reviews.maxItems}
                  onChange={(e) => patch("reviews", { maxItems: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })}
                />
              </label>
              <div className="flex items-end">
                <Toggle
                  label="Include Google reviews"
                  value={reviews.showGoogle}
                  onChange={(v) => patch("reviews", { showGoogle: v })}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card data-tour="landing-story">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Our Story</h2>
            <Toggle label="Show" value={story.enabled} onChange={(v) => patch("story", { enabled: v })} />
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Eyebrow" value={story.eyebrow} onChange={(v) => patch("story", { eyebrow: v })} />
            <Field label="Title" value={story.title} onChange={(v) => patch("story", { title: v })} />
            <ParagraphsField label="Story" value={story.text} onChange={(v) => patch("story", { text: v })} />
            <Field label="Pull quote" multiline value={story.quote} onChange={(v) => patch("story", { quote: v })} />
            <Field
              label="Quote attribution"
              value={story.quoteCite}
              onChange={(v) => patch("story", { quoteCite: v })}
            />
            <ImagePicker
              label="Photo"
              value={story.imageUrl}
              onError={setError}
              onChange={(url) => patch("story", { imageUrl: url })}
            />
            <Field label="Photo caption" value={story.caption} onChange={(v) => patch("story", { caption: v })} />
          </div>
        </Card>

        <Card data-tour="landing-outlets">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Outlets</h2>
            <Toggle label="Show" value={outlets.enabled} onChange={(v) => patch("outlets", { enabled: v })} />
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Eyebrow" value={outlets.eyebrow} onChange={(v) => patch("outlets", { eyebrow: v })} />
            <Field label="Title" value={outlets.title} onChange={(v) => patch("outlets", { title: v })} />

            {outlets.items.map((o, i) => {
              const upd = (changes: Partial<typeof o>) =>
                patch("outlets", { items: outlets.items.map((x, j) => (i === j ? { ...x, ...changes } : x)) });
              const swap = (to: number) => {
                const items = [...outlets.items];
                [items[i], items[to]] = [items[to], items[i]];
                patch("outlets", { items });
              };
              return (
                <div
                  key={i}
                  className={`flex flex-col gap-2 rounded-lg border border-slate-200 p-3 ${o.hidden ? "bg-slate-50 opacity-70" : ""}`}
                >
                  <Toggle label="Show this card on the page" value={!o.hidden} onChange={(v) => upd({ hidden: !v })} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="City" value={o.city} onChange={(v) => upd({ city: v })} />
                    <Field label="Area" value={o.area} onChange={(v) => upd({ area: v })} />
                  </div>
                  <Field label="Address" multiline value={o.address} onChange={(v) => upd({ address: v })} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field
                      label="Hours"
                      value={o.hours}
                      onChange={(v) => upd({ hours: v })}
                      placeholder="Open daily · 7am - 10pm"
                    />
                    <Field
                      label="Map link"
                      value={o.mapUrl}
                      onChange={(v) => upd({ mapUrl: v })}
                      placeholder="https://maps.google.com/..."
                    />
                  </div>
                  <Toggle label="Coming soon" value={o.comingSoon} onChange={(v) => upd({ comingSoon: v })} />
                  <RowActions
                    onRemove={() => patch("outlets", { items: outlets.items.filter((_, j) => j !== i) })}
                    onUp={i > 0 ? () => swap(i - 1) : null}
                    onDown={i < outlets.items.length - 1 ? () => swap(i + 1) : null}
                  />
                </div>
              );
            })}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                patch("outlets", {
                  items: [
                    ...outlets.items,
                    { city: "", area: "", address: "", hours: "", mapUrl: "", comingSoon: false, hidden: false },
                  ],
                })
              }
            >
              Add outlet
            </Button>

            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <Toggle
                label="Show the order-from-your-table card"
                value={outlets.showOrderCard !== false}
                onChange={(v) => patch("outlets", { showOrderCard: v })}
              />
              {outlets.showOrderCard !== false && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field
                      label="Small heading"
                      value={outlets.orderCardEyebrow ?? ""}
                      onChange={(v) => patch("outlets", { orderCardEyebrow: v })}
                    />
                    <Field
                      label="Title"
                      value={outlets.orderCardTitle ?? ""}
                      onChange={(v) => patch("outlets", { orderCardTitle: v })}
                    />
                  </div>
                  <Field
                    label="Text"
                    multiline
                    value={outlets.orderCardText ?? ""}
                    onChange={(v) => patch("outlets", { orderCardText: v })}
                  />
                </>
              )}
            </div>
          </div>
        </Card>

        <Card data-tour="landing-reels">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Reels</h2>
            <Toggle label="Show" value={reels.enabled} onChange={(v) => patch("reels", { enabled: v })} />
          </div>
          <p className="mb-3 text-xs text-slate-500">Off by default - turn it on once you have clips to link to.</p>
          <div className="flex flex-col gap-3">
            <Field label="Title" value={reels.title} onChange={(v) => patch("reels", { title: v })} />
            <Field label="Intro" multiline value={reels.lead} onChange={(v) => patch("reels", { lead: v })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Follow link" value={reels.followUrl} onChange={(v) => patch("reels", { followUrl: v })} />
              <Field
                label="Follow button label"
                value={reels.followLabel}
                onChange={(v) => patch("reels", { followLabel: v })}
              />
            </div>

            {reels.items.map((r, i) => {
              const upd = (changes: Partial<typeof r>) =>
                patch("reels", { items: reels.items.map((x, j) => (i === j ? { ...x, ...changes } : x)) });
              return (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                  <Field label={`Reel ${i + 1} caption`} value={r.caption} onChange={(v) => upd({ caption: v })} />
                  <Field
                    label="Link"
                    value={r.url}
                    onChange={(v) => upd({ url: v })}
                    placeholder="https://instagram.com/..."
                  />
                  <ImagePicker
                    label="Thumbnail"
                    value={r.imageUrl}
                    onError={setError}
                    onChange={(url) => upd({ imageUrl: url })}
                  />
                  <RowActions onRemove={() => patch("reels", { items: reels.items.filter((_, j) => j !== i) })} />
                </div>
              );
            })}
            <Button
              type="button"
              variant="secondary"
              onClick={() => patch("reels", { items: [...reels.items, { caption: "", url: "", imageUrl: "" }] })}
            >
              Add reel
            </Button>
          </div>
        </Card>

        <Card data-tour="landing-cta">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Call-to-action band</h2>
            <Toggle label="Show" value={partnership.enabled} onChange={(v) => patch("partnership", { enabled: v })} />
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Title" value={partnership.title} onChange={(v) => patch("partnership", { title: v })} />
            <Field
              label="Text"
              multiline
              value={partnership.text}
              onChange={(v) => patch("partnership", { text: v })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Button label"
                value={partnership.ctaLabel}
                onChange={(v) => patch("partnership", { ctaLabel: v })}
              />
              <Field
                label="Button link"
                value={partnership.ctaUrl}
                onChange={(v) => patch("partnership", { ctaUrl: v })}
                hint="Leave blank to send guests to the ordering page."
              />
            </div>
          </div>
        </Card>

        <Card data-tour="landing-footer">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Footer</h2>
          <div className="flex flex-col gap-3">
            <Field label="Tagline (press Enter for a new line)" multiline value={footer.tagline} onChange={(v) => patch("footer", { tagline: v })} />

            <p className="text-sm font-medium text-slate-700">Contact links</p>
            {footer.contacts.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field
                  label="Label"
                  value={c.label}
                  onChange={(v) =>
                    patch("footer", { contacts: footer.contacts.map((x, j) => (i === j ? { ...x, label: v } : x)) })
                  }
                />
                <Field
                  label="Link"
                  value={c.url}
                  placeholder="tel:+91... or mailto:..."
                  onChange={(v) =>
                    patch("footer", { contacts: footer.contacts.map((x, j) => (i === j ? { ...x, url: v } : x)) })
                  }
                />
                <RowActions onRemove={() => patch("footer", { contacts: footer.contacts.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => patch("footer", { contacts: [...footer.contacts, { label: "", url: "" }] })}
            >
              Add contact
            </Button>

            <p className="mt-2 text-sm font-medium text-slate-700">Social links</p>
            {footer.socials.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field
                  label="Label"
                  value={c.label}
                  onChange={(v) =>
                    patch("footer", { socials: footer.socials.map((x, j) => (i === j ? { ...x, label: v } : x)) })
                  }
                />
                <Field
                  label="Link"
                  value={c.url}
                  onChange={(v) =>
                    patch("footer", { socials: footer.socials.map((x, j) => (i === j ? { ...x, url: v } : x)) })
                  }
                />
                <RowActions onRemove={() => patch("footer", { socials: footer.socials.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => patch("footer", { socials: [...footer.socials, { label: "", url: "" }] })}
            >
              Add social link
            </Button>
          </div>
        </Card>
      </div>

      {canEdit && (
        <div
          className="sticky bottom-0 -mx-3 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:mx-0"
          data-tour="landing-save"
        >
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Saving..." : "Save landing page"}
          </Button>
        </div>
      )}
    </div>
  );
}
