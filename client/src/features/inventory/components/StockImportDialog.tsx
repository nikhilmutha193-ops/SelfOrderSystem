import { useQueryClient } from "@tanstack/react-query";
import { Download, FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { extractErrorMessage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import { Dialog } from "../../../shared/ui/Dialog";
import { readSpreadsheet } from "../../../shared/export/readSpreadsheet";
import { Alert, Badge, Button, ErrorText, type BadgeTone } from "../../../shared/ui/ui";
import { inventoryApi, type StockImportPreview, type StockImportResult, type StockImportRow } from "../api";
import { STOCK_UNIT_OPTIONS, qty } from "../format";
import { inventoryKeys } from "../queries";
import { downloadStockSample } from "../stockSample";

const ACTION: Record<StockImportRow["action"], { label: string; tone: BadgeTone }> = {
  create: { label: "New item", tone: "green" },
  add: { label: "Adds to stock", tone: "blue" },
  update: { label: "Details only", tone: "violet" },
  unchanged: { label: "No change", tone: "gray" },
  error: { label: "Problem", tone: "red" },
};

/** The guide to every "Counted in" type, so the file can be filled in without guessing. */
function UnitGuide() {
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" open>
      <summary className="cursor-pointer font-medium text-slate-800">What "Counted in" can be</summary>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-2">Type</th>
              <th className="py-1 pr-2">Use it for</th>
              <th className="py-1 pr-2">Example</th>
              <th className="py-1">You can write</th>
            </tr>
          </thead>
          <tbody>
            {STOCK_UNIT_OPTIONS.map((u) => (
              <tr key={u.value} className="border-t border-slate-200 align-top">
                <td className="py-1 pr-2 font-semibold whitespace-nowrap text-slate-800">{u.label}</td>
                <td className="py-1 pr-2 text-slate-600">{u.means}</td>
                <td className="py-1 pr-2 whitespace-nowrap text-slate-600">{u.example}</td>
                <td className="py-1 font-mono text-slate-500">{u.words}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Quantity is in that type and is <b>added</b> to what is on hand. Cost per unit is the cost of one of that type (one kg, one
        litre, one packet...).
      </p>
    </details>
  );
}

export function StockImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<StockImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StockImportResult | null>(null);
  const requestId = useRef(0);

  function close() {
    setRows(null);
    setFileName("");
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
      setRows(await readSpreadsheet(file, "stock items"));
      setFileName(file.name);
    } catch (err) {
      setError(extractErrorMessage(err));
      setLoading(false);
    }
  }

  // Ask the server what the file would do. Nothing is saved by this.
  useEffect(() => {
    if (!rows) return;
    const id = ++requestId.current;
    setLoading(true);
    inventoryApi
      .importPreview(rows)
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
  const changes = counts ? counts.create + counts.add + counts.update : 0;

  async function runImport() {
    if (!rows || !counts) return;
    const lines = [
      counts.create > 0 && `${counts.create} new item${counts.create === 1 ? "" : "s"}`,
      counts.add > 0 && `stock added to ${counts.add} existing item${counts.add === 1 ? "" : "s"}`,
      counts.update > 0 && `${counts.update} item${counts.update === 1 ? "" : "s"} updated`,
      counts.error > 0 && `${counts.error} row${counts.error === 1 ? "" : "s"} with problems skipped`,
    ].filter(Boolean);
    const ok = await confirmDialog({
      title: "Import this stock?",
      message: `${lines.join(", ")}. Quantities are added to what is on hand now.`,
      confirmLabel: "Import",
      tone: "primary",
    });
    if (!ok) return;
    setImporting(true);
    setError(null);
    try {
      setResult(await inventoryApi.importApply(rows));
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
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
      title="Import stock from Excel"
      description="New items are created, and for items already in Inventory the quantity is added to the stock on hand."
      footer={
        result ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={runImport} loading={importing} disabled={!preview || loading || changes === 0}>
              {changes === 0 ? "Nothing to import" : `Import ${changes} item${changes === 1 ? "" : "s"}`}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3 text-sm">
          <Alert tone="success" title="Import finished">
            {result.created} new item{result.created === 1 ? "" : "s"}, stock added to {result.added} existing item
            {result.added === 1 ? "" : "s"}, {result.updated} updated
            {result.skipped > 0 ? `, ${result.skipped} rows skipped because of problems` : ""}.
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 hover:bg-slate-100">
              <FileUp size={20} aria-hidden="true" className="text-slate-500" />
              <span className="min-w-0 flex-1 truncate">
                {fileName ? <strong>{fileName}</strong> : "Choose an Excel (.xlsx) or CSV file"}
              </span>
              <input type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={pickFile} />
            </label>
            <Button variant="secondary" icon={Download} onClick={() => void downloadStockSample()}>
              Download sample
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>
          <UnitGuide />

          {counts && preview && (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2" aria-live="polite">
                <Badge tone="green">{counts.create} new</Badge>
                <Badge tone="blue">{counts.add} add to stock</Badge>
                {counts.update > 0 && <Badge tone="violet">{counts.update} details only</Badge>}
                {counts.unchanged > 0 && <Badge tone="gray">{counts.unchanged} no change</Badge>}
                {counts.error > 0 && <Badge tone="red">{counts.error} problems</Badge>}
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
                      <th className="px-2 py-1.5">Result</th>
                      <th className="px-2 py-1.5 text-right">Stock</th>
                      <th className="px-2 py-1.5">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.row} className="border-t border-slate-100 align-top">
                        <td className="px-2 py-1.5 tabular-nums text-slate-400">{r.row}</td>
                        <td className="px-2 py-1.5 font-medium text-slate-800">{r.name || "(no name)"}</td>
                        <td className="px-2 py-1.5">
                          <Badge tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Badge>
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                          {r.action === "error" || !r.unit ? (
                            "-"
                          ) : r.quantity > 0 ? (
                            <>
                              {qty(r.before, r.unit)} → <b>{qty(r.after, r.unit)}</b>
                              <span className="block text-green-700">+{qty(r.quantity, r.unit)}</span>
                            </>
                          ) : (
                            qty(r.before, r.unit)
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">
                          {r.error ?? r.notes.join("; ")}
                        </td>
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
