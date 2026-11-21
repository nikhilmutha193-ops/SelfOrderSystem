import { Check, Eye, EyeOff, ListTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Category, FoodItem, Subcategory } from "../../lib/types";
import { countDishes, dishCountLabel } from "./dishCounts";
import { api, extractErrorMessage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import {
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
  Select,
  TableWrap,
} from "../../shared/ui/ui";

export default function Subcategories() {
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<Subcategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [foods, setFoods] = useState<FoodItem[] | null>(null);
  const counts = useMemo(() => countDishes(foods ?? []).bySubcategory, [foods]);

  function load() {
    // Only to show how many dishes each subcategory has; a login without Food Items access just sees no counts.
    api
      .get<FoodItem[]>("/food-items")
      .then((res) => setFoods(res.data))
      .catch(() => setFoods(null));
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

  // Allowed only when no dish in it is on; its switched-off dishes go with it.
  async function remove(sub: Subcategory) {
    const hidden = counts.get(sub._id)?.off ?? 0;
    const ok = await confirmDialog({
      title: `Remove ${sub.name}?`,
      message:
        hidden > 0
          ? `Its ${hidden} hidden dish${hidden === 1 ? "" : "es"} ${hidden === 1 ? "is" : "are"} removed with it, for good. Old bills and reports keep them.`
          : "It has no dishes, so only the subcategory is removed.",
      confirmLabel: "Remove subcategory",
    });
    if (!ok) return;
    try {
      await api.delete(`/subcategories/${sub._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function toggleActive(sub: Subcategory) {
    try {
      await api.patch(`/subcategories/${sub._id}/active`, { isActive: !sub.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "subcategory-form",
        title: "Add or edit a subcategory",
        description: "Pick which category it belongs to, then name it - guests see it as a heading inside that category.",
      },
      {
        target: "subcategory-list",
        title: "All subcategories",
        description: "Edit one or hide it - hiding a subcategory hides every dish inside it from the menu.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <Page>
      <PageHeader
        title="Subcategories"
        description="Sections inside a category, like Soups under Starters. Guests see them as headings on the menu."
      />
      <Card data-tour="subcategory-form">
        <CardHeader icon={editing ? Pencil : Plus} title={editing ? `Edit “${editing.name}”` : "Add a subcategory"} />
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
          <Field label="Category" htmlFor="sub-category">
            <Select id="sub-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name" htmlFor="sub-name">
            <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Description" htmlFor="sub-description" className="sm:col-span-2 lg:col-span-1">
            <Input id="sub-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit" icon={editing ? Check : Plus} className="flex-1 lg:flex-none">
              {editing ? "Save" : "Add"}
            </Button>
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
          </div>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card data-tour="subcategory-list">
        <CardHeader title="All subcategories" description={`${subcategories.length} in your menu`} className="mb-3" />
        {subcategories.length === 0 ? (
          <EmptyState
            icon={ListTree}
            title="No subcategories yet"
            description="Add one above to organise a category."
          />
        ) : (
          <TableWrap>
            <table className="min-w-[34rem]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  {foods && <th>Dishes</th>}
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subcategories.map((sub) => (
                  <tr key={sub._id}>
                    <td className="font-medium text-slate-900">{sub.name}</td>
                    <td className="text-slate-600">{categoryName(sub.categoryId)}</td>
                    {foods && <td className="text-slate-600">{dishCountLabel(counts.get(sub._id))}</td>}
                    <td>
                      <Badge tone={sub.isActive ? "green" : "gray"} dot>
                        {sub.isActive ? "Active" : "Hidden"}
                      </Badge>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => edit(sub)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={sub.isActive ? EyeOff : Eye}
                        onClick={() => toggleActive(sub)}
                      >
                        {sub.isActive ? "Hide" : "Show"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        className="!text-red-600 hover:!bg-red-50"
                        disabled={(counts.get(sub._id)?.on ?? 0) > 0}
                        title={
                          (counts.get(sub._id)?.on ?? 0) > 0
                            ? "Switch off or move the dishes that are on first"
                            : "Remove this subcategory"
                        }
                        onClick={() => remove(sub)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </Page>
  );
}
