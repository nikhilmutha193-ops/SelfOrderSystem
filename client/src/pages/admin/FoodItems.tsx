import { useEffect, useMemo, useState } from "react";

import type { Category, FoodItem, FoodType, ModifierGroup, Subcategory, Translations } from "../../lib/types";
import { api, extractErrorMessage, uploadImage } from "../../shared/api/client";
import { Badge, Button, Card, ErrorText, Input, Select, TableWrap, Textarea } from "../../shared/ui/ui";

const EMOJI_CHOICES = ["⭐", "🔥", "👑", "💯", "🏆", "❤️"];
const EMPTY_TR = { kn: { name: "", description: "" }, hi: { name: "", description: "" } };

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
  const [foodType, setFoodType] = useState<FoodType>("veg");
  const [rating, setRating] = useState<number>(0);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<number>(10);
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
      const next = { kn: { name: "", description: "" }, hi: { name: "", description: "" } };
      for (const lng of ["kn", "hi"] as const) {
        const res = await api.post<{ translations: string[] }>("/translate", {
          texts: [name, description || ""],
          to: lng,
        });
        next[lng] = { name: res.data.translations[0] || "", description: res.data.translations[1] || "" };
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

  // ---- modifier group editing helpers ----
  function addGroup() {
    setModifierGroups((g) => [
      ...g,
      { name: "", type: "single", required: false, options: [{ label: "", priceDelta: 0 }] },
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
        idx === gi ? { ...grp, options: grp.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : grp
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
          .map((o) => ({ label: o.label.trim(), priceDelta: Number(o.priceDelta) || 0 })),
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
      foodType,
      rating,
      prepTimeMinutes,
      modifierGroups: cleanGroups,
      translations,
    };
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
      setFoodType("veg");
      setRating(0);
      setPrepTimeMinutes(10);
      setModifierGroups([]);
      setTr(structuredClone(EMPTY_TR));
      setEditing(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  function edit(food: FoodItem) {
    setEditing(food);
    setCategoryId(food.categoryId);
    setSubcategoryId(food.subcategoryId);
    setName(food.name);
    setPrice(food.price);
    setDescription(food.description || "");
    setImageUrl(food.imageUrl || "");
    setIsBestseller(food.isBestseller);
    setBestsellerEmoji(food.bestsellerEmoji || "⭐");
    setFoodType(food.foodType || "veg");
    setRating(food.rating || 0);
    setPrepTimeMinutes(food.prepTimeMinutes ?? 10);
    setModifierGroups((food.modifierGroups ?? []).map((g) => ({ ...g, options: g.options.map((o) => ({ ...o })) })));
    setTr({
      kn: { name: food.translations?.kn?.name || "", description: food.translations?.kn?.description || "" },
      hi: { name: food.translations?.hi?.name || "", description: food.translations?.hi?.description || "" },
    });
  }

  async function toggleActive(food: FoodItem) {
    try {
      await api.patch(`/food-items/${food._id}/active`, { isActive: !food.isActive });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Food Items</h1>
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
            Subcategory
            <Select className="mt-1" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} required>
              {subcategoriesForCategory.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Name
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Price
            <Input
              className="mt-1 w-28"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Description
            <Input className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <div>
            <span className="text-sm font-medium text-slate-700">Image</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-md bg-slate-100" />
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

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Food type
              <Select className="mt-1" value={foodType} onChange={(e) => setFoodType(e.target.value as FoodType)}>
                <option value="veg">Veg</option>
                <option value="non-veg">Non-veg</option>
                <option value="egg">Contains egg</option>
              </Select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Rating (0 = show as "New")
              <Input
                className="mt-1"
                type="number"
                min={0}
                max={5}
                step="0.1"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Prep time (minutes)
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={prepTimeMinutes}
                onChange={(e) => setPrepTimeMinutes(Number(e.target.value))}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                How long the kitchen needs for this dish. The slowest dish in a round sets the order's estimate.
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={isBestseller} onChange={(e) => setIsBestseller(e.target.checked)} />
              Bestseller
            </label>
            {isBestseller && (
              <div className="flex items-center gap-2">
                <Input
                  className="w-16 text-center"
                  value={bestsellerEmoji}
                  onChange={(e) => setBestsellerEmoji(e.target.value)}
                  maxLength={4}
                />
                <div className="flex gap-1">
                  {EMOJI_CHOICES.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`rounded-md border px-1.5 py-1 text-sm ${
                        bestsellerEmoji === emoji ? "border-orange-500 bg-orange-50" : "border-slate-200"
                      }`}
                      onClick={() => setBestsellerEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-full border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Customization options</p>
              <button
                type="button"
                onClick={addGroup}
                className="text-sm font-semibold text-orange-600 hover:underline"
              >
                + Add group
              </button>
            </div>
            {modifierGroups.length === 0 && (
              <p className="text-xs text-slate-400">e.g. Size (pick one), Add-ons (pick many). Optional.</p>
            )}
            <div className="flex flex-col gap-3">
              {modifierGroups.map((g, gi) => (
                <div key={gi} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="w-40"
                      placeholder="Group name (e.g. Size)"
                      value={g.name}
                      onChange={(e) => updateGroup(gi, { name: e.target.value })}
                    />
                    <Select
                      className="!w-32"
                      value={g.type}
                      onChange={(e) => updateGroup(gi, { type: e.target.value as "single" | "multi" })}
                    >
                      <option value="single">Pick one</option>
                      <option value="multi">Pick many</option>
                    </Select>
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={g.required}
                        onChange={(e) => updateGroup(gi, { required: e.target.checked })}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => removeGroup(gi)}
                      className="ml-auto text-xs font-semibold text-red-600 hover:underline"
                    >
                      Remove group
                    </button>
                  </div>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {g.options.map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <Input
                          className="flex-1"
                          placeholder="Option (e.g. Large)"
                          value={o.label}
                          onChange={(e) => updateOption(gi, oi, { label: e.target.value })}
                        />
                        <Input
                          className="w-24"
                          type="number"
                          step="0.01"
                          placeholder="+₹0"
                          value={o.priceDelta}
                          onChange={(e) => updateOption(gi, oi, { priceDelta: Number(e.target.value) })}
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(gi, oi)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addOption(gi)}
                      className="self-start text-xs font-semibold text-orange-600 hover:underline"
                    >
                      + Add option
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full border-t border-slate-100 pt-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700">
                Translations <span className="font-normal text-slate-400">(optional)</span>
              </p>
              <button
                type="button"
                onClick={autoTranslate}
                disabled={translating}
                className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
              >
                {translating ? "Translating..." : "✨ Auto-translate from English"}
              </button>
            </div>
            <p className="mb-2 text-xs text-slate-400">
              Auto-translate fills these from the English name/description — review and edit before saving.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["kn", "hi"] as const).map((lng) => (
                <div key={lng} className="rounded-xl border border-slate-200 p-3">
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                    {lng === "kn" ? "ಕನ್ನಡ (Kannada)" : "हिन्दी (Hindi)"}
                  </p>
                  <Input
                    className="mb-2"
                    placeholder="Name"
                    value={tr[lng].name}
                    onChange={(e) => setTr((t) => ({ ...t, [lng]: { ...t[lng], name: e.target.value } }))}
                  />
                  <Textarea
                    rows={2}
                    placeholder="Description"
                    value={tr[lng].description}
                    onChange={(e) => setTr((t) => ({ ...t, [lng]: { ...t[lng], description: e.target.value } }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <Button type="submit">{editing ? "Update" : "Add food item"}</Button>
          {editing && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setName("");
                setPrice(0);
                setDescription("");
                setImageUrl("");
                setIsBestseller(false);
                setBestsellerEmoji("⭐");
                setPrepTimeMinutes(10);
                setModifierGroups([]);
                setTr(structuredClone(EMPTY_TR));
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
                <th className="pb-2">Image</th>
                <th className="pb-2">Category</th>
                <th className="pb-2">Subcategory</th>
                <th className="pb-2">Name</th>
                <th className="pb-2">Price</th>
                <th className="pb-2">Prep</th>
                <th className="pb-2">Reviews</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {foodItems.map((food) => (
                <tr key={food._id} className="border-t border-slate-100">
                  <td className="py-1.5">
                    <div className="relative h-10 w-10">
                      {food.imageUrl ? (
                        <img src={food.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-slate-100" />
                      )}
                      {food.isBestseller && (
                        <span
                          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] shadow"
                          title="Bestseller"
                        >
                          {food.bestsellerEmoji || "⭐"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5">{categoryName(food.categoryId)}</td>
                  <td className="py-1.5">{subcategoryName(food.subcategoryId)}</td>
                  <td className="py-1.5">{food.name}</td>
                  <td className="py-1.5">₹{food.price.toFixed(2)}</td>
                  <td className="py-1.5 whitespace-nowrap">{food.prepTimeMinutes ?? 10} min</td>
                  <td className="py-1.5 whitespace-nowrap">
                    {food.reviewCount ? (
                      <span className="text-slate-700">
                        ★ {(food.reviewSum! / food.reviewCount).toFixed(1)}{" "}
                        <span className="text-slate-400">({food.reviewCount})</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <div className="flex gap-1.5">
                      <Badge tone={food.isActive ? "green" : "gray"}>{food.isActive ? "Active" : "Inactive"}</Badge>
                      {food.isBestseller && <Badge tone="amber">{food.bestsellerEmoji || "⭐"} Bestseller</Badge>}
                    </div>
                  </td>
                  <td className="flex gap-2 py-1.5">
                    <button className="text-orange-600 hover:underline" onClick={() => edit(food)}>
                      Edit
                    </button>
                    <button className="text-slate-600 hover:underline" onClick={() => toggleActive(food)}>
                      {food.isActive ? "Deactivate" : "Activate"}
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
