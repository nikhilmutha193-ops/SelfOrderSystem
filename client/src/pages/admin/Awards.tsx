import { useEffect, useState } from "react";

import type { Award } from "../../lib/types";
import { api, extractErrorMessage, uploadImage } from "../../shared/api/client";
import { Badge, Button, Card, ErrorText, Input, Textarea } from "../../shared/ui/ui";

export default function Awards() {
  const [awards, setAwards] = useState<Award[]>([]);
  const [title, setTitle] = useState("");
  const [issuer, setIssuer] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [editing, setEditing] = useState<Award | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<Award[]>("/awards")
      .then((res) => setAwards(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  function resetForm() {
    setEditing(null);
    setTitle("");
    setIssuer("");
    setYear("");
    setImageUrl("");
    setDescription("");
    setSortOrder(0);
  }

  function edit(award: Award) {
    setEditing(award);
    setTitle(award.title);
    setIssuer(award.issuer || "");
    setYear(award.year ?? "");
    setImageUrl(award.imageUrl || "");
    setDescription(award.description || "");
    setSortOrder(award.sortOrder);
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadImage(file, "awards");
      setImageUrl(url);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        title,
        issuer,
        year: year === "" ? undefined : year,
        imageUrl,
        description,
        sortOrder,
      };
      if (editing) {
        await api.put(`/awards/${editing._id}`, payload);
      } else {
        await api.post("/awards", payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function toggleActive(award: Award) {
    try {
      await api.patch(`/awards/${award._id}/active`, { isActive: !award.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function remove(award: Award) {
    if (!confirm(`Remove award "${award.title}"?`)) return;
    try {
      await api.delete(`/awards/${award._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Awards &amp; Recognition</h1>
      <p className="text-sm text-slate-500">
        These appear in the "Awards & Recognition" section of your public landing page.
      </p>

      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-700">
              Title
              <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Issued by
              <Input className="mt-1" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Year
              <Input
                className="mt-1 w-24"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Sort order
              <Input
                className="mt-1 w-24"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </label>
          </div>

          <div>
            <span className="text-sm font-medium text-slate-700">Badge image / logo</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-slate-100 text-2xl">🏆</div>
              )}
              <div className="flex flex-col gap-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImageFile}
                  disabled={uploading}
                  className="text-sm text-slate-600"
                />
                <Input
                  className="w-64"
                  placeholder="or paste an image URL"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>
              {uploading && <span className="text-xs text-slate-400">Uploading...</span>}
            </div>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Description
            <Textarea className="mt-1" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button type="submit">{editing ? "Update" : "Add award"}</Button>
            {editing && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {awards.map((award) => (
          <Card key={award._id} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {award.imageUrl ? (
                <img src={award.imageUrl} alt={award.title} className="h-14 w-14 rounded-md object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-md bg-slate-200" />
              )}
              <div>
                <p className="font-semibold text-slate-800">{award.title}</p>
                <p className="text-xs text-slate-500">{[award.issuer, award.year].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            {award.description && <p className="text-sm text-slate-600">{award.description}</p>}
            <div className="flex items-center justify-between">
              <Badge tone={award.isActive ? "green" : "gray"}>{award.isActive ? "Visible" : "Hidden"}</Badge>
              <div className="flex gap-2 text-sm">
                <button className="text-orange-600 hover:underline" onClick={() => edit(award)}>
                  Edit
                </button>
                <button className="text-slate-600 hover:underline" onClick={() => toggleActive(award)}>
                  {award.isActive ? "Hide" : "Show"}
                </button>
                <button className="text-red-600 hover:underline" onClick={() => remove(award)}>
                  Remove
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
