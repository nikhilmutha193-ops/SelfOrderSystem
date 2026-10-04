import { Eye, EyeOff, ImagePlus, Pencil, Plus, Sparkles, Star, Trash2, UtensilsCrossed, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAreas } from "../../features/pricing/queries";
import { StationSelect } from "../../features/printing/components/StationSelect";
import type { Category, FoodItem, FoodType, ModifierGroup, Subcategory, Translations } from "../../lib/types";
import { api, extractErrorMessage, uploadImage } from "../../shared/api/client";
import { Dialog } from "../../shared/ui/Dialog";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  Input,
  Page,
  PageHeader,
  SearchInput,
  Select,
  Switch,
  TableWrap,
  Textarea,
} from "../../shared/ui/ui";

const EMOJI_CHOICES = ["⭐", "🔥", "👑", "💯", "🏆", "❤️"];
const EMPTY_TR = {
  kn: { name: "", description: "" },
  hi: { name: "", description: "" },
};

export default function FoodItems() {
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isBestseller, setIsBestseller] = useState(false);
  const [bestsellerEmoji, setBestsellerEmoji] = useState("⭐");
  const [isTodaySpecial, setIsTodaySpecial] = useState(false);
  const [foodType, setFoodType] = useState<FoodType>("veg");
  const [rating, setRating] = useState<number>(0);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<number>(10);
  const [stationId, setStationId] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [pairsWith, setPairsWith] = useState<string[]>([]);
  const [takeawayPrice, setTakeawayPrice] = useState("");
  const [deliveryPrice, setDeliveryPrice] = useState("");
  const [packaging, setPackaging] = useState("");
  const [areaPrices, setAreaPrices] = useState<Record<string, string>>({});
  const [isCombo, setIsCombo] = useState(false);
  const [comboItems, setComboItems] = useState<{ foodItemId: string; quantity: number }[]>([]);
  const { areas } = useAreas();
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [tr, setTr] = useState<{
    kn: { name: string; description: string };
    hi: { name: string; description: string };
  }>(() => structuredClone(EMPTY_TR));
  const [translating, setTranslating] = useState(false);

  async function autoTranslate() {
    if (!name.trim() && !description.trim()) {
      setError("Enter the English name/description first.");
      return;
    }
    setError(null);
    setTranslating(true);
    try {
      const next = {
        kn: { name: "", description: "" },
        hi: { name: "", description: "" },
      };
      for (const lng of ["kn", "hi"] as const) {
        const res = await api.post<{ translations: string[] }>("/translate", {
          texts: [name, description || ""],
          to: lng,
        });
        next[lng] = {
          name: res.data.translations[0] || "",
          description: res.data.translations[1] || "",
        };
      }
      setTr(next);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setTranslating(false);
    }
  }
  const [editing, setEditing] = useState<FoodItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "hidden">("");
  const [saving, setSaving] = useState(false);

  // ---- modifier group editing helpers ----
  function addGroup() {
    setModifierGroups((g) => [
      ...g,
      {
        name: "",
        type: "single",
        required: false,
        options: [{ label: "", priceDelta: 0 }],
      },
    ]);
  }
  function updateGroup(i: number, patch: Partial<ModifierGroup>) {
    setModifierGroups((g) => g.map((grp, idx) => (idx === i ? { ...grp, ...patch } : grp)));
  }
  function removeGroup(i: number) {
    setModifierGroups((g) => g.filter((_, idx) => idx !== i));
  }
  function addOption(gi: number) {
    setModifierGroups((g) =>
      g.map((grp, idx) => (idx === gi ? { ...grp, options: [...grp.options, { label: "", priceDelta: 0 }] } : grp))
    );
  }
  function updateOption(gi: number, oi: number, patch: Partial<{ label: string; priceDelta: number }>) {
    setModifierGroups((g) =>
      g.map((grp, idx) =>
        idx === gi
          ? {
              ...grp,
              options: grp.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)),
            }
          : grp
      )
    );
  }
  function removeOption(gi: number, oi: number) {
    setModifierGroups((g) =>
      g.map((grp, idx) => (idx === gi ? { ...grp, options: grp.options.filter((_, j) => j !== oi) } : grp))
    );
  }

  function load() {
    Promise.all([
      api.get<FoodItem[]>("/food-items"),
      api.get<Category[]>("/categories"),
      api.get<Subcategory[]>("/subcategories"),
    ])
      .then(([foods, cats, subs]) => {
        setFoodItems(foods.data);
        setCategories(cats.data);
        setSubcategories(subs.data);
        if (!categoryId && cats.data.length > 0) setCategoryId(cats.data[0]._id);
      })
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  const subcategoriesForCategory = useMemo(
    () => subcategories.filter((s) => s.categoryId === categoryId),
    [subcategories, categoryId]
  );

  useEffect(() => {
    if (subcategoriesForCategory.length > 0 && !subcategoriesForCategory.some((s) => s._id === subcategoryId)) {
      setSubcategoryId(subcategoriesForCategory[0]._id);
    }
  }, [subcategoriesForCategory, subcategoryId]);

  function categoryName(id: string) {
    return categories.find((c) => c._id === id)?.name || "-";
  }
  function subcategoryName(id: string) {
    return subcategories.find((s) => s._id === id)?.name || "-";
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadImage(file, "product");
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
    const translations: Translations = {};
    for (const lang of ["kn", "hi"] as const) {
      const entry: { name?: string; description?: string } = {};
      if (tr[lang].name.trim()) entry.name = tr[lang].name.trim();
      if (tr[lang].description.trim()) entry.description = tr[lang].description.trim();
      if (entry.name || entry.description) translations[lang] = entry;
    }
    const cleanGroups = modifierGroups
      .filter((g) => g.name.trim())
      .map((g) => ({
        ...g,
        name: g.name.trim(),
        options: g.options
          .filter((o) => o.label.trim())
          .map((o) => ({
            label: o.label.trim(),
            priceDelta: Number(o.priceDelta) || 0,
          })),
      }));
    const payload = {
      categoryId,
      subcategoryId,
      name,
      price,
      description,
      imageUrl,
      isBestseller,
      bestsellerEmoji,
      isTodaySpecial,
      foodType,
      rating,
      prepTimeMinutes,
      stationId: stationId || null,
      shortCode: shortCode.trim(),
      pairsWith,
      priceRules: {
        takeaway: takeawayPrice.trim() === "" ? null : Number(takeawayPrice),
        delivery: deliveryPrice.trim() === "" ? null : Number(deliveryPrice),
        areas: Object.entries(areaPrices)
          .filter(([, value]) => value.trim() !== "")
          .map(([areaId, value]) => ({ areaId, price: Number(value) })),
      },
      packagingCharge: packaging.trim() === "" ? 0 : Number(packaging),
      comboItems: isCombo ? comboItems.filter((c) => c.foodItemId) : [],
      modifierGroups: cleanGroups,
      translations,
    };
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/food-items/${editing._id}`, payload);
      } else {
        await api.post("/food-items", payload);
      }
      setName("");
      setPrice(0);
      setDescription("");
      setImageUrl("");
      setIsBestseller(false);
      setBestsellerEmoji("⭐");
      setIsTodaySpecial(false);
      setFoodType("veg");
      setRating(0);
      setPrepTimeMinutes(10);
      setStationId("");
      setShortCode("");
      setPairsWith([]);
      setTakeawayPrice("");
      setDeliveryPrice("");
      setPackaging("");
      setAreaPrices({});
      setComboItems([]);
      setIsCombo(false);
      setModifierGroups([]);
      setTr(structuredClone(EMPTY_TR));
      setEditing(null);
      setFormOpen(false);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setEditing(null);
    setName("");
    setPrice(0);
    setDescription("");
    setImageUrl("");
    setIsBestseller(false);
    setBestsellerEmoji("⭐");
    setIsTodaySpecial(false);
    setFoodType("veg");
    setRating(0);
    setPrepTimeMinutes(10);
    setStationId("");
    setShortCode("");
    setPairsWith([]);
    setTakeawayPrice("");
    setDeliveryPrice("");
    setPackaging("");
    setAreaPrices({});
    setComboItems([]);
    setIsCombo(false);
    setModifierGroups([]);
    setTr(structuredClone(EMPTY_TR));
  }

  function startNew() {
    resetForm();
    setError(null);
    if (filterCategory) setCategoryId(filterCategory);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setError(null);
    resetForm();
  }

  function edit(food: FoodItem) {
    setError(null);
    setFormOpen(true);
    setEditing(food);
    setCategoryId(food.categoryId);
    setSubcategoryId(food.subcategoryId);
    setName(food.name);
    setPrice(food.price);
    setDescription(food.description || "");
    setImageUrl(food.imageUrl || "");
    setIsBestseller(food.isBestseller);
    setBestsellerEmoji(food.bestsellerEmoji || "⭐");
    setIsTodaySpecial(food.isTodaySpecial ?? false);
    setFoodType(food.foodType || "veg");
    setRating(food.rating || 0);
    setPrepTimeMinutes(food.prepTimeMinutes ?? 10);
    setStationId(food.stationId ?? "");
    setShortCode(food.shortCode ?? "");
    setPairsWith(food.pairsWith ?? []);
    setTakeawayPrice(food.priceRules?.takeaway != null ? String(food.priceRules.takeaway) : "");
    setDeliveryPrice(food.priceRules?.delivery != null ? String(food.priceRules.delivery) : "");
    setPackaging(food.packagingCharge ? String(food.packagingCharge) : "");
    setAreaPrices(Object.fromEntries((food.priceRules?.areas ?? []).map((a) => [a.areaId, String(a.price)])));
    setComboItems((food.comboItems ?? []).map((c) => ({ ...c })));
    setIsCombo((food.comboItems ?? []).length > 0);
    setModifierGroups(
      (food.modifierGroups ?? []).map((g) => ({
        ...g,
        options: g.options.map((o) => ({ ...o })),
      }))
    );
    setTr({
      kn: {
        name: food.translations?.kn?.name || "",
        description: food.translations?.kn?.description || "",
      },
      hi: {
        name: food.translations?.hi?.name || "",
        description: food.translations?.hi?.description || "",
      },
    });
  }

  async function toggleActive(food: FoodItem) {
    try {
      await api.patch(`/food-items/${food._id}/active`, {
        isActive: !food.isActive,
      });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const q = query.trim().toLowerCase();
  const visibleFoods = foodItems.filter(
    (f) =>
      (!filterCategory || f.categoryId === filterCategory) &&
      (!filterStatus || (filterStatus === "active" ? f.isActive : !f.isActive)) &&
      (!q || f.name.toLowerCase().includes(q) || (f.shortCode ?? "").toLowerCase().startsWith(q))
  );

  function reviewText(food: FoodItem) {
    if (!food.reviewCount) return null;
    return (food.reviewSum! / food.reviewCount).toFixed(1);
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "food-add",
        title: "Add a dish",
        description: "Opens a form for the dish's name, price, photo, kitchen routing, customization options and translations.",
      },
      {
        target: "food-search",
        title: "Search",
        description: "Search by dish name or its POS short code.",
      },
      {
        target: "food-filter-category",
        title: "Filter by category",
        description: "Narrow the list to one category.",
      },
      {
        target: "food-filter-status",
        title: "Filter by status",
        description: "Show only dishes that are on the menu, or only the hidden ones.",
      },
      {
        target: "food-list",
        title: "Your dishes",
        description: "Edit a dish or hide it from the guest menu. Bestseller and Today's Special badges show here too.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <Page>
      <PageHeader
        title="Food Items"
        description="Every dish on your menu, with prices, photos, options and kitchen routing."
        actions={
          <Button data-tour="food-add" icon={Plus} onClick={startNew}>
            Add dish
          </Button>
        }
      />

      {!formOpen && <ErrorText>{error}</ErrorText>}

      <Card data-tour="food-list">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto_auto]">
          <SearchInput
            data-tour="food-search"
            className="col-span-2 sm:col-span-1"
            placeholder="Search by name or short code"
            aria-label="Search dishes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            data-tour="food-filter-category"
            aria-label="Filter by category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            data-tour="food-filter-status"
            aria-label="Filter by status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "" | "active" | "hidden")}
          >
            <option value="">Any status</option>
            <option value="active">On the menu</option>
            <option value="hidden">Hidden</option>
          </Select>
        </div>
        <p className="mb-3 text-xs font-medium text-slate-500">
          Showing {visibleFoods.length} of {foodItems.length} dishes
        </p>

        {visibleFoods.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title={foodItems.length === 0 ? "No dishes yet" : "No dishes match"}
            description={
              foodItems.length === 0 ? "Add your first dish to build the menu." : "Try a different search or filter."
            }
            action={
              foodItems.length === 0 && (
                <Button icon={Plus} onClick={startNew}>
                  Add dish
                </Button>
              )
            }
          />
        ) : (
          <>
            <ul className="-mx-4 divide-y divide-slate-100 border-t border-slate-100 md:hidden">
              {visibleFoods.map((food) => (
                <li key={food._id} className="flex items-center gap-3 px-4 py-3">
                  <Thumb food={food} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium text-slate-900">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${typeDot[food.foodType || "veg"]}`} />
                      <span className="truncate">{food.name}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {categoryName(food.categoryId)} · {subcategoryName(food.subcategoryId)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">
                        ₹{food.price.toFixed(2)}
                      </span>
                      {!food.isActive && <Badge tone="gray">Hidden</Badge>}
                      {food.shortCode && <Badge tone="violet">{food.shortCode}</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <IconButton icon={Pencil} label={`Edit ${food.name}`} onClick={() => edit(food)} />
                    <IconButton
                      icon={food.isActive ? EyeOff : Eye}
                      label={food.isActive ? `Hide ${food.name}` : `Show ${food.name}`}
                      onClick={() => toggleActive(food)}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden md:block">
              <TableWrap>
                <table className="min-w-[48rem]">
                  <thead>
                    <tr>
                      <th>Dish</th>
                      <th>Category</th>
                      <th className="text-right">Price</th>
                      <th>Prep</th>
                      <th>Rating</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFoods.map((food) => (
                      <tr key={food._id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Thumb food={food} size="sm" />
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-medium text-slate-900">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${typeDot[food.foodType || "veg"]}`} />
                                {food.name}
                              </p>
                              {food.shortCode && <p className="font-mono text-xs text-slate-500">{food.shortCode}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="text-slate-600">
                          {categoryName(food.categoryId)}
                          <span className="block text-xs text-slate-400">{subcategoryName(food.subcategoryId)}</span>
                        </td>
                        <td className="text-right font-medium text-slate-900 tabular-nums">₹{food.price.toFixed(2)}</td>
                        <td className="whitespace-nowrap text-slate-600">{food.prepTimeMinutes ?? 10} min</td>
                        <td className="whitespace-nowrap">
                          {reviewText(food) ? (
                            <span className="inline-flex items-center gap-1 text-slate-700">
                              <Star size={14} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                              {reviewText(food)} <span className="text-slate-400">({food.reviewCount})</span>
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge tone={food.isActive ? "green" : "gray"} dot>
                              {food.isActive ? "On menu" : "Hidden"}
                            </Badge>
                            {food.isBestseller && <Badge tone="amber">Bestseller</Badge>}
                            {food.isTodaySpecial && <Badge tone="orange">Today's Special</Badge>}
                          </div>
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => edit(food)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={food.isActive ? EyeOff : Eye}
                            onClick={() => toggleActive(food)}
                          >
                            {food.isActive ? "Hide" : "Show"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </>
        )}
      </Card>

      <Dialog
        open={formOpen}
        onClose={closeForm}
        size="xl"
        title={editing ? `Edit ${editing.name}` : "Add a dish"}
        description="Prices are recalculated on the server, so guests always pay what you set here."
        onSubmit={submit}
        dismissible={!saving}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Save changes" : "Add dish"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <ErrorText>{error}</ErrorText>

          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="food-name" className="sm:col-span-2">
              <Input id="food-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Category" htmlFor="food-category">
              <Select id="food-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subcategory" htmlFor="food-subcategory">
              <Select
                id="food-subcategory"
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                required
              >
                {subcategoriesForCategory.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Price (₹)" htmlFor="food-price">
              <Input
                id="food-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                required
              />
            </Field>
            <Field label="Food type" htmlFor="food-type">
              <Select id="food-type" value={foodType} onChange={(e) => setFoodType(e.target.value as FoodType)}>
                <option value="veg">Veg</option>
                <option value="non-veg">Non-veg</option>
                <option value="egg">Contains egg</option>
              </Select>
            </Field>
            <Field label="Description" htmlFor="food-description" className="sm:col-span-2">
              <Textarea
                id="food-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Prices &amp; packaging</h3>
              <p className="text-xs text-slate-500">Leave a price empty to use the normal price above.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Takeaway price (₹)" htmlFor="food-takeaway-price">
                <Input
                  id="food-takeaway-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder={String(price)}
                  value={takeawayPrice}
                  onChange={(e) => setTakeawayPrice(e.target.value)}
                />
              </Field>
              <Field label="Delivery price (₹)" htmlFor="food-delivery-price">
                <Input
                  id="food-delivery-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder={String(price)}
                  value={deliveryPrice}
                  onChange={(e) => setDeliveryPrice(e.target.value)}
                />
              </Field>
              <Field label="Packaging (₹ per plate)" htmlFor="food-packaging" hint="Takeaway and delivery only.">
                <Input
                  id="food-packaging"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={packaging}
                  onChange={(e) => setPackaging(e.target.value)}
                />
              </Field>
              {areas.map((area) => (
                <Field key={area._id} label={`${area.name} price (₹)`} htmlFor={`food-area-${area._id}`}>
                  <Input
                    id={`food-area-${area._id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder={String(price)}
                    value={areaPrices[area._id] ?? ""}
                    onChange={(e) =>
                      setAreaPrices((p) => ({
                        ...p,
                        [area._id]: e.target.value,
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
            <Switch
              id="food-combo"
              checked={isCombo}
              onChange={(value) => {
                setIsCombo(value);
                if (value && comboItems.length === 0) setComboItems([{ foodItemId: "", quantity: 1 }]);
              }}
              label="This dish is a combo"
              description="The kitchen ticket lists every dish inside it, and stock is used from their recipes."
            />
            {isCombo && (
              <div className="flex flex-col gap-2">
                {comboItems.map((part, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select
                      aria-label={`Combo dish ${index + 1}`}
                      value={part.foodItemId}
                      onChange={(e) =>
                        setComboItems((items) =>
                          items.map((c, i) => (i === index ? { ...c, foodItemId: e.target.value } : c))
                        )
                      }
                    >
                      <option value="">Choose a dish</option>
                      {foodItems
                        .filter(
                          (f) =>
                            f._id !== editing?._id &&
                            (f.comboItems ?? []).length === 0 &&
                            (f._id === part.foodItemId || !comboItems.some((c) => c.foodItemId === f._id))
                        )
                        .map((f) => (
                          <option key={f._id} value={f._id}>
                            {f.name}
                          </option>
                        ))}
                    </Select>
                    <Input
                      aria-label={`Quantity of combo dish ${index + 1}`}
                      className="!w-20"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      value={part.quantity}
                      onChange={(e) =>
                        setComboItems((items) =>
                          items.map((c, i) => (i === index ? { ...c, quantity: Number(e.target.value) || 1 } : c))
                        )
                      }
                    />
                    <IconButton
                      icon={X}
                      label={`Remove combo dish ${index + 1}`}
                      onClick={() => setComboItems((items) => items.filter((_, i) => i !== index))}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={Plus}
                  className="self-start"
                  onClick={() => setComboItems((items) => [...items, { foodItemId: "", quantity: 1 }])}
                >
                  Add a dish to the combo
                </Button>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Photo</h3>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {imageUrl ? (
                <div className="relative h-24 w-24 shrink-0">
                  <img src={imageUrl} alt="" className="h-24 w-24 rounded-xl object-cover ring-1 ring-slate-200" />
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    aria-label="Remove photo"
                    className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-200"
                    style={{ minHeight: "1.75rem" }}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <label className="flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-orange-400 hover:text-orange-600">
                  <ImagePlus size={20} aria-hidden="true" />
                  {uploading ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleImageFile}
                    disabled={uploading}
                    className="sr-only"
                  />
                </label>
              )}
              <Field label="Or paste an image URL" htmlFor="food-image-url" className="flex-1">
                <Input
                  id="food-image-url"
                  placeholder="https://…"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Prep time (minutes)"
              htmlFor="food-prep"
              hint="The slowest dish in a round sets the guest's estimate."
            >
              <Input
                id="food-prep"
                type="number"
                inputMode="numeric"
                min={0}
                value={prepTimeMinutes}
                onChange={(e) => setPrepTimeMinutes(Number(e.target.value))}
              />
            </Field>
            <Field label="Short code" htmlFor="food-short-code" hint="Type it in POS search to add this dish fast.">
              <Input
                id="food-short-code"
                className="uppercase"
                placeholder="e.g. MD"
                maxLength={6}
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
            </Field>
            <Field label='Rating (0 shows as "New")' htmlFor="food-rating">
              <Input
                id="food-rating"
                type="number"
                inputMode="decimal"
                min={0}
                max={5}
                step="0.1"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
              />
            </Field>
            <StationSelect
              id="food-station"
              label="Kitchen station"
              value={stationId}
              onChange={setStationId}
              emptyLabel="Same as category"
            />
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
            <Switch
              id="food-bestseller"
              checked={isBestseller}
              onChange={setIsBestseller}
              label="Bestseller"
              description="Shows a badge on the guest menu."
            />
            {isBestseller && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="!w-16 text-center"
                  aria-label="Bestseller emoji"
                  value={bestsellerEmoji}
                  onChange={(e) => setBestsellerEmoji(e.target.value)}
                  maxLength={4}
                />
                {EMOJI_CHOICES.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-pressed={bestsellerEmoji === emoji}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border text-lg sm:h-10 sm:w-10 ${
                      bestsellerEmoji === emoji
                        ? "border-orange-500 bg-orange-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                    onClick={() => setBestsellerEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <Switch
              id="food-today-special"
              checked={isTodaySpecial}
              onChange={setIsTodaySpecial}
              label="Today's Special"
              description="Features this dish in the Today's Specials section on the landing page."
            />
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Goes well with</h3>
              <p className="text-xs text-slate-500">
                Suggested to guests who add this dish. Leave it empty and the menu suggests dishes guests often order
                together.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pairsWith.map((id) => {
                const other = foodItems.find((f) => f._id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pr-1 pl-3 text-sm text-slate-700"
                  >
                    {other?.name ?? "Removed dish"}
                    <IconButton
                      icon={X}
                      size="sm"
                      label={`Remove ${other?.name ?? "dish"}`}
                      onClick={() => setPairsWith((p) => p.filter((x) => x !== id))}
                    />
                  </span>
                );
              })}
              {pairsWith.length < 4 && (
                <Select
                  aria-label="Add a dish that goes well with this one"
                  className="!w-56"
                  value=""
                  onChange={(e) => e.target.value && setPairsWith((p) => [...p, e.target.value])}
                >
                  <option value="">+ Add a dish</option>
                  {foodItems
                    .filter((f) => f._id !== editing?._id && !pairsWith.includes(f._id))
                    .map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name}
                      </option>
                    ))}
                </Select>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Customization options</h3>
                <p className="text-xs text-slate-500">e.g. Size (pick one), Add-ons (pick many). Optional.</p>
              </div>
              <Button type="button" size="sm" variant="soft" icon={Plus} onClick={addGroup}>
                Add group
              </Button>
            </div>
            {modifierGroups.map((g, gi) => (
              <div key={gi} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto_auto] sm:items-center">
                  <Input
                    aria-label="Group name"
                    placeholder="Group name (e.g. Size)"
                    value={g.name}
                    onChange={(e) => updateGroup(gi, { name: e.target.value })}
                  />
                  <Select
                    aria-label="Choice type"
                    value={g.type}
                    onChange={(e) =>
                      updateGroup(gi, {
                        type: e.target.value as "single" | "multi",
                      })
                    }
                  >
                    <option value="single">Pick one</option>
                    <option value="multi">Pick many</option>
                  </Select>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={g.required}
                      onChange={(e) => updateGroup(gi, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    className="!text-red-600 hover:!bg-red-50"
                    onClick={() => removeGroup(gi)}
                  >
                    Remove
                  </Button>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {g.options.map((o, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <Input
                        aria-label="Option name"
                        className="flex-1"
                        placeholder="Option (e.g. Large)"
                        value={o.label}
                        onChange={(e) => updateOption(gi, oi, { label: e.target.value })}
                      />
                      <Input
                        aria-label="Extra price"
                        className="!w-28"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="+₹0"
                        value={o.priceDelta}
                        onChange={(e) =>
                          updateOption(gi, oi, {
                            priceDelta: Number(e.target.value),
                          })
                        }
                      />
                      <IconButton icon={X} label="Remove option" onClick={() => removeOption(gi, oi)} />
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={Plus}
                    className="self-start"
                    onClick={() => addOption(gi)}
                  >
                    Add option
                  </Button>
                </div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Translations <span className="font-normal text-slate-400">(optional)</span>
                </h3>
                <p className="text-xs text-slate-500">Review auto-translations before saving.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="soft"
                icon={Sparkles}
                loading={translating}
                onClick={autoTranslate}
              >
                {translating ? "Translating…" : "Auto-translate"}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["kn", "hi"] as const).map((lng) => (
                <div key={lng} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-500">
                    {lng === "kn" ? "ಕನ್ನಡ (Kannada)" : "हिन्दी (Hindi)"}
                  </p>
                  <Input
                    aria-label={`${lng === "kn" ? "Kannada" : "Hindi"} name`}
                    placeholder="Name"
                    value={tr[lng].name}
                    onChange={(e) =>
                      setTr((t) => ({
                        ...t,
                        [lng]: { ...t[lng], name: e.target.value },
                      }))
                    }
                  />
                  <Textarea
                    aria-label={`${lng === "kn" ? "Kannada" : "Hindi"} description`}
                    rows={2}
                    placeholder="Description"
                    value={tr[lng].description}
                    onChange={(e) =>
                      setTr((t) => ({
                        ...t,
                        [lng]: { ...t[lng], description: e.target.value },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </Dialog>
    </Page>
  );
}

function Thumb({ food, size }: { food: FoodItem; size: "sm" | "md" }) {
  const box = size === "sm" ? "h-10 w-10" : "h-14 w-14";
  return (
    <div className={`relative shrink-0 ${box}`}>
      {food.imageUrl ? (
        <img src={food.imageUrl} alt="" className={`${box} rounded-lg object-cover ring-1 ring-slate-200`} />
      ) : (
        <div className={`${box} flex items-center justify-center rounded-lg bg-slate-100 text-slate-300`}>
          <UtensilsCrossed size={16} aria-hidden="true" />
        </div>
      )}
      {food.isBestseller && (
        <span
          className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] shadow"
          title="Bestseller"
        >
          {food.bestsellerEmoji || "⭐"}
        </span>
      )}
    </div>
  );
}

const typeDot: Record<FoodType, string> = {
  veg: "bg-emerald-600",
  "non-veg": "bg-red-600",
  egg: "bg-amber-500",
};
