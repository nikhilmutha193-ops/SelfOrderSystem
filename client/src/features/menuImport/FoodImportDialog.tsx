import { FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { extractErrorMessage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import { Dialog } from "../../shared/ui/Dialog";
import { Alert, Badge, Button, ErrorText, type BadgeTone } from "../../shared/ui/ui";
import {
  menuImportApi,
  readMenuFile,
  type ImportAction,
  type ImportMode,
  type ImportPreview,
  type ImportResult,
} from "./api";

const MODES: { value: ImportMode; title: string; text: string }[] = [
  {
    value: "insert",
    title: "Add new dishes only",
    text: "Dishes already on the menu (same category and name) are not touched.",
  },
  {
    value: "upsert",
    title: "Add new and update existing",
    text: "Dishes already on the menu are updated with what is in the file. Review the changes below first.",
  },
  {
    value: "replace",
    title: "Replace the menu",
    text: "Same as above, and every dish that is not in the file is hidden from the menu (nothing is deleted).",
  },
];

const ACTION: Record<ImportAction, { label: string; tone: BadgeTone }> = {
  insert: { label: "New", tone: "green" },
  update: { label: "Update", tone: "blue" },
  unchanged: { label: "No change", tone: "gray" },
  duplicate: { label: "Duplicate", tone: "amber" },
  error: { label: "Problem", tone: "red" },
};

export function FoodImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<ImportMode>("insert");
  const [createMissing, setCreateMissing] = useState(true);
  // null until the first preview says which columns the file has; then the ones to take from it.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const requestId = useRef(0);

  function reset() {
    setRows(null);
    setFileName("");
    setMode("insert");
    setCreateMissing(true);
    setPicked(null);
    setPreview(null);
    setError(null);
    setResult(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    reset();
    setLoading(true);
    try {
      setRows(await readMenuFile(file));
      setFileName(file.name);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // Ask the server what would happen whenever the file or a choice changes. Nothing is saved by this.
  useEffect(() => {
    if (!rows) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    menuImportApi
      .preview({ rows, mode, createMissing, ...(picked && { fields: picked }) })
      .then((data) => {
        if (id !== requestId.current) return;
        setPreview(data);
        if (!picked) setPicked(data.fields.filter((f) => f.selected).map((f) => f.key));
      })
      .catch((err) => {
        if (id === requestId.current) {
          setPreview(null);
          setError(extractErrorMessage(err));
        }
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [rows, mode, createMissing, picked]);

  function toggleField(key: string) {
    setPicked((current) => (current ?? []).includes(key) ? (current ?? []).filter((k) => k !== key) : [...(current ?? []), key]);
  }

  const counts = preview?.counts;
  const changes = counts ? counts.insert + counts.update + counts.remove : 0;

  async function runImport() {
    if (!rows || !counts || !picked) return;
    const lines = [
      counts.insert > 0 && `${counts.insert} new dish${counts.insert === 1 ? "" : "es"} added`,
      counts.update > 0 && `${counts.update} updated`,
      counts.remove > 0 && `${counts.remove} hidden from the menu`,
      counts.error > 0 && `${counts.error} row${counts.error === 1 ? "" : "s"} with problems skipped`,
    ].filter(Boolean);
    const ok = await confirmDialog({
      title: mode === "replace" ? "Replace the menu?" : "Import these dishes?",
      message: lines.join(", ") + ".",
      confirmLabel: "Import",
      tone: mode === "replace" ? "danger" : "primary",
    });
    if (!ok) return;
    setImporting(true);
    setError(null);
    try {
      setResult(await menuImportApi.apply({ rows, mode, createMissing, fields: picked }));
      onImported();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="xl"
      title="Import dishes from Excel"
      description="Upload an .xlsx or .csv file. Export your current menu first to get the right columns."
      footer={
        result ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={runImport} loading={importing} disabled={!preview || loading || changes === 0}>
              {changes === 0 ? "Nothing to import" : `Import ${changes} change${changes === 1 ? "" : "s"}`}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3 text-sm">
          <Alert tone="success" title="Import finished">
            {result.inserted} added, {result.updated} updated, {result.hidden} hidden, {result.duplicates} duplicates left
            alone
            {result.skipped > 0 ? `, ${result.skipped} rows skipped because of problems` : ""}.
            {(result.createdCategories > 0 || result.createdSubcategories > 0) &&
              ` Created ${result.createdCategories} categories and ${result.createdSubcategories} subcategories.`}
          </Alert>
          {result.errors.length > 0 && (
            <ul className="list-disc pl-5 text-slate-600">
              {result.errors.map((r) => (
                <li key={r.row}>
                  Row {r.row} {r.name && `(${r.name})`}: {r.note}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 hover:bg-slate-100">
            <FileUp size={20} aria-hidden="true" className="text-slate-500" />
            <span className="min-w-0 flex-1 truncate">
              {fileName ? <strong>{fileName}</strong> : "Choose an Excel (.xlsx) or CSV file"}
            </span>
            <input type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={pickFile} />
          </label>
          <ErrorText>{error}</ErrorText>

          {rows && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 font-medium text-slate-800">What should happen to dishes already on the menu?</legend>
                {MODES.map((m) => (
                  <label
                    key={m.value}
                    className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2 ${
                      mode === m.value ? "border-orange-400 bg-orange-50" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      className="mt-1"
                      checked={mode === m.value}
                      onChange={() => setMode(m.value)}
                    />
                    <span>
                      <span className="block font-medium text-slate-900">{m.title}</span>
                      <span className="block text-xs text-slate-500">{m.text}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {preview && picked && (
                <fieldset>
                  <legend className="mb-1 font-medium text-slate-800">Columns to take from the file</legend>
                  <p className="mb-2 text-xs text-slate-500">
                    Category and Name find the dish and are always used. A column you untick is left alone: new dishes
                    get the usual default and existing dishes keep what they have, so you can set it up later. Empty
                    cells never change a dish.
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                    {preview.fields.map((f) => (
                      <label key={f.key} className="flex items-center gap-2 py-0.5">
                        <input
                          type="checkbox"
                          checked={f.locked || picked.includes(f.key)}
                          disabled={f.locked}
                          onChange={() => toggleField(f.key)}
                        />
                        {f.label}
                      </label>
                    ))}
                  </div>
                  {preview.unknownHeaders.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      Not recognised and ignored: {preview.unknownHeaders.join(", ")}.
                    </p>
                  )}
                </fieldset>
              )}

              <label className="flex items-center gap-2">
                <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
                Create categories and subcategories that are in the file but not on the menu yet
              </label>

              {counts && (
                <div>
                  <div className="mb-2 flex flex-wrap gap-2" aria-live="polite">
                    <Badge tone="green">{counts.insert} new</Badge>
                    <Badge tone="blue">{counts.update} to update</Badge>
                    <Badge tone="gray">{counts.unchanged} no change</Badge>
                    <Badge tone="amber">{counts.duplicate} duplicates</Badge>
                    {counts.remove > 0 && <Badge tone="violet">{counts.remove} to hide</Badge>}
                    {counts.error > 0 && <Badge tone="red">{counts.error} problems</Badge>}
                    {loading && <span className="text-xs text-slate-500">Checking...</span>}
                  </div>
                  {mode === "replace" && counts.remove > 0 && (
                    <Alert tone="warning" className="mb-2">
                      {counts.remove} dishes that are not in the file will be hidden from the menu:{" "}
                      {preview!.toRemove
                        .slice(0, 8)
                        .map((r) => r.name)
                        .join(", ")}
                      {counts.remove > 8 ? ", ..." : ""}
                    </Alert>
                  )}
                  <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5">Row</th>
                          <th className="px-2 py-1.5">Dish</th>
                          <th className="px-2 py-1.5">Result</th>
                          <th className="px-2 py-1.5">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview!.rows.map((r) => (
                          <tr key={r.row} className="border-t border-slate-100 align-top">
                            <td className="px-2 py-1.5 tabular-nums text-slate-400">{r.row}</td>
                            <td className="px-2 py-1.5">
                              <span className="font-medium text-slate-800">{r.name || "(no name)"}</span>
                              <span className="block text-slate-400">
                                {[r.category, r.subcategory].filter(Boolean).join(" › ")}
                              </span>
                            </td>
                            <td className="px-2 py-1.5">
                              <Badge tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Badge>
                            </td>
                            <td className="px-2 py-1.5 text-slate-600">
                              {r.changes.length > 0 ? r.changes.join("; ") : (r.note ?? "")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview!.rowsShown < counts.rows && (
                    <p className="mt-1 text-xs text-slate-500">Showing the first {preview!.rowsShown} rows; all are imported.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
