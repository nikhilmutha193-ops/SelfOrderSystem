import { useEffect, useMemo, useState } from "react";

import type { TeamMember, TeamMemberRole } from "../../lib/types";
import { api, extractErrorMessage, uploadImage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import { Badge, Button, Card, ErrorText, Input, PageHeader, Select, Textarea } from "../../shared/ui/ui";

export default function Team() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [role, setRole] = useState<TeamMemberRole>("chef");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<TeamMember[]>("/team")
      .then((res) => setTeam(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  function resetForm() {
    setEditing(null);
    setRole("chef");
    setName("");
    setTitle("");
    setBio("");
    setPhotoUrl("");
    setSortOrder(0);
  }

  function edit(member: TeamMember) {
    setEditing(member);
    setRole(member.role);
    setName(member.name);
    setTitle(member.title || "");
    setBio(member.bio || "");
    setPhotoUrl(member.photoUrl || "");
    setSortOrder(member.sortOrder);
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadImage(file, "team");
      setPhotoUrl(url);
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
      const payload = { role, name, title, bio, photoUrl, sortOrder };
      if (editing) {
        await api.put(`/team/${editing._id}`, payload);
      } else {
        await api.post("/team", payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function toggleActive(member: TeamMember) {
    try {
      await api.patch(`/team/${member._id}/active`, { isActive: !member.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function remove(member: TeamMember) {
    if (
      !(await confirmDialog({
        title: `Remove ${member.name}?`,
        message: "They disappear from the team section of your landing page.",
        confirmLabel: "Remove",
      }))
    )
      return;
    try {
      await api.delete(`/team/${member._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "team-form",
        title: "Add a profile",
        description: "Owner or chef, name, title, a photo and a short bio.",
      },
      {
        target: "team-list",
        title: "All profiles",
        description: "These show in the \"Meet the team\" section on the landing page. Hide, edit or remove one.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Owner & Chef Profiles"
        description={<>These profiles appear in the "Meet the team" section of your public landing page.</>}
      />

      <Card data-tour="team-form">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Role
              <Select className="mt-1.5" value={role} onChange={(e) => setRole(e.target.value as TeamMemberRole)}>
                <option value="owner">Owner</option>
                <option value="chef">Chef</option>
              </Select>
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Name
              <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="flex flex-col text-sm font-medium text-slate-700">
              Title
              <Input
                className="mt-1.5"
                placeholder="e.g. Head Chef"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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

          <div>
            <span className="text-sm font-medium text-slate-700">Photo</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-slate-100" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handlePhotoFile}
                  disabled={uploading}
                  className="text-sm text-slate-600"
                />
                <Input
                  className="sm:!w-72"
                  placeholder="or paste an image URL"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                />
              </div>
              {uploading && <span className="text-xs text-slate-400">Uploading...</span>}
            </div>
          </div>

          <label className="flex flex-col text-sm font-medium text-slate-700">
            Bio
            <Textarea className="mt-1.5" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button type="submit">{editing ? "Update" : "Add team member"}</Button>
            {editing && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-tour="team-list">
        {team.map((member) => (
          <Card key={member._id} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {member.photoUrl ? (
                <img src={member.photoUrl} alt={member.name} className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-slate-200" />
              )}
              <div>
                <p className="font-semibold text-slate-800">{member.name}</p>
                <p className="text-xs text-slate-500">{member.title || (member.role === "owner" ? "Owner" : "Chef")}</p>
              </div>
            </div>
            {member.bio && <p className="text-sm text-slate-600">{member.bio}</p>}
            <div className="flex items-center justify-between">
              <Badge tone={member.isActive ? "green" : "gray"}>{member.isActive ? "Visible" : "Hidden"}</Badge>
              <div className="flex gap-2 text-sm">
                <button
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-orange-700 hover:bg-orange-50"
                  onClick={() => edit(member)}
                >
                  Edit
                </button>
                <button
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100"
                  onClick={() => toggleActive(member)}
                >
                  {member.isActive ? "Hide" : "Show"}
                </button>
                <button
                  className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-red-600 hover:bg-red-50"
                  onClick={() => remove(member)}
                >
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
