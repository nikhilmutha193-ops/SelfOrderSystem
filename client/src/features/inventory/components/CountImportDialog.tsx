import { useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { extractErrorMessage } from "../../../shared/api/client";
import { readSpreadsheet } from "../../../shared/export/readSpreadsheet";
import { confirmDialog } from "../../../shared/ui/confirm";
import { Dialog } from "../../../shared/ui/Dialog";
import { Alert, Badge, Button, ErrorText, Input } from "../../../shared/ui/ui";
import { inventoryApi, type CountImportPreview, type CountImportResult } from "../api";
import { qty, rupees } from "../format";
import { inventoryKeys } from "../queries";

/** Save a count from a filled-in count sheet: what was counted against what is on hand, then the differences are posted. */
export function CountImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<CountImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CountImportResult | null>(null);
  const requestId = useRef(0);

  function close() {
    setRows(null);
    setFileName("");
    setNote("");
    setPreview(null);
    setError(null);
    setResult(null);
    onClose();
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    setPreview(null);
    setLoading(true);
    try {
      setRows(await readSpreadsheet(file, "items"));
      setFileName(file.name);
    } catch (err) {
      setError(extractErrorMessage(err));
      setLoading(false);
    }
  }

  // The server compares the file with the stock now. Nothing is saved by this.
  useEffect(() => {
    if (!rows) return;
    const id = ++requestId.current;
    setLoading(true);
    inventoryApi
      .countPreview(rows)
      .then((data) => {
        if (id === requestId.current) {
          setPreview(data);
          setError(null);
        }
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
  }, [rows]);

  const counts = preview?.counts;

  async function save() {
    if (!rows || !counts) return;
    const ok = await confirmDialog({
      title: "Save this count?",
      message: `${counts.counted} item${counts.counted === 1 ? "" : "s"} counted, ${counts.different} with a difference. Stock is set to what was counted${
        counts.skipped > 0 ? `; ${counts.skipped} not counted are left as they are` : ""
      }.`,
      confirmLabel: "Save count",
      tone: "primary",
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      setResult(await inventoryApi.countApply(rows, note.trim() || undefined));
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="xl"
      title="Count stock from a sheet"
      description="Upload the count sheet with the Counted quantity filled in. Stock is set to what you counted and each difference is recorded as an adjustment."
      footer={
        result ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={!counts || loading || counts.counted === 0}>
              {counts && counts.counted > 0 ? `Save count (${counts.counted} items)` : "Nothing to count"}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3 text-sm">
          <Alert tone="success" title="Count saved">
            {result.counted} item{result.counted === 1 ? "" : "s"} counted, {result.different} with a difference
            {result.different > 0 ? ` (${rupees(result.varianceValue)} in all)` : ""}.
            {result.skipped > 0 ? ` ${result.skipped} not counted were left as they are.` : ""}
            {result.problems > 0 ? ` ${result.problems} rows with problems were skipped.` : ""}
          </Alert>
          {result.errors.length > 0 && (
            <ul className="list-disc pl-5 text-slate-600">
              {result.errors.map((r) => (
                <li key={r.row}>
                  Row {r.row} {r.name && `(${r.name})`}: {r.error}
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
              {fileName ? <strong>{fileName}</strong> : "Choose the count sheet (.xlsx or CSV)"}
            </span>
            <input type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={pickFile} />
          </label>
          <Input placeholder="Note, e.g. Sunday night count (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorText>{error}</ErrorText>

          {counts && preview && (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2" aria-live="polite">
                <Badge tone="blue">{counts.counted} counted</Badge>
                <Badge tone={counts.different > 0 ? "amber" : "green"}>{counts.different} different</Badge>
                {counts.skipped > 0 && <Badge tone="gray">{counts.skipped} not counted</Badge>}
                {counts.error > 0 && <Badge tone="red">{counts.error} problems</Badge>}
                {counts.different > 0 && (
                  <span className={`text-xs font-semibold ${counts.varianceValue < 0 ? "text-red-600" : "text-amber-700"}`}>
                    {rupees(counts.varianceValue)} difference in value
                  </span>
                )}
                {loading && <span className="text-xs text-slate-500">Checking...</span>}
              </div>
              {preview.unknownHeaders.length > 0 && (
                <p className="mb-2 text-xs text-slate-500">Columns not recognised and ignored: {preview.unknownHeaders.join(", ")}.</p>
              )}
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">Row</th>
                      <th className="px-2 py-1.5">Item</th>
                      <th className="px-2 py-1.5 text-right">System stock</th>
                      <th className="px-2 py-1.5 text-right">Counted</th>
                      <th className="px-2 py-1.5 text-right">Difference</th>
                      <th className="px-2 py-1.5">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.row} className="border-t border-slate-100 align-top">
                        <td className="px-2 py-1.5 tabular-nums text-slate-400">{r.row}</td>
                        <td className="px-2 py-1.5 font-medium text-slate-800">{r.name || "(no name)"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.unit && r.action !== "error" ? qty(r.expected, r.unit) : "-"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {r.unit && r.counted !== null ? qty(r.counted, r.unit) : "-"}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums ${
                            r.action !== "count" ? "text-slate-300" : r.variance < 0 ? "text-red-600" : r.variance > 0 ? "text-amber-700" : "text-green-700"
                          }`}
                        >
                          {r.unit && r.action === "count" ? `${r.variance > 0 ? "+" : ""}${qty(r.variance, r.unit)}` : "-"}
                        </td>
                        <td className={`px-2 py-1.5 ${r.error ? "text-red-700" : "text-slate-600"}`}>{r.error ?? r.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
