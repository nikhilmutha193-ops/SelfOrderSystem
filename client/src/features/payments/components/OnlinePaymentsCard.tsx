import { Check, Copy, CreditCard } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { GatewayProvider, PaymentGatewaySettings } from "../../../lib/types";
import { extractErrorMessage } from "../../../shared/api/client";
import { Alert, Button, Card, CardHeader, ErrorText, Field, Input, Select, Switch } from "../../../shared/ui/ui";
import { useGatewaySettings, usePaymentsNeedingAttention, useSaveGatewaySettings } from "../queries";

/**
 * Razorpay or Paytm keys and webhook for guests paying from their phone. It sits inside the settings page's
 * form but saves on its own, so it has no <form> of its own (forms can't nest): Enter in its
 * fields saves this card instead of the page.
 */
export function OnlinePaymentsCard({ publicUrl }: { publicUrl: string }) {
  const settings = useGatewaySettings();
  const attention = usePaymentsNeedingAttention(settings.isSuccess);
  return (
    <Card>
      <CardHeader
        icon={CreditCard}
        title="Online payments (Razorpay or Paytm)"
        description="Guests pay from their phone by UPI, card or net banking. Paid orders go to the kitchen by themselves."
      />
      {settings.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : settings.error ? (
        <ErrorText>{extractErrorMessage(settings.error)}</ErrorText>
      ) : (
        <GatewayForm key={settings.dataUpdatedAt} saved={settings.data!} publicUrl={publicUrl} />
      )}
      {(attention.data?.length ?? 0) > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Payments to check</h3>
          <p className="text-xs text-slate-500">Paid online but not settled automatically (last 30 days).</p>
          <ul className="mt-2 flex flex-col gap-2">
            {attention.data!.map((a) => (
              <li key={a._id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span className="font-semibold">₹{(a.amount / 100).toFixed(2)}</span> · {a.paymentId}
                {a.note && <span className="block text-xs">{a.note}</span>}
                <Link to={`/admin/orders/${a.orderId}`} className="text-xs font-semibold underline">
                  Open the order
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function GatewayForm({ saved, publicUrl }: { saved: PaymentGatewaySettings; publicUrl: string }) {
  const save = useSaveGatewaySettings();
  const [enabled, setEnabled] = useState(saved.enabled);
  const [provider, setProvider] = useState<GatewayProvider>(saved.provider);
  const [keyId, setKeyId] = useState(saved.keyId);
  const [paytmMid, setPaytmMid] = useState(saved.paytm.mid);
  const [paytmKey, setPaytmKey] = useState("");
  const [paytmWebsite, setPaytmWebsite] = useState(saved.paytm.website);
  const [paytmEnvironment, setPaytmEnvironment] = useState(saved.paytm.environment);
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const webhookUrl = `${(publicUrl || window.location.origin).replace(/\/+$/, "")}/api/payments/${provider}/webhook`;

  async function submit() {
    setMessage(null);
    try {
      await save.mutateAsync({
        enabled,
        provider,
        paytmMid: paytmMid.trim(),
        paytmWebsite: paytmWebsite.trim(),
        paytmEnvironment,
        ...(paytmKey.trim() && { paytmKey: paytmKey.trim() }),
        keyId: keyId.trim(),
        ...(keySecret.trim() && { keySecret: keySecret.trim() }),
        ...(webhookSecret.trim() && { webhookSecret: webhookSecret.trim() }),
      });
      setMessage(enabled ? "Saved. Guests can pay online." : "Saved");
    } catch {
      // Shown below from the mutation's error.
    }
  }

  function copyWebhookUrl() {
    void navigator.clipboard?.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          void submit();
        }
      }}
    >
      {saved.secretsUnreadable && (
        <Alert tone="warning">
          The saved secrets can't be read any more (the server's secret key changed). Enter them again.
        </Alert>
      )}
      <div className="rounded-lg border border-slate-200 px-3 py-2.5">
        <Switch
          id="online-payments"
          checked={enabled}
          onChange={setEnabled}
          label="Let guests pay online"
          description="Shows a Pay now button on the guest's order page."
        />
      </div>
      <Field label="Payment gateway" htmlFor="gateway-provider" hint="Which account takes the online payments. Both can be saved; only this one is used.">
        <Select id="gateway-provider" value={provider} onChange={(e) => setProvider(e.target.value as GatewayProvider)}>
          <option value="razorpay">Razorpay</option>
          <option value="paytm">Paytm Payment Gateway</option>
        </Select>
      </Field>
      {provider === "paytm" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Merchant ID (MID)" htmlFor="paytm-mid" hint="Paytm Business Dashboard → Developer → API Keys.">
              <Input id="paytm-mid" autoComplete="off" value={paytmMid} onChange={(e) => setPaytmMid(e.target.value)} />
            </Field>
            <Field
              label="Merchant Key"
              htmlFor="paytm-key"
              hint={saved.paytm.hasKey ? "Saved. Leave blank to keep it." : "16 characters, kept encrypted and never shown again."}
            >
              <Input
                id="paytm-key"
                type="password"
                autoComplete="new-password"
                maxLength={16}
                placeholder={saved.paytm.hasKey ? "••••••••••••••••" : ""}
                value={paytmKey}
                onChange={(e) => setPaytmKey(e.target.value)}
              />
            </Field>
            <Field label="Environment" htmlFor="paytm-env" hint="Use Staging with Paytm's test keys first, then Production with the live ones.">
              <Select
                id="paytm-env"
                value={paytmEnvironment}
                onChange={(e) => {
                  const next = e.target.value as "staging" | "production";
                  setPaytmEnvironment(next);
                  if (paytmWebsite === "DEFAULT" || paytmWebsite === "WEBSTAGING") setPaytmWebsite(next === "staging" ? "WEBSTAGING" : "DEFAULT");
                }}
              >
                <option value="production">Production (live payments)</option>
                <option value="staging">Staging (testing)</option>
              </Select>
            </Field>
            <Field label="Website name" htmlFor="paytm-website" hint="DEFAULT on production, WEBSTAGING on staging, unless Paytm gave you another.">
              <Input id="paytm-website" value={paytmWebsite} onChange={(e) => setPaytmWebsite(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Payment status webhook</span>
            <p className="text-xs text-slate-500">
              So payments are recorded even when a guest closes the page: in Paytm Business Dashboard → Developer →
              Webhook, set this URL as the payment status URL. The server never trusts the notice itself: it asks Paytm
              for the real status of that order.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-slate-100 px-2 py-2 text-xs text-slate-700">{webhookUrl}</code>
              <Button type="button" size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copyWebhookUrl}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        </>
      )}
      <div className={provider === "razorpay" ? "grid gap-4 sm:grid-cols-2" : "hidden"}>
        <Field label="Key ID" htmlFor="rzp-key-id" hint="Razorpay Dashboard → Account & Settings → API Keys.">
          <Input
            id="rzp-key-id"
            autoComplete="off"
            placeholder="rzp_live_…"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
          />
        </Field>
        <Field label="Key secret" htmlFor="rzp-key-secret" hint={saved.hasKeySecret ? "Saved. Leave blank to keep it." : undefined}>
          <Input
            id="rzp-key-secret"
            type="password"
            autoComplete="new-password"
            placeholder={saved.hasKeySecret ? "••••••••" : ""}
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
          />
        </Field>
      </div>
      <div className={provider === "razorpay" ? "flex flex-col gap-1.5" : "hidden"}>
        <span className="text-sm font-medium text-slate-700">Webhook</span>
        <p className="text-xs text-slate-500">
          So payments are recorded even when a guest closes the page before it finishes: in Razorpay Dashboard →
          Webhooks, add this URL with the events <b>payment.captured</b> and <b>order.paid</b>, choose a secret, and
          enter the same secret here.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-slate-100 px-2 py-2 text-xs text-slate-700">{webhookUrl}</code>
          <Button type="button" size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copyWebhookUrl}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <Input
          aria-label="Webhook secret"
          type="password"
          autoComplete="new-password"
          placeholder={saved.hasWebhookSecret ? "Webhook secret saved. Leave blank to keep it." : "Webhook secret"}
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
        />
      </div>
      <ErrorText>{save.error ? extractErrorMessage(save.error) : null}</ErrorText>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" loading={save.isPending} onClick={() => void submit()}>
          Save online payments
        </Button>
        {message && <span className="text-sm font-medium text-emerald-700">{message}</span>}
      </div>
    </div>
  );
}
