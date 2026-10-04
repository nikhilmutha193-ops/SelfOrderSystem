import { useEffect, useMemo, useState } from "react";

import type { PromoBanner } from "../../lib/types";
import { api, extractErrorMessage, uploadImage } from "../../shared/api/client";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import { Badge, Button, Card, ErrorText, Input, PageHeader } from "../../shared/ui/ui";

function ImagePicker({
  label,
  hint,
  url,
  uploading,
  onFile,
  onUrlChange,
}: {
  label: string;
  hint?: string;
  url: string;
  uploading: boolean;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUrlChange: (url: string) => void;
}) {
  return (
    <div>
      <span className="text-sm font-medium text-slate-700">
        {label} {hint && <span className="font-normal text-slate-400">({hint})</span>}
      </span>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {url ? (
          <img src={url} alt="" className="h-20 w-32 rounded-md object-cover" />
        ) : (
          <div className="flex h-20 w-32 items-center justify-center rounded-md bg-slate-100 text-2xl">🖼️</div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onFile}
            disabled={uploading}
            className="text-sm text-slate-600"
          />
          <Input
            className="sm:!w-72"
            placeholder="or paste an image URL"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
          />
        </div>
        {uploading && <span className="text-xs text-slate-400">Uploading...</span>}
      </div>
    </div>
  );
}

export default function Banners() {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [title, setTitle] = useState("");
  const [desktopImageUrl, setDesktopImageUrl] = useState("");
  const [mobileImageUrl, setMobileImageUrl] = useState("");
  const [uploadingDesktop, setUploadingDesktop] = useState(false);
  const [uploadingMobile, setUploadingMobile] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [editing, setEditing] = useState<PromoBanner | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<PromoBanner[]>("/banners")
      .then((res) => setBanners(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  function resetForm() {
    setEditing(null);
    setTitle("");
    setDesktopImageUrl("");
    setMobileImageUrl("");
    setLinkUrl("");
    setSortOrder(0);
  }

  function edit(banner: PromoBanner) {
    setEditing(banner);
    setTitle(banner.title || "");
    setDesktopImageUrl(banner.desktopImageUrl);
    setMobileImageUrl(banner.mobileImageUrl || "");
    setLinkUrl(banner.linkUrl || "");
    setSortOrder(banner.sortOrder);
  }

  async function handleFile(
    e: React.ChangeEvent<HTMLInputElement>,
    setUrl: (url: string) => void,
    setUploading: (v: boolean) => void
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      setUrl(await uploadImage(file, "banner"));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!desktopImageUrl) {
      setError("Add a desktop banner image first");
      return;
    }
    try {
      const payload = { title, desktopImageUrl, mobileImageUrl, linkUrl, sortOrder };
      if (editing) {
        await api.put(`/banners/${editing._id}`, payload);
      } else {
        await api.post("/banners", payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function toggleActive(banner: PromoBanner) {
    try {
      await api.patch(`/banners/${banner._id}/active`, { isActive: !banner.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function remove(banner: PromoBanner) {
    if (!confirm(`Remove banner "${banner.title || "Untitled"}"?`)) return;
    try {
      await api.delete(`/banners/${banner._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "banner-form",
        title: "Add a banner",
        description:
          "A desktop image is required; the mobile image is optional and falls back to the desktop one. Set sort order to pick which shows first when several are active.",
      },
      {
        target: "banner-list",
        title: "All banners",
        description: "Only the first active banner (by sort order) pops up for a given visitor, once a day. Turn one off, edit it, or remove it.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Offer Banners"
        description={
          <>
            A popup ad/offer poster shown over the landing page. If several are active, only the first (by sort
            order) shows to a given visitor, and it won't pop up again for them until the next day.
          </>
        }
      />

      <Card data-tour="banner-form">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Title <span className="font-normal text-slate-400">(optional, for your reference)</span>
              <Input className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Link URL <span className="font-normal text-slate-400">(optional)</span>
              <Input
                className="mt-1.5"
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Sort order
              <Input
                className="mt-1.5"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ImagePicker
              label="Desktop image"
              url={desktopImageUrl}
              uploading={uploadingDesktop}
              onFile={(e) => handleFile(e, setDesktopImageUrl, setUploadingDesktop)}
              onUrlChange={setDesktopImageUrl}
            />
            <ImagePicker
              label="Mobile image"
              hint="optional - uses the desktop image if left blank"
              url={mobileImageUrl}
              uploading={uploadingMobile}
              onFile={(e) => handleFile(e, setMobileImageUrl, setUploadingMobile)}
              onUrlChange={setMobileImageUrl}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit">{editing ? "Update" : "Add banner"}</Button>
            {editing && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-tour="banner-list">
        {banners.map((banner) => (
          <Card key={banner._id} className="flex flex-col gap-3">
            <img
              src={banner.desktopImageUrl}
              alt={banner.title || ""}
              className="h-32 w-full rounded-md object-cover"
            />
            {banner.title && <p className="font-semibold text-slate-800">{banner.title}</p>}
            {banner.mobileImageUrl && <p className="text-xs text-slate-500">Has a separate mobile image</p>}
            {banner.linkUrl && <p className="truncate text-xs text-slate-500">{banner.linkUrl}</p>}
            <div className="flex items-center justify-between">
              <Badge tone={banner.isActive ? "green" : "gray"}>{banner.isActive ? "Active" : "Off"}</Badge>
              <div className="flex gap-2 text-sm">
                <button
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-orange-700 hover:bg-orange-50"
                  onClick={() => edit(banner)}
                >
                  Edit
                </button>
                <button
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100"
                  onClick={() => toggleActive(banner)}
                >
                  {banner.isActive ? "Turn off" : "Turn on"}
                </button>
                <button
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-red-600 hover:bg-red-50"
                  onClick={() => remove(banner)}
                >
                  Remove
                </button>
              </div>
            </div>
          </Card>
        ))}
        {banners.length === 0 && (
          <p className="text-sm text-slate-400 sm:col-span-2 lg:col-span-3">
            No banners yet. Add one above to start running a popup offer.
          </p>
        )}
      </div>
    </div>
  );
}
