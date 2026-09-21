import { useEffect, useState } from "react";
import { api, extractErrorMessage, uploadImage } from "../../lib/apiClient";
import { Button, Card, ErrorText, Input, Textarea } from "../../components/ui";
import { useCanEdit } from "../../lib/adminAuth";
import type { LandingContent } from "../../lib/types";

type Section = keyof LandingContent;

/** Small labelled field so the eight panels below stay readable. */
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
        <Textarea className="mt-1" rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
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

type HAlign = "" | "left" | "center" | "right";
type VAlign = "" | "top" | "center" | "bottom";

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

/** Shared segmented control behind the horizontal and vertical pickers below. */
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

function RowActions({ onRemove }: { onRemove: () => void }) {
  return (
    <button type="button" className="self-start text-xs font-semibold text-red-600" onClick={onRemove}>
      Remove
    </button>
  );
}

export default function LandingPageEditor() {
  const [content, setContent] = useState<LandingContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = useCanEdit("landing");

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

  const { hero, serve, menu, story, outlets, reels, partnership, footer } = content;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Landing Page</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything on your public page. Dishes, team, awards and reviews come from their own sections - this is the
          wording around them.
        </p>
      </div>

      <ErrorText>{error}</ErrorText>
      {message && <p className="text-sm text-green-700">{message}</p>}

      {/* Sections flow into two columns on wide screens so the page width is used. */}
      <div className="gap-6 xl:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
      {/* Hero */}
      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Hero banner</h2>
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
            <Field label="Primary button" value={hero.primaryLabel} onChange={(v) => patch("hero", { primaryLabel: v })} />
            <Field
              label="Secondary button"
              value={hero.secondaryLabel}
              onChange={(v) => patch("hero", { secondaryLabel: v })}
            />
          </div>
        </div>
      </Card>

      {/* What we serve */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">What We Serve</h2>
          <Toggle label="Show" value={serve.enabled} onChange={(v) => patch("serve", { enabled: v })} />
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Title" value={serve.title} onChange={(v) => patch("serve", { title: v })} />
          <Field label="Intro" multiline value={serve.lead} onChange={(v) => patch("serve", { lead: v })} />
          <Field label="Hint under the cards" value={serve.hint} onChange={(v) => patch("serve", { hint: v })} />

          <div className="flex flex-col gap-3">
            {serve.items.map((item, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
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

      {/* Menu highlights */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Menu highlights</h2>
          <Toggle label="Show" value={menu.enabled} onChange={(v) => patch("menu", { enabled: v })} />
        </div>
        <p className="mb-3 text-xs text-slate-500">
          The dishes listed here are the ones marked <strong>Bestseller</strong> under Food Items.
        </p>
        <div className="flex flex-col gap-3">
          <Field label="Eyebrow" value={menu.eyebrow} onChange={(v) => patch("menu", { eyebrow: v })} />
          <Field label="Title" value={menu.title} onChange={(v) => patch("menu", { title: v })} />
          <Field label="Intro" multiline value={menu.lead} onChange={(v) => patch("menu", { lead: v })} />
          <Field label="Button label" value={menu.ctaLabel} onChange={(v) => patch("menu", { ctaLabel: v })} />
        </div>
      </Card>

      {/* Story */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Our Story</h2>
          <Toggle label="Show" value={story.enabled} onChange={(v) => patch("story", { enabled: v })} />
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Eyebrow" value={story.eyebrow} onChange={(v) => patch("story", { eyebrow: v })} />
          <Field label="Title" value={story.title} onChange={(v) => patch("story", { title: v })} />
          <Field label="Story" multiline value={story.text} onChange={(v) => patch("story", { text: v })} />
          <Field label="Pull quote" multiline value={story.quote} onChange={(v) => patch("story", { quote: v })} />
          <Field label="Quote attribution" value={story.quoteCite} onChange={(v) => patch("story", { quoteCite: v })} />
          <ImagePicker
            label="Photo"
            value={story.imageUrl}
            onError={setError}
            onChange={(url) => patch("story", { imageUrl: url })}
          />
          <Field label="Photo caption" value={story.caption} onChange={(v) => patch("story", { caption: v })} />
        </div>
      </Card>

      {/* Outlets */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Outlets</h2>
          <Toggle label="Show" value={outlets.enabled} onChange={(v) => patch("outlets", { enabled: v })} />
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Eyebrow" value={outlets.eyebrow} onChange={(v) => patch("outlets", { eyebrow: v })} />
          <Field label="Title" value={outlets.title} onChange={(v) => patch("outlets", { title: v })} />

          {outlets.items.map((o, i) => {
            const upd = (changes: Partial<typeof o>) =>
              patch("outlets", { items: outlets.items.map((x, j) => (i === j ? { ...x, ...changes } : x)) });
            return (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="City" value={o.city} onChange={(v) => upd({ city: v })} />
                  <Field label="Area" value={o.area} onChange={(v) => upd({ area: v })} />
                </div>
                <Field label="Address" multiline value={o.address} onChange={(v) => upd({ address: v })} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Hours" value={o.hours} onChange={(v) => upd({ hours: v })} placeholder="Open daily · 7am - 10pm" />
                  <Field label="Map link" value={o.mapUrl} onChange={(v) => upd({ mapUrl: v })} placeholder="https://maps.google.com/..." />
                </div>
                <Toggle label="Coming soon" value={o.comingSoon} onChange={(v) => upd({ comingSoon: v })} />
                <RowActions onRemove={() => patch("outlets", { items: outlets.items.filter((_, j) => j !== i) })} />
              </div>
            );
          })}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              patch("outlets", {
                items: [...outlets.items, { city: "", area: "", address: "", hours: "", mapUrl: "", comingSoon: false }],
              })
            }
          >
            Add outlet
          </Button>
        </div>
      </Card>

      {/* Reels */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Reels</h2>
          <Toggle label="Show" value={reels.enabled} onChange={(v) => patch("reels", { enabled: v })} />
        </div>
        <p className="mb-3 text-xs text-slate-500">Off by default - turn it on once you have clips to link to.</p>
        <div className="flex flex-col gap-3">
          <Field label="Title" value={reels.title} onChange={(v) => patch("reels", { title: v })} />
          <Field label="Intro" multiline value={reels.lead} onChange={(v) => patch("reels", { lead: v })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Follow link" value={reels.followUrl} onChange={(v) => patch("reels", { followUrl: v })} />
            <Field label="Follow button label" value={reels.followLabel} onChange={(v) => patch("reels", { followLabel: v })} />
          </div>

          {reels.items.map((r, i) => {
            const upd = (changes: Partial<typeof r>) =>
              patch("reels", { items: reels.items.map((x, j) => (i === j ? { ...x, ...changes } : x)) });
            return (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
                <Field label={`Reel ${i + 1} caption`} value={r.caption} onChange={(v) => upd({ caption: v })} />
                <Field label="Link" value={r.url} onChange={(v) => upd({ url: v })} placeholder="https://instagram.com/..." />
                <ImagePicker label="Thumbnail" value={r.imageUrl} onError={setError} onChange={(url) => upd({ imageUrl: url })} />
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

      {/* Partnership / CTA band */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Call-to-action band</h2>
          <Toggle label="Show" value={partnership.enabled} onChange={(v) => patch("partnership", { enabled: v })} />
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Title" value={partnership.title} onChange={(v) => patch("partnership", { title: v })} />
          <Field label="Text" multiline value={partnership.text} onChange={(v) => patch("partnership", { text: v })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Button label" value={partnership.ctaLabel} onChange={(v) => patch("partnership", { ctaLabel: v })} />
            <Field
              label="Button link"
              value={partnership.ctaUrl}
              onChange={(v) => patch("partnership", { ctaUrl: v })}
              hint="Leave blank to send guests to the ordering page."
            />
          </div>
        </div>
      </Card>

      {/* Footer */}
      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Footer</h2>
        <div className="flex flex-col gap-3">
          <Field label="Tagline" multiline value={footer.tagline} onChange={(v) => patch("footer", { tagline: v })} />

          <p className="text-sm font-medium text-slate-700">Contact links</p>
          {footer.contacts.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field
                label="Label"
                value={c.label}
                onChange={(v) => patch("footer", { contacts: footer.contacts.map((x, j) => (i === j ? { ...x, label: v } : x)) })}
              />
              <Field
                label="Link"
                value={c.url}
                placeholder="tel:+91... or mailto:..."
                onChange={(v) => patch("footer", { contacts: footer.contacts.map((x, j) => (i === j ? { ...x, url: v } : x)) })}
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
                onChange={(v) => patch("footer", { socials: footer.socials.map((x, j) => (i === j ? { ...x, label: v } : x)) })}
              />
              <Field
                label="Link"
                value={c.url}
                onChange={(v) => patch("footer", { socials: footer.socials.map((x, j) => (i === j ? { ...x, url: v } : x)) })}
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
        <div className="sticky bottom-0 -mx-3 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:mx-0">
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Saving..." : "Save landing page"}
          </Button>
        </div>
      )}
    </div>
  );
}
