import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  ImagePlus,
  Link2,
  MonitorPlay,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";

import { useCanEdit } from "../../../lib/adminAuth";
import { extractErrorMessage, uploadImage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import { Dialog } from "../../../shared/ui/Dialog";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  Input,
  Page,
  PageHeader,
  Select,
  Skeleton,
  Switch,
} from "../../../shared/ui/ui";
import {
  displayUrl,
  type Display,
  type DisplayFit,
  type DisplayInput,
  type DisplaySlide,
  type DisplayTransition,
} from "../api";
import {
  useCreateDisplay,
  useDeleteDisplay,
  useDisplays,
  useRenewDisplay,
  useUpdateDisplay,
} from "../queries";

const NO_DISPLAYS: Display[] = [];

const BLANK: DisplayInput = {
  name: "",
  active: true,
  slides: [],
  intervalSeconds: 8,
  transition: "fade",
  fit: "cover",
  showCaptions: false,
};

const TRANSITIONS: { value: DisplayTransition; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "zoom", label: "Slow zoom" },
];

const FITS: { value: DisplayFit; label: string }[] = [
  { value: "cover", label: "Fill the screen (may crop)" },
  { value: "contain", label: "Show the whole image" },
];

export default function Displays() {
  const canEdit = useCanEdit("displays");
  const displays = useDisplays();
  const list = displays.data ?? NO_DISPLAYS;
  const [editing, setEditing] = useState<{
    id: string | null;
    draft: DisplayInput;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateDisplay();
  const remove = useDeleteDisplay();

  async function copyLink(display: Display) {
    try {
      await navigator.clipboard.writeText(displayUrl(display.code));
      setCopied(display._id);
      window.setTimeout(
        () => setCopied((c) => (c === display._id ? null : c)),
        2000,
      );
    } catch {
      setError(
        "Couldn't copy the link. Open the display and copy its address from the browser.",
      );
    }
  }

  async function removeDisplay(display: Display) {
    const ok = await confirmDialog({
      title: `Delete "${display.name}"?`,
      message:
        "Any screen using this display's link will stop showing its images.",
      confirmLabel: "Delete display",
    });
    if (!ok) return;
    setError(null);
    try {
      await remove.mutateAsync(display._id);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Page>
      <PageHeader
        title="Display Slideshows"
        description="Full-screen image slideshows for TVs and tablets. Each display has its own images and its own link."
        actions={
          canEdit && (
            <Button
              icon={Plus}
              onClick={() => setEditing({ id: null, draft: { ...BLANK } })}
            >
              New display
            </Button>
          )
        }
      />
      <ErrorText>
        {error ?? (displays.error ? extractErrorMessage(displays.error) : null)}
      </ErrorText>

      {displays.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={MonitorPlay}
            title="No displays yet"
            description="Create a display, add images, then open its link in full screen on the TV."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((display) => (
            <Card key={display._id} padding="none" className="overflow-hidden">
              <div className="grid aspect-video grid-cols-3 gap-px bg-slate-200">
                {display.slides.slice(0, 3).map((slide, i) => (
                  <img
                    key={i}
                    src={slide.url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ))}
                {display.slides.length === 0 && (
                  <div className="col-span-3 flex items-center justify-center bg-slate-100 text-sm text-slate-500">
                    No images yet
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {display.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {display.slides.length} image
                      {display.slides.length === 1 ? "" : "s"} ·{" "}
                      {display.intervalSeconds}s each
                    </p>
                  </div>
                  <Badge tone={display.active ? "green" : "gray"} dot>
                    {display.active ? "On" : "Off"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/display/${display.code}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <ExternalLink size={14} aria-hidden="true" /> Open full
                    screen
                  </a>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Copy}
                    onClick={() => void copyLink(display)}
                  >
                    {copied === display._id ? "Copied" : "Copy link"}
                  </Button>
                  {canEdit && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Pencil}
                        onClick={() =>
                          setEditing({
                            id: display._id,
                            draft: {
                              name: display.name,
                              active: display.active,
                              slides: display.slides.map(
                                ({ url, caption, seconds }) => ({
                                  url,
                                  caption,
                                  seconds,
                                }),
                              ),
                              intervalSeconds: display.intervalSeconds,
                              transition: display.transition,
                              fit: display.fit,
                              showCaptions: display.showCaptions,
                            },
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Switch
                        checked={display.active}
                        disabled={update.isPending}
                        onChange={(active) =>
                          update.mutate({ id: display._id, input: { active } })
                        }
                        label="On"
                      />
                      <IconButton
                        icon={Trash2}
                        label={`Delete ${display.name}`}
                        className="!text-red-600 hover:!bg-red-50"
                        onClick={() => void removeDisplay(display)}
                      />
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <DisplayDialog
          key={editing.id ?? "new"}
          id={editing.id}
          initial={editing.draft}
          display={list.find((d) => d._id === editing.id) ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  );
}

function DisplayDialog({
  id,
  initial,
  display,
  onClose,
}: {
  id: string | null;
  initial: DisplayInput;
  display: Display | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DisplayInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateDisplay();
  const update = useUpdateDisplay();
  const renew = useRenewDisplay();
  const slides = draft.slides ?? [];
  const busy = create.isPending || update.isPending;

  function setSlides(next: DisplaySlide[]) {
    setDraft((d) => ({ ...d, slides: next }));
  }

  function patchSlide(index: number, patch: Partial<DisplaySlide>) {
    setSlides(slides.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[index], next[target]] = [next[target], next[index]];
    setSlides(next);
  }

  async function addImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const added: DisplaySlide[] = [];
    try {
      for (const file of Array.from(files))
        added.push({ url: await uploadImage(file, "banner") });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      if (added.length > 0)
        setDraft((d) => ({ ...d, slides: [...(d.slides ?? []), ...added] }));
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function renewLink() {
    if (!display) return;
    const ok = await confirmDialog({
      title: "Create a new link?",
      message:
        "Screens using the old link go blank until you open the new one on them.",
      confirmLabel: "Create new link",
    });
    if (!ok) return;
    try {
      await renew.mutateAsync(display._id);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const input = { ...draft, name: draft.name.trim() };
      if (id) await update.mutateAsync({ id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={id ? "Edit display" : "New display"}
      description="Images show in this order, one after another, and start over after the last."
      onSubmit={save}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={busy}
            disabled={!draft.name.trim() || uploading}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            htmlFor="display-name"
            hint="For example Entrance TV or Counter screen."
          >
            <Input
              id="display-name"
              value={draft.name}
              maxLength={60}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </Field>
          <Field label="Each image stays (seconds)" htmlFor="display-interval">
            <Input
              id="display-interval"
              type="number"
              inputMode="numeric"
              min={2}
              max={300}
              value={draft.intervalSeconds ?? 8}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  intervalSeconds: Number(e.target.value) || 8,
                }))
              }
            />
          </Field>
          <Field label="Change with" htmlFor="display-transition">
            <Select
              id="display-transition"
              value={draft.transition}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  transition: e.target.value as DisplayTransition,
                }))
              }
            >
              {TRANSITIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Image size" htmlFor="display-fit">
            <Select
              id="display-fit"
              value={draft.fit}
              onChange={(e) =>
                setDraft((d) => ({ ...d, fit: e.target.value as DisplayFit }))
              }
            >
              {FITS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Switch
            checked={draft.active ?? true}
            onChange={(active) => setDraft((d) => ({ ...d, active }))}
            label="Display is on"
            description="Off: the link shows nothing."
          />
          <Switch
            checked={draft.showCaptions ?? false}
            onChange={(showCaptions) =>
              setDraft((d) => ({ ...d, showCaptions }))
            }
            label="Show captions"
            description="Writes each image's caption over its bottom edge."
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">
              Images{" "}
              <span className="font-normal text-slate-500">
                ({slides.length}/50)
              </span>
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={ImagePlus}
              loading={uploading}
              disabled={slides.length >= 50}
              onClick={() => fileRef.current?.click()}
            >
              Add images
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void addImages(e.target.files)}
            />
          </div>
          {slides.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              No images yet. Add several at once; landscape images look best on
              a TV.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {slides.map((slide, i) => (
                <li
                  key={`${i}-${slide.url}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-2"
                >
                  <img
                    src={slide.url}
                    alt=""
                    className="h-14 w-24 shrink-0 rounded-md bg-slate-100 object-cover"
                  />
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_6rem]">
                    <Input
                      aria-label={`Caption for image ${i + 1}`}
                      placeholder="Caption (optional)"
                      maxLength={120}
                      value={slide.caption ?? ""}
                      onChange={(e) =>
                        patchSlide(i, { caption: e.target.value })
                      }
                    />
                    <Input
                      aria-label={`Seconds for image ${i + 1}`}
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={300}
                      placeholder={`${draft.intervalSeconds ?? 8}s`}
                      value={slide.seconds ?? ""}
                      onChange={(e) =>
                        patchSlide(i, {
                          seconds:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex shrink-0 flex-col sm:flex-row">
                    <IconButton
                      icon={ArrowUp}
                      label={`Move image ${i + 1} up`}
                      size="sm"
                      type="button"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    />
                    <IconButton
                      icon={ArrowDown}
                      label={`Move image ${i + 1} down`}
                      size="sm"
                      type="button"
                      disabled={i === slides.length - 1}
                      onClick={() => move(i, 1)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={`Remove image ${i + 1}`}
                      size="sm"
                      type="button"
                      className="!text-red-600 hover:!bg-red-50"
                      onClick={() =>
                        setSlides(slides.filter((_, j) => j !== i))
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {display && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
            <span className="min-w-0 truncate text-slate-600">
              <Link2 size={14} className="mr-1 inline" aria-hidden="true" />
              {displayUrl(display.code)}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={renew.isPending}
              onClick={() => void renewLink()}
            >
              New link
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
