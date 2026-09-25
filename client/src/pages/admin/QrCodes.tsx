import { useEffect, useState } from "react";

import { Button, Card, ErrorText, Input } from "../../components/ui";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { buildTableQrFrame } from "../../lib/qrFrame";
import type { QrSettings, Restaurant, TableRow } from "../../lib/types";

interface FrameState {
  status: "loading" | "ready" | "error";
  dataUrl?: string;
  error?: string;
}

const DEFAULT_QR_SETTINGS: QrSettings = {
  showLogo: true,
  showName: true,
  showAddress: false,
  instructionText: "Scan to view menu & order",
  accentColor: "#ea580c",
};

export default function QrCodes() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [qrSettings, setQrSettings] = useState<QrSettings>(DEFAULT_QR_SETTINGS);
  const [frames, setFrames] = useState<Record<string, FrameState>>({});
  const [logoSrc, setLogoSrc] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<TableRow[]>("/tables"), api.get<Restaurant>("/restaurant/settings")])
      .then(([tablesRes, restaurantRes]) => {
        setTables(tablesRes.data);
        setRestaurant(restaurantRes.data);
        if (restaurantRes.data.qrSettings) setQrSettings(restaurantRes.data.qrSettings);
      })
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  useEffect(() => {
    if (!restaurant?.logoUrl || !qrSettings.showLogo) {
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
      .catch(() => setLogoSrc(restaurant.logoUrl)); // fall back to the raw URL (works if the bucket allows CORS)
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [restaurant?.logoUrl, qrSettings.showLogo]);

  useEffect(() => {
    if (!restaurant || tables.length === 0) return;
    setFrames({});

    tables.forEach((table) => {
      setFrames((prev) => (prev[table._id] ? prev : { ...prev, [table._id]: { status: "loading" } }));

      const baseUrl = restaurant.publicUrl || window.location.origin;
      const orderUrl = table.qrToken
        ? `${baseUrl}/order?t=${encodeURIComponent(table.qrToken)}`
        : `${baseUrl}/order?code=${encodeURIComponent(table.code)}`;
      buildTableQrFrame({
        orderUrl,
        tableCode: table.code,
        restaurantName: restaurant.name,
        logoUrl: logoSrc,
        address: restaurant.address,
        instructionText: qrSettings.instructionText,
        accentColor: qrSettings.accentColor,
        showLogo: qrSettings.showLogo,
        showName: qrSettings.showName,
        showAddress: qrSettings.showAddress,
      })
        .then((dataUrl) => setFrames((prev) => ({ ...prev, [table._id]: { status: "ready", dataUrl } })))
        .catch((err) =>
          setFrames((prev) => ({ ...prev, [table._id]: { status: "error", error: extractErrorMessage(err) } }))
        );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant, tables, qrSettings, logoSrc]);

  async function saveQrSettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const res = await api.put<Restaurant>("/restaurant/settings", { qrSettings });
      setQrSettings(res.data.qrSettings);
      setMessage("QR code settings saved");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function download(table: TableRow) {
    const frame = frames[table._id];
    if (frame?.status !== "ready" || !frame.dataUrl) return;
    const link = document.createElement("a");
    link.href = frame.dataUrl;
    link.download = `table-${table.code}-qr.png`;
    link.click();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Table QR Codes</h1>
        <p className="text-sm text-slate-500">
          Each QR code encodes an encrypted, table-specific link (not the plain table code), so a scan takes the
          customer straight into ordering at that table - no PIN needed, since the encrypted code itself proves it's the
          physical stand. A PIN is still required if a customer types in a table code manually instead of scanning.
          Download and print for table stands.
        </p>
      </div>

      {!restaurant?.publicUrl && /localhost|127\.0\.0\.1/i.test(window.location.origin) && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You're viewing this on <strong>{window.location.origin}</strong>, so QR codes generated now will encode that
          address - a phone scanning them won't be able to reach it. Set a <strong>Public URL</strong> (your LAN IP or
          real domain) in{" "}
          <a href="/admin/settings" className="underline">
            Restaurant Settings
          </a>{" "}
          first.
        </div>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Customize QR card</h2>
        <form onSubmit={saveQrSettings} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={qrSettings.showLogo}
                onChange={(e) => setQrSettings((prev) => ({ ...prev, showLogo: e.target.checked }))}
              />
              Show logo
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={qrSettings.showName}
                onChange={(e) => setQrSettings((prev) => ({ ...prev, showName: e.target.checked }))}
              />
              Show restaurant name
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={qrSettings.showAddress}
                onChange={(e) => setQrSettings((prev) => ({ ...prev, showAddress: e.target.checked }))}
              />
              Show address
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-700">
              Instruction text
              <Input
                className="mt-1 w-72"
                value={qrSettings.instructionText}
                onChange={(e) => setQrSettings((prev) => ({ ...prev, instructionText: e.target.value }))}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Accent color
              <input
                type="color"
                className="mt-1 block h-9 w-16 cursor-pointer rounded-md border border-slate-300"
                value={qrSettings.accentColor}
                onChange={(e) => setQrSettings((prev) => ({ ...prev, accentColor: e.target.value }))}
              />
            </label>
          </div>
          {message && <p className="text-sm text-green-700">{message}</p>}
          <Button type="submit" className="self-start" disabled={saving}>
            {saving ? "Saving..." : "Save QR settings"}
          </Button>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      {tables.length === 0 && !error && (
        <p className="text-sm text-slate-400">No tables yet. Add one on the Tables page.</p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((table) => {
          const frame = frames[table._id];
          return (
            <Card key={table._id} className="flex flex-col items-center gap-3">
              <div className="flex h-64 w-full items-center justify-center overflow-hidden rounded-md bg-slate-50">
                {frame?.status === "ready" && frame.dataUrl && (
                  <img src={frame.dataUrl} alt={`QR code for table ${table.code}`} className="h-full object-contain" />
                )}
                {frame?.status === "loading" && <span className="text-sm text-slate-400">Generating...</span>}
                {frame?.status === "error" && <span className="text-sm text-red-600">{frame.error}</span>}
              </div>
              <p className="font-semibold text-slate-800">Table {table.code}</p>
              <Button
                variant="secondary"
                className="w-full"
                disabled={frame?.status !== "ready"}
                onClick={() => download(table)}
              >
                Download PNG
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
