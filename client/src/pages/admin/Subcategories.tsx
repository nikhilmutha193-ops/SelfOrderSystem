import { useEffect, useState } from "react";

import type { Category, Subcategory } from "../../lib/types";
import { api, extractErrorMessage } from "../../shared/api/client";
import { Badge, Button, Card, ErrorText, Input, Select, TableWrap } from "../../shared/ui/ui";

export default function Subcategories() {
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<Subcategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    Promise.all([api.get<Subcategory[]>("/subcategories"), api.get<Category[]>("/categories")])
      .then(([subs, cats]) => {
        setSubcategories(subs.data);
        setCategories(cats.data);
        if (!categoryId && cats.data.length > 0) setCategoryId(cats.data[0]._id);
      })
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  function categoryName(id: string) {
    return categories.find((c) => c._id === id)?.name || "-";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.put(`/subcategories/${editing._id}`, { categoryId, name, description });
      } else {
        await api.post("/subcategories", { categoryId, name, description });
      }
      setName("");
      setDescription("");
      setEditing(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  function edit(sub: Subcategory) {
    setEditing(sub);
    setCategoryId(sub.categoryId);
    setName(sub.name);
    setDescription(sub.description || "");
  }

  async function toggleActive(sub: Subcategory) {
    try {
      await api.patch(`/subcategories/${sub._id}/active`, { isActive: !sub.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Subcategories</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Category
            <Select className="mt-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Name
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Description
            <Input className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <Button type="submit">{editing ? "Update" : "Add subcategory"}</Button>
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
        <TableWrap>
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Category</th>
                <th className="pb-2">Name</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {subcategories.map((sub) => (
                <tr key={sub._id} className="border-t border-slate-100">
                  <td className="py-1.5">{categoryName(sub.categoryId)}</td>
                  <td className="py-1.5">{sub.name}</td>
                  <td className="py-1.5">
                    <Badge tone={sub.isActive ? "green" : "gray"}>{sub.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="flex gap-2 py-1.5">
                    <button className="text-orange-600 hover:underline" onClick={() => edit(sub)}>
                      Edit
                    </button>
                    <button className="text-slate-600 hover:underline" onClick={() => toggleActive(sub)}>
                      {sub.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
