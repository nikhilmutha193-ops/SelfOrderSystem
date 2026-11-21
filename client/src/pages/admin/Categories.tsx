import { Check, Eye, EyeOff, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StationSelect } from "../../features/printing/components/StationSelect";
import { useStationList } from "../../features/printing/queries";
import type { Category, FoodItem } from "../../lib/types";
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
  TableWrap,
} from "../../shared/ui/ui";

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stationId, setStationId] = useState("");
  const stations = useStationList();
  const stationName = new Map(stations.map((s) => [s._id, s.name]));
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [foods, setFoods] = useState<FoodItem[] | null>(null);
  const counts = useMemo(() => countDishes(foods ?? []).byCategory, [foods]);

  function load() {
    api
      .get<Category[]>("/categories")
      .then((res) => setCategories(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
    // Only to show how many dishes each category has; a login without Food Items access just sees no counts.
    api
      .get<FoodItem[]>("/food-items")
      .then((res) => setFoods(res.data))
      .catch(() => setFoods(null));
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.put(`/categories/${editing._id}`, { name, description, defaultStationId: stationId || null });
      } else {
        await api.post("/categories", { name, description, defaultStationId: stationId || null });
      }
      setName("");
      setDescription("");
      setStationId("");
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
    setStationId(category.defaultStationId ?? "");
  }

  // Allowed only when no dish under it is on; its subcategories and switched-off dishes go with it.
  async function remove(category: Category) {
    const hidden = counts.get(category._id)?.off ?? 0;
    const ok = await confirmDialog({
      title: `Remove ${category.name}?`,
      message: `Its subcategories${hidden > 0 ? ` and its ${hidden} hidden dish${hidden === 1 ? "" : "es"}` : ""} are removed with it, for good. Old bills and reports keep them.`,
      confirmLabel: "Remove category",
    });
    if (!ok) return;
    try {
      await api.delete(`/categories/${category._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function toggleActive(category: Category) {
    try {
      await api.patch(`/categories/${category._id}/active`, { isActive: !category.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "category-form",
        title: "Add or edit a category",
        description:
          "Name it, optionally add a description, and set a default kitchen station so KOTs for dishes in this category print at the right printer.",
      },
      {
        target: "category-list",
        title: "All categories",
        description: "Edit a category or hide it - hiding a category hides every dish inside it from the menu.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <Page>
      <PageHeader
        title="Categories"
        description="The top level of your menu. Turning a category off hides every dish inside it."
      />
      <Card data-tour="category-form">
        <CardHeader
          icon={editing ? Pencil : Plus}
          title={editing ? `Edit “${editing.name}”` : "Add a category"}
          description="Set a kitchen station to route this category's KOTs to the right printer."
        />
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1fr_auto] lg:items-end">
          <Field label="Name" htmlFor="category-name">
            <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Description" htmlFor="category-description">
            <Input id="category-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <StationSelect
            id="category-station"
            label="Kitchen station"
            value={stationId}
            onChange={setStationId}
            emptyLabel="No station"
          />
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
                  setStationId("");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <ErrorText>{error}</ErrorText>

      <Card data-tour="category-list">
        <CardHeader title="All categories" description={`${categories.length} in your menu`} className="mb-3" />
        {categories.length === 0 ? (
          <EmptyState icon={Layers} title="No categories yet" description="Add your first category above." />
        ) : (
          <TableWrap>
            <table className="min-w-[34rem]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  {stations.length > 0 && <th>Station</th>}
                  {foods && <th>Dishes</th>}
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category._id}>
                    <td className="font-medium text-slate-900">{category.name}</td>
                    <td className="text-slate-600">{category.description || "—"}</td>
                    {stations.length > 0 && (
                      <td className="text-slate-600">
                        {category.defaultStationId ? (stationName.get(category.defaultStationId) ?? "—") : "—"}
                      </td>
                    )}
                    {foods && <td className="text-slate-600">{dishCountLabel(counts.get(category._id))}</td>}
                    <td>
                      <Badge tone={category.isActive ? "green" : "gray"} dot>
                        {category.isActive ? "Active" : "Hidden"}
                      </Badge>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => edit(category)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={category.isActive ? EyeOff : Eye}
                        onClick={() => toggleActive(category)}
                      >
                        {category.isActive ? "Hide" : "Show"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        className="!text-red-600 hover:!bg-red-50"
                        disabled={(counts.get(category._id)?.on ?? 0) > 0}
                        title={
                          (counts.get(category._id)?.on ?? 0) > 0
                            ? "Switch off or move the dishes that are on first"
                            : "Remove this category"
                        }
                        onClick={() => remove(category)}
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
