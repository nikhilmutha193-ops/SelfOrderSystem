import { useEffect, useState } from "react";
import { api, extractErrorMessage } from "../../lib/apiClient";
import { Badge, Button, Card, ErrorText, Input } from "../../components/ui";
import type { Category } from "../../lib/types";

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<Category[]>("/categories")
      .then((res) => setCategories(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.put(`/categories/${editing._id}`, { name, description });
      } else {
        await api.post("/categories", { name, description });
      }
      setName("");
      setDescription("");
      setEditing(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  function edit(category: Category) {
    setEditing(category);
    setName(category.name);
    setDescription(category.description || "");
  }

  async function toggleActive(category: Category) {
    try {
      await api.patch(`/categories/${category._id}/active`, { isActive: !category.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Categories</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Name
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Description
            <Input className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <Button type="submit">{editing ? "Update" : "Add category"}</Button>
          {editing && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setName("");
                setDescription("");
              }}
            >
              Cancel
            </Button>
          )}
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Name</th>
              <th className="pb-2">Description</th>
              <th className="pb-2">Status</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category._id} className="border-t border-slate-100">
                <td className="py-1.5">{category.name}</td>
                <td className="py-1.5">{category.description}</td>
                <td className="py-1.5">
                  <Badge tone={category.isActive ? "green" : "gray"}>{category.isActive ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="flex gap-2 py-1.5">
                  <button className="text-orange-600 hover:underline" onClick={() => edit(category)}>
                    Edit
                  </button>
                  <button className="text-slate-600 hover:underline" onClick={() => toggleActive(category)}>
                    {category.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
