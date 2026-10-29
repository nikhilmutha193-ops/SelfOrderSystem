import { Copy, ExternalLink, MonitorPlay, Plus, Settings2, TabletSmartphone } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useCanEdit } from "../../../lib/adminAuth";
import type { KioskPairingCode, KioskSettings } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { confirmDialog } from "../../../shared/ui/confirm";
import { buttonClass } from "../../../shared/ui/styles";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Page,
  PageHeader,
  Switch,
} from "../../../shared/ui/ui";
import { useGatewaySettings } from "../../payments/queries";
import { useCreateKiosk, useKioskDevices, useKioskSettings, useRenewKioskCode, useRevokeKiosk, useSaveKioskSettings } from "../queries";

function PairingBox({ pairing, onClose }: { pairing: KioskPairingCode; onClose: () => void }) {
  const url = `${window.location.origin}/kiosk`;
  return (
    <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm">
      <p className="font-medium text-slate-800">Pair “{pairing.name}”</p>
      <p className="mt-1 text-slate-600">
        On the kiosk screen, open <b>{url}</b> and type this code within 15 minutes (until{" "}
        {new Date(pairing.expiresAt).toLocaleTimeString([], { timeStyle: "short" })}):
      </p>
      <p className="mt-3 text-center font-mono text-3xl font-bold tracking-[0.3em] text-slate-900">{pairing.pairingCode}</p>
      <div className="mt-3 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function DevicesCard({ canEdit }: { canEdit: boolean }) {
  const devices = useKioskDevices();
  const create = useCreateKiosk();
  const renew = useRenewKioskCode();
  const revoke = useRevokeKiosk();
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState<KioskPairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(action: () => Promise<T>, after?: (result: T) => void) {
    setError(null);
    try {
      after?.(await action());
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const list = devices.data ?? [];
  return (
    <Card>
      <CardHeader
        icon={TabletSmartphone}
        title="Kiosks"
        description="Touch screens where guests order and pay by themselves. Each one is paired once with a code."
      />
      {devices.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : list.length === 0 ? (
        <EmptyState icon={TabletSmartphone} title="No kiosks yet" description="Add one below, then pair the screen." />
      ) : (
        <ul>
          {list.map((device) => (
            <li
              key={device._id}
              className="flex flex-col gap-2 border-t border-slate-100 py-3 first:border-t-0 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{device.name}</span>
                  {!device.paired ? (
                    <Badge tone="amber" dot>
                      Waiting to pair
                    </Badge>
                  ) : (
                    <Badge tone={device.online ? "green" : "red"} dot>
                      {device.online ? "Online" : "Offline"}
                    </Badge>
                  )}
                </div>
                {device.paired && !device.online && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {device.lastSeenAt
                      ? `Last seen ${new Date(device.lastSeenAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
                      : "Never connected"}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={renew.isPending}
                    onClick={() => run(() => renew.mutateAsync(device._id), setPairing)}
                  >
                    {device.paired ? "Pair again" : "New code"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="!text-red-600 hover:!bg-red-50"
                    disabled={revoke.isPending}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: `Remove ${device.name}?`,
                        message: "The screen stops taking orders until it is paired again.",
                        confirmLabel: "Remove kiosk",
                      });
                      if (ok) run(() => revoke.mutateAsync(device._id));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => create.mutateAsync(name.trim()),
              (result) => {
                setPairing(result);
                setName("");
              },
            );
          }}
        >
          <Input
            aria-label="Kiosk name"
            placeholder="Kiosk name, e.g. Entrance left"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" icon={Plus} disabled={create.isPending || !name.trim()}>
            Add kiosk
          </Button>
        </form>
      )}
      {pairing && <PairingBox pairing={pairing} onClose={() => setPairing(null)} />}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function SettingsForm({ saved, canEdit }: { saved: KioskSettings; canEdit: boolean }) {
  const save = useSaveKioskSettings();
  const [draft, setDraft] = useState(saved);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<KioskSettings>) => {
    setMessage(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await save.mutateAsync(draft);
          setMessage("Saved");
        } catch {
          // Shown below.
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 px-3 py-2.5">
          <Switch
            id="kiosk-eat-in"
            checked={draft.eatIn}
            disabled={!canEdit}
            onChange={(v) => set({ eatIn: v })}
            label="Eat here"
            description="Guests take a number and eat in."
          />
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2.5">
          <Switch
            id="kiosk-takeaway"
            checked={draft.takeaway}
            disabled={!canEdit}
            onChange={(v) => set({ takeaway: v })}
            label="Take away"
            description="Takeaway prices and packaging apply."
          />
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 px-3 py-2.5">
        <Switch
          id="kiosk-counter"
          checked={draft.payAtCounter}
          disabled={!canEdit}
          onChange={(v) => set({ payAtCounter: v })}
          label="Let guests pay at the counter"
          description="The order waits on the POS Cashier screen and goes to the kitchen once paid there."
        />
      </div>
      <div className="max-w-xs">
        <Field label="Start over after (seconds without a touch)" htmlFor="kiosk-idle" hint="Between 20 and 300.">
          <Input
            id="kiosk-idle"
            type="number"
            inputMode="numeric"
            min={20}
            max={300}
            disabled={!canEdit}
            value={draft.idleSeconds}
            onChange={(e) => set({ idleSeconds: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
      <ErrorText>{save.error ? extractErrorMessage(save.error) : null}</ErrorText>
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" loading={save.isPending} disabled={!dirty}>
            Save kiosk settings
          </Button>
          {message && !dirty && <span className="text-sm font-medium text-emerald-700">{message}</span>}
        </div>
      )}
    </form>
  );
}

export default function KioskAdmin() {
  const canEdit = useCanEdit("kiosks");
  const settings = useKioskSettings();
  const gateway = useGatewaySettings();
  const [copied, setCopied] = useState(false);
  const pickupUrl = `${window.location.origin}/pickup`;
  const paysOnline = !!gateway.data?.enabled;

  return (
    <Page>
      <PageHeader
        title="Kiosks & Pickup Board"
        description="Self-order touch screens, and the TV that shows order numbers when they're ready."
      />

      {gateway.isSuccess && !paysOnline && (
        <Alert tone="info">
          Online payment is off, so kiosks only offer paying at the counter. Turn on Razorpay under{" "}
          <Link to="/admin/settings?section=billing" className="font-semibold underline">
            Settings → Billing
          </Link>{" "}
          to let guests pay by UPI or card on the screen.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <DevicesCard canEdit={canEdit} />

        <Card>
          <CardHeader icon={Settings2} title="Kiosk settings" description="The same for every kiosk." />
          {settings.data ? (
            <SettingsForm key={settings.dataUpdatedAt} saved={settings.data} canEdit={canEdit} />
          ) : (
            <ErrorText>{settings.error ? extractErrorMessage(settings.error) : null}</ErrorText>
          )}
        </Card>

        <Card>
          <CardHeader
            icon={MonitorPlay}
            title="Pickup board"
            description="Open this on a TV near the counter. It shows Preparing and Ready numbers for counter, kiosk and takeaway orders."
          />
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-slate-100 px-2 py-2 text-sm text-slate-700">{pickupUrl}</code>
            <Button
              size="sm"
              variant="secondary"
              icon={Copy}
              onClick={() =>
                void navigator.clipboard?.writeText(pickupUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <a href="/pickup" target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
              <ExternalLink size={14} aria-hidden="true" />
              Open
            </a>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            A number moves to Ready when the kitchen marks the order ready, and leaves the board once it's marked
            served (or after 30 minutes). Tap the speaker on the TV once to turn on the chime.
          </p>
        </Card>

        <Card>
          <CardHeader title="Setting up a kiosk screen" />
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>Use a touch screen running Chrome, standing or wall-mounted.</li>
            <li>
              Start Chrome full screen and locked to the kiosk, for example{" "}
              <code className="rounded bg-slate-100 px-1">chrome --kiosk --kiosk-printing {window.location.origin}/kiosk</code>.{" "}
              <code className="rounded bg-slate-100 px-1">--kiosk-printing</code> prints receipts without a dialog.
            </li>
            <li>Add the kiosk above and type its code on the screen.</li>
            <li>
              Staff options on the screen (auto-print receipts, unpair): tap the top-left corner five times quickly.
            </li>
            <li>Orders are paid before cooking, and the KOT carries the guest's number.</li>
          </ol>
        </Card>
      </div>
    </Page>
  );
}
