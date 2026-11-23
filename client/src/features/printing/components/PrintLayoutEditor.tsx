import { Eye, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, extractErrorMessage } from "../../../shared/api/client";
import { Alert, Button, Field, Select, Switch, Tabs } from "../../../shared/ui/ui";
import {
  PAPERS,
  TEXT_SIZE_OPTIONS,
  type LayoutField,
  type PaperKey,
  type PrintLayouts,
  type ResolvedLayout,
  type TextSize,
} from "../layout";
import { ThermalTicket, type ThermalPreview } from "./ThermalTicket";

interface Props {
  title: string;
  description: string;
  showFields: LayoutField[];
  fontFields: LayoutField[];
  layouts: PrintLayouts | undefined;
  resolve: (paper: PaperKey) => ResolvedLayout;
  onChange: (layouts: PrintLayouts) => void;
  /**
   * POST endpoint that returns a PDF made from the unsaved settings and sample data. The same path with "-thermal"
   * added returns what a thermal printer prints (for the 58 mm and 80 mm rolls).
   */
  previewPath: string;
  /** The form's current, unsaved values the preview is drawn from. */
  previewBody: () => Record<string, unknown>;
  /** Which paper to start on (from the paper size chosen above). */
  initialPaper: PaperKey;
}

/**
 * Per paper (58 mm, 80 mm, page): which details print and how big each part is, with a preview
 * of dummy data on the same screen.
 */
export function PrintLayoutEditor({
  title,
  description,
  showFields,
  fontFields,
  layouts,
  resolve,
  onChange,
  previewPath,
  previewBody,
  initialPaper,
}: Props) {
  const [paper, setPaper] = useState<PaperKey>(initialPaper);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thermal, setThermal] = useState<ThermalPreview | null>(null);
  // A roll is shown as the thermal printer prints it; the page-sized PDF is one tab away.
  const [view, setView] = useState<"thermal" | "pdf">("thermal");
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastUrl = useRef<string | null>(null);
  const resolved = resolve(paper);

  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  function update(patch: (current: NonNullable<PrintLayouts[PaperKey]>) => NonNullable<PrintLayouts[PaperKey]>) {
    const current = layouts?.[paper] ?? {};
    onChange({ ...layouts, [paper]: patch(current) });
  }

  async function preview(forPaper: PaperKey = paper, forView: "thermal" | "pdf" = view) {
    setError(null);
    setLoading(true);
    try {
      if (forView === "thermal" && forPaper !== "page") {
        const res = await api.post<ThermalPreview>(`${previewPath}-thermal`, { ...previewBody(), paper: forPaper });
        setThermal(res.data);
      } else {
        const res = await api.post(previewPath, { ...previewBody(), paper: forPaper }, { responseType: "blob" });
        const url = URL.createObjectURL(res.data);
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = url;
        setPreviewUrl(url);
      }
      setShown(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function choosePaper(next: PaperKey) {
    setPaper(next);
    // Keep the preview on the same paper as the controls once one has been shown.
    if (shown) void preview(next);
  }

  function chooseView(next: "thermal" | "pdf") {
    setView(next);
    if (shown) void preview(paper, next);
  }

  const onRoll = paper !== "page";
  const showThermal = onRoll && view === "thermal";

  const hasOverrides = !!layouts?.[paper] && (Object.keys(layouts[paper]?.show ?? {}).length > 0 || Object.keys(layouts[paper]?.fonts ?? {}).length > 0);

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" icon={Eye} loading={loading} onClick={() => void preview()}>
          Preview with sample data
        </Button>
      </div>

      <div className="mt-3">
        <Tabs size="sm" value={paper} onChange={(v) => choosePaper(v as PaperKey)} items={PAPERS} />
        <p className="mt-2 text-xs text-slate-500">
          Each paper keeps its own choices, so a 58 mm roll can drop details an 80 mm roll has room for.
        </p>
      </div>

      <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Show on the print</p>
            <div className="grid gap-x-6 sm:grid-cols-2">
              {showFields.map((field) => (
                <div key={field.key} className="border-b border-slate-100 py-2">
                  <Switch
                    id={`${previewPath}-${paper}-${field.key}`}
                    checked={!!resolved.show[field.key]}
                    onChange={(v) =>
                      update((current) => ({ ...current, show: { ...current.show, [field.key]: v } }))
                    }
                    label={field.label}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Text size</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {fontFields.map((field) => (
                <Field key={field.key} label={field.label} htmlFor={`${previewPath}-${paper}-font-${field.key}`}>
                  <Select
                    id={`${previewPath}-${paper}-font-${field.key}`}
                    value={resolved.fonts[field.key]}
                    onChange={(e) =>
                      update((current) => ({
                        ...current,
                        fonts: { ...current.fonts, [field.key]: e.target.value as TextSize },
                      }))
                    }
                  >
                    {TEXT_SIZE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              On thermal printers Small uses the printer's narrow font, Medium prints taller letters of the same
              width (between Normal and Large) and Large prints double size, so a large line holds half as many
              characters.
            </p>
          </div>

          {hasOverrides && (
            <div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={RotateCcw}
                onClick={() => {
                  const next = { ...layouts };
                  delete next[paper];
                  onChange(next);
                }}
              >
                Reset this paper to the defaults
              </Button>
            </div>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-24">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Preview</p>
            {onRoll && (
              <Tabs
                size="sm"
                value={view}
                onChange={(v) => chooseView(v as "thermal" | "pdf")}
                items={[
                  { value: "thermal", label: "Thermal printout" },
                  { value: "pdf", label: "Paper (PDF)" },
                ]}
              />
            )}
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          {showThermal && thermal ? (
            <div className="max-h-[36rem] overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3">
              <ThermalTicket preview={thermal} />
            </div>
          ) : !showThermal && previewUrl ? (
            <iframe
              title={`${title} preview`}
              src={previewUrl}
              className="h-[34rem] w-full rounded-xl border border-slate-200 bg-slate-50"
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 text-center text-sm text-slate-500">
              Press "Preview with sample data" to see this paper here, using made-up dishes and amounts. A 58 or 80 mm
              roll is shown as the thermal printer prints it. Nothing is printed or saved.
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            The preview uses your unsaved choices. Press Save settings at the bottom to keep them.
          </p>
        </div>
      </div>
    </div>
  );
}
