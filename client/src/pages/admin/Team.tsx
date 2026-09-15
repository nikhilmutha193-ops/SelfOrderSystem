import { useEffect, useState } from "react";
import { api, extractErrorMessage, uploadImage } from "../../lib/apiClient";
import { Badge, Button, Card, ErrorText, Input, Select, Textarea } from "../../components/ui";
import type { TeamMember, TeamMemberRole } from "../../lib/types";

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
      const url = await uploadImage(file);
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
    if (!confirm(`Remove "${member.name}" from the team?`)) return;
    try {
      await api.delete(`/team/${member._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Owner &amp; Chef Profiles</h1>
      <p className="text-sm text-slate-500">
        These profiles appear in the "Meet the team" section of your public landing page.
      </p>

      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-700">
              Role
              <Select className="mt-1" value={role} onChange={(e) => setRole(e.target.value as TeamMemberRole)}>
                <option value="owner">Owner</option>
                <option value="chef">Chef</option>
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Name
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Title
              <Input
                className="mt-1"
                placeholder="e.g. Head Chef"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
            <span className="text-sm font-medium text-slate-700">Photo</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-slate-100" />
              )}
              <div className="flex flex-col gap-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handlePhotoFile}
                  disabled={uploading}
                  className="text-sm text-slate-600"
                />
                <Input
                  className="w-64"
                  placeholder="or paste an image URL"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                />
              </div>
              {uploading && <span className="text-xs text-slate-400">Uploading...</span>}
            </div>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Bio
            <Textarea className="mt-1" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <button className="text-orange-600 hover:underline" onClick={() => edit(member)}>
                  Edit
                </button>
                <button className="text-slate-600 hover:underline" onClick={() => toggleActive(member)}>
                  {member.isActive ? "Hide" : "Show"}
                </button>
                <button className="text-red-600 hover:underline" onClick={() => remove(member)}>
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
