import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import MaintenanceView from "../../features/maintenance/MaintenanceView";
import { useAdmin } from "../../lib/adminAuth";
import { api, extractErrorMessage, uploadImage } from "../../shared/api/client";
import { Alert, Badge, Button, Card, EmptyState, ErrorText, Field, Input, PageHeader, Switch, Textarea } from "../../shared/ui/ui";

interface Settings {
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  title: string;
  message: string;
  imageUrl: string;
  active: boolean;
}

const DEFAULTS: Settings = {
  enabled: false,
  startAt: null,
  endAt: null,
  title: "We'll be back soon",
  message: "We are doing some maintenance on our website. Please check back shortly.",
  imageUrl: "",
  active: false,
};

/** An ISO time as the "YYYY-MM-DDTHH:mm" a datetime-local field wants, in the browser's own time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fromLocalInput = (value: string): string | null => (value ? new Date(value).toISOString() : null);

function statusOf(s: Settings): { tone: "green" | "gray" | "amber"; label: string } {
  if (!s.enabled) return { tone: "gray", label: "Off" };
  const now = Date.now();
  if (s.startAt && now < new Date(s.startAt).getTime()) return { tone: "amber", label: "Scheduled" };
  if (s.endAt && now >= new Date(s.endAt).getTime()) return { tone: "gray", label: "Ended" };
  return { tone: "green", label: "Showing now" };
}

export default function Maintenance() {
  const { profile } = useAdmin();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [restaurant, setRestaurant] = useState({ name: "", logoUrl: "" });

  useEffect(() => {
    if (!profile?.isOwner) return;
    api
      .get<Settings>("/maintenance/settings")
      .then((res) => setForm(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoaded(true));
    api
      .get<{ restaurantName: string; logoUrl: string }>("/maintenance")
      .then((res) => setRestaurant({ name: res.data.restaurantName, logoUrl: res.data.logoUrl }))
      .catch(() => undefined);
  }, [profile?.isOwner]);

  if (!profile?.isOwner) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <EmptyState title="Owner only" description="Only the owner account can manage maintenance mode." />
      </div>
    );
  }

  const update = (patch: Partial<Settings>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      update({ imageUrl: await uploadImage(file, "banner") });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await api.put<Settings>("/maintenance/settings", {
        enabled: form.enabled,
        startAt: form.startAt,
        endAt: form.endAt,
        title: form.title,
        message: form.message,
        imageUrl: form.imageUrl,
      });
      setForm(res.data);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const status = statusOf(form);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Maintenance Mode"
        description="Show an under-maintenance page, with a picture and the start and end time, in place of the website, guest ordering, kiosk and kitchen screens. Admin pages, the POS and the captain app keep working."
      />

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-slate-900">Status</h2>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>
        <Switch
          checked={form.enabled}
          onChange={(enabled) => update({ enabled })}
          label="Maintenance mode"
          description="With no start or end time it begins when you save and lasts until you switch it off. With times set, it only applies between them."
          disabled={!loaded}
        />
        {form.enabled && status.label === "Showing now" && (
          <Alert tone="warning" className="mt-3">
            Customers cannot use the website or order from tables while this is on. Saving applies it within a few
            seconds.
          </Alert>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Window</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Starts" hint="Leave empty to start as soon as you save." htmlFor="m-start">
            <Input
              id="m-start"
              type="datetime-local"
              value={toLocalInput(form.startAt)}
              onChange={(e) => update({ startAt: fromLocalInput(e.target.value) })}
            />
          </Field>
          <Field label="Ends" hint="Leave empty to stay on until you switch it off." htmlFor="m-end">
            <Input
              id="m-end"
              type="datetime-local"
              value={toLocalInput(form.endAt)}
              onChange={(e) => update({ endAt: fromLocalInput(e.target.value) })}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">Times are in this device's time zone.</p>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">What visitors see</h2>
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="m-title">
            <Input id="m-title" maxLength={100} value={form.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="Message" htmlFor="m-message">
            <Textarea
              id="m-message"
              rows={3}
              maxLength={1000}
              value={form.message}
              onChange={(e) => update({ message: e.target.value })}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Picture</span>
            <div className="flex flex-wrap items-center gap-3">
              {form.imageUrl && <img src={form.imageUrl} alt="" className="h-20 w-32 rounded-lg object-cover ring-1 ring-slate-200" />}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                {uploading ? "Uploading..." : form.imageUrl ? "Change picture" : "Upload picture"}
                <input type="file" accept="image/*" className="hidden" onChange={pickImage} disabled={uploading} />
              </label>
              {form.imageUrl && (
                <Button variant="secondary" icon={Trash2} onClick={() => update({ imageUrl: "" })}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Preview</h2>
        <MaintenanceView
          preview
          content={{
            title: form.title,
            message: form.message,
            imageUrl: form.imageUrl,
            startAt: form.startAt,
            endAt: form.endAt,
            restaurantName: restaurant.name,
            logoUrl: restaurant.logoUrl,
          }}
        />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={saving} disabled={!loaded || uploading}>
          Save
        </Button>
        {saved && <span className="text-sm font-medium text-emerald-700">Saved</span>}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
