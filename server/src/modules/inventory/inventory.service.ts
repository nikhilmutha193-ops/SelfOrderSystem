import { Types } from "mongoose";

import { RequestContext } from "../../core/context";
import { withTransaction } from "../../core/transaction";
import { IRecipe } from "../../models/Recipe";
import { IStockItem } from "../../models/StockItem";
import { writeAudit } from "../../utils/audit";
import { businessDateLabel, getBusinessDayRangeForDate } from "../../utils/businessDay";
import { HttpError } from "../../utils/httpError";
import { InventoryRepository, NewMovement } from "./inventory.repository";
import { CountInput, MovementInput, PurchaseInput, RecipeInput, StockItemInput, VendorInput } from "./inventory.schema";

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const UNIT_LABEL = { g: "g", ml: "ml", pcs: "pcs" } as const;

function isDuplicate(err: unknown): boolean {
  return (err as { code?: number }).code === 11000;
}

function staffName(ctx: RequestContext) {
  return ctx.admin?.username;
}

function stockRow(item: IStockItem, onHand: number) {
  const qty = round3(onHand);
  return {
    ...item,
    onHand: qty,
    low: item.isActive && item.reorderLevel > 0 && qty <= item.reorderLevel,
    value: round2(Math.max(qty, 0) * item.avgCost),
  };
}

export async function listStock(ctx: RequestContext) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const [items, onHand] = await Promise.all([repo.listStockItems(), repo.onHand()]);
  return items.map((item) => stockRow(item, onHand.get(item._id.toString()) ?? 0));
}

export async function lowStockCount(restaurantId: string) {
  const repo = new InventoryRepository(restaurantId);
  const [items, onHand] = await Promise.all([repo.listStockItems(), repo.onHand()]);
  return items.filter((item) => stockRow(item, onHand.get(item._id.toString()) ?? 0).low).length;
}

export async function createStockItem(ctx: RequestContext, input: StockItemInput) {
  try {
    const item = await new InventoryRepository(ctx.restaurantId).createStockItem(input);
    return stockRow(item.toObject(), 0);
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `A stock item called ${input.name} already exists`);
    throw err;
  }
}

export async function updateStockItem(ctx: RequestContext, id: string, input: StockItemInput) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const item = await repo.findStockItem(id);
  if (!item) throw new HttpError(404, "Stock item not found");
  if (item.unit !== input.unit && (await repo.onHand([item._id])).get(id)) {
    throw new HttpError(409, "The unit can't change while the item has stock. Adjust it to zero first.");
  }
  item.set(input);
  try {
    await item.save();
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `A stock item called ${input.name} already exists`);
    throw err;
  }
  const onHand = (await repo.onHand([item._id])).get(id) ?? 0;
  return stockRow(item.toObject(), onHand);
}

/**
 * A real delete, not the "isActive: false" soft-hide - only allowed when nothing depends on this
 * item, since stock-on-hand and recipe costs are both derived from records that reference it by
 * id. Deleting it out from under a purchase/count/wastage entry or a dish's recipe would corrupt
 * that math, so either of those blocks the delete instead.
 */
export async function deleteStockItem(ctx: RequestContext, id: string) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const item = await repo.findStockItem(id);
  if (!item) throw new HttpError(404, "Stock item not found");

  if (await repo.hasMovements(id)) {
    throw new HttpError(
      409,
      `${item.name} has stock history (purchases, counts or adjustments) and can't be deleted. Turn off "Active" instead to remove it from lists while keeping its records.`
    );
  }
  const recipe = await repo.recipeUsingItem(item._id);
  if (recipe) {
    const food = await repo.findFood(recipe.foodItemId.toString());
    throw new HttpError(
      409,
      `${item.name} is used in ${food?.name ?? "a dish"}'s recipe and can't be deleted. Remove it from that recipe first.`
    );
  }

  await repo.deleteStockItem(id);
  await writeAudit(ctx, "inventory.item.delete", `Deleted stock item ${item.name}`);
}

export async function postMovement(ctx: RequestContext, input: MovementInput) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const item = await repo.findStockItem(input.stockItemId);
  if (!item) throw new HttpError(404, "Stock item not found");
  const current = (await repo.onHand([item._id])).get(item._id.toString()) ?? 0;

  const quantity = round3(input.type === "wastage" ? -Math.abs(input.quantity) : input.quantity);
  if (input.type === "opening" && input.unitCost != null) {
    const base = Math.max(current, 0);
    item.avgCost = round6((base * item.avgCost + quantity * input.unitCost) / (base + quantity));
    await item.save();
  }
  await repo.insertMovements([
    {
      stockItemId: item._id,
      type: input.type,
      quantity,
      unitCost: input.type === "opening" && input.unitCost != null ? input.unitCost : item.avgCost,
      note: input.note || undefined,
      byName: staffName(ctx),
    },
  ]);
  await refreshSoldOut(ctx.restaurantId);
  if (input.type !== "opening") {
    await writeAudit(
      ctx,
      `inventory.${input.type}`,
      `${input.type === "wastage" ? "Wasted" : "Adjusted"} ${item.name} by ${quantity} ${UNIT_LABEL[item.unit]}: ${input.note}`
    );
  }
  return stockRow(item.toObject(), current + quantity);
}

export async function itemLedger(ctx: RequestContext, id: string) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const item = await repo.findStockItem(id);
  if (!item) throw new HttpError(404, "Stock item not found");
  const [movements, onHand] = await Promise.all([repo.movementsForItem(id, 200), repo.onHand([item._id])]);
  return { item: stockRow(item.toObject(), onHand.get(id) ?? 0), movements };
}

function recipeCost(recipe: IRecipe | undefined, stock: Map<string, IStockItem>) {
  if (!recipe) return 0;
  return round2(
    recipe.lines.reduce((sum, line) => sum + line.quantity * (stock.get(line.stockItemId.toString())?.avgCost ?? 0), 0)
  );
}

export async function listRecipes(ctx: RequestContext) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const [foods, recipes, items] = await Promise.all([repo.listFoods(), repo.listRecipes(), repo.listStockItems()]);
  const stock = new Map(items.map((i) => [i._id.toString(), i]));
  const recipeOf = new Map(recipes.map((r) => [r.foodItemId.toString(), r]));
  return foods.map((food) => {
    const recipe = recipeOf.get(food._id.toString());
    const cost = recipeCost(recipe, stock);
    return {
      foodItemId: food._id,
      name: food.name,
      price: food.price,
      isActive: food.isActive,
      soldOutByStock: food.soldOutByStock ?? false,
      modifierGroups: food.modifierGroups ?? [],
      recipe: recipe ? { lines: recipe.lines, modifierLines: recipe.modifierLines } : null,
      cost,
      costPercent: recipe && food.price > 0 ? round2((cost / food.price) * 100) : null,
    };
  });
}

export async function saveRecipe(ctx: RequestContext, foodItemId: string, input: RecipeInput) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const food = await repo.findFood(foodItemId);
  if (!food) throw new HttpError(404, "Food item not found");

  const ids = [...input.lines, ...input.modifierLines].map((l) => l.stockItemId);
  if (new Set(input.lines.map((l) => l.stockItemId)).size !== input.lines.length) {
    throw new HttpError(400, "Each ingredient can appear only once in a recipe");
  }
  const found = await repo.findStockItems(ids);
  if (new Set(found.map((i) => i._id.toString())).size !== new Set(ids).size) {
    throw new HttpError(404, "One of these ingredients no longer exists");
  }
  for (const line of input.modifierLines) {
    const group = food.modifierGroups?.find((g) => g.name === line.groupName);
    if (!group?.options.some((o) => o.label === line.label)) {
      throw new HttpError(400, `${line.groupName}: ${line.label} is not an option on ${food.name}`);
    }
  }

  if (input.lines.length === 0 && input.modifierLines.length === 0) {
    await repo.deleteRecipe(foodItemId);
  } else {
    await repo.saveRecipe(foodItemId, {
      lines: input.lines.map((l) => ({
        stockItemId: new Types.ObjectId(l.stockItemId),
        quantity: round3(l.quantity),
        key: l.key,
      })),
      modifierLines: input.modifierLines.map((l) => ({
        groupName: l.groupName,
        label: l.label,
        stockItemId: new Types.ObjectId(l.stockItemId),
        quantity: round3(l.quantity),
      })),
    });
  }
  await refreshSoldOut(ctx.restaurantId);
  return (await listRecipes(ctx)).find((r) => r.foodItemId.toString() === foodItemId);
}

export async function listVendors(ctx: RequestContext) {
  return new InventoryRepository(ctx.restaurantId).listVendors();
}

export async function createVendor(ctx: RequestContext, input: VendorInput) {
  try {
    return await new InventoryRepository(ctx.restaurantId).createVendor(input);
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `A vendor called ${input.name} already exists`);
    throw err;
  }
}

export async function updateVendor(ctx: RequestContext, id: string, input: VendorInput) {
  const vendor = await new InventoryRepository(ctx.restaurantId).findVendor(id);
  if (!vendor) throw new HttpError(404, "Vendor not found");
  vendor.set(input);
  try {
    await vendor.save();
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `A vendor called ${input.name} already exists`);
    throw err;
  }
  return vendor;
}

async function dateRange(repo: InventoryRepository, from?: string, to?: string) {
  const restaurant = await repo.findRestaurant("dayEndTime timezone");
  const today = businessDateLabel(new Date(), restaurant?.dayEndTime, restaurant?.timezone);
  const start = from ?? to ?? today;
  const end = to ?? start;
  if (start > end) throw new HttpError(400, "The start date must be on or before the end date");
  return {
    from: start,
    to: end,
    start: getBusinessDayRangeForDate(start, restaurant?.dayEndTime, restaurant?.timezone).start,
    end: getBusinessDayRangeForDate(end, restaurant?.dayEndTime, restaurant?.timezone).end,
  };
}

export async function createPurchase(ctx: RequestContext, input: PurchaseInput) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const items = await repo.findStockItems(input.lines.map((l) => l.stockItemId));
  const stock = new Map(items.map((i) => [i._id.toString(), i]));
  if (input.lines.some((l) => !stock.has(l.stockItemId)))
    throw new HttpError(404, "One of these stock items no longer exists");
  const vendor = input.vendorId ? await repo.findVendor(input.vendorId) : null;
  if (input.vendorId && !vendor) throw new HttpError(404, "Vendor not found");
  const purchasedAt = input.purchasedOn ? (await dateRange(repo, input.purchasedOn)).start : new Date();

  const lines = input.lines.map((line) => {
    const item = stock.get(line.stockItemId)!;
    return {
      stockItemId: item._id,
      name: item.name,
      quantity: round3(line.quantity),
      purchaseUnit: item.purchaseUnit || UNIT_LABEL[item.unit],
      unitPrice: round2(line.unitPrice),
      amount: round2(line.quantity * line.unitPrice),
    };
  });
  const total = round2(lines.reduce((sum, l) => sum + l.amount, 0));

  const purchase = await withTransaction(async (session) => {
    const onHand = await repo.onHand(
      items.map((i) => i._id),
      session
    );
    const running = new Map(
      items.map((i) => [i._id.toString(), { qty: Math.max(onHand.get(i._id.toString()) ?? 0, 0), avg: i.avgCost }])
    );
    const created = await repo.createPurchase(
      {
        vendorId: vendor?._id ?? null,
        vendorName: vendor?.name ?? "",
        invoiceRef: input.invoiceRef,
        purchasedAt,
        lines,
        total,
        byName: staffName(ctx),
      },
      session
    );
    const movements: NewMovement[] = [];
    for (const line of lines) {
      const item = stock.get(line.stockItemId.toString())!;
      const baseQty = round3(line.quantity * item.purchaseFactor);
      const unitCost = round6(line.unitPrice / item.purchaseFactor);
      const state = running.get(item._id.toString())!;
      state.avg = round6((state.qty * state.avg + baseQty * unitCost) / (state.qty + baseQty));
      state.qty += baseQty;
      movements.push({
        stockItemId: item._id,
        type: "purchase",
        quantity: baseQty,
        unitCost,
        purchaseId: created._id,
        note: input.invoiceRef ? `Invoice ${input.invoiceRef}` : undefined,
        byName: staffName(ctx),
      });
    }
    await repo.insertMovements(movements, session);
    for (const [id, state] of running) await repo.setAvgCost(new Types.ObjectId(id), state.avg, session);
    return created;
  });

  await refreshSoldOut(ctx.restaurantId);
  await writeAudit(
    ctx,
    "inventory.purchase",
    `Recorded purchase${vendor ? ` from ${vendor.name}` : ""}${input.invoiceRef ? ` (${input.invoiceRef})` : ""} for ₹${total.toFixed(2)}`
  );
  return purchase;
}

export async function listPurchases(ctx: RequestContext, from?: string, to?: string) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const range = await dateRange(repo, from, to);
  const purchases = await repo.listPurchases(range.start, range.end);
  return { from: range.from, to: range.to, purchases, total: round2(purchases.reduce((s, p) => s + p.total, 0)) };
}

export async function createCount(ctx: RequestContext, input: CountInput) {
  const repo = new InventoryRepository(ctx.restaurantId);
  if (new Set(input.lines.map((l) => l.stockItemId)).size !== input.lines.length) {
    throw new HttpError(400, "Each item can be counted only once");
  }
  const items = await repo.findStockItems(input.lines.map((l) => l.stockItemId));
  const stock = new Map(items.map((i) => [i._id.toString(), i]));
  if (input.lines.some((l) => !stock.has(l.stockItemId)))
    throw new HttpError(404, "One of these stock items no longer exists");

  const count = await withTransaction(async (session) => {
    const onHand = await repo.onHand(
      items.map((i) => i._id),
      session
    );
    const lines = input.lines.map((line) => {
      const item = stock.get(line.stockItemId)!;
      const expected = round3(onHand.get(line.stockItemId) ?? 0);
      const variance = round3(line.counted - expected);
      return {
        stockItemId: item._id,
        name: item.name,
        unit: item.unit,
        expected,
        counted: round3(line.counted),
        variance,
        value: round2(variance * item.avgCost),
      };
    });
    const created = await repo.createCount(
      {
        countedAt: new Date(),
        note: input.note,
        lines,
        varianceValue: round2(lines.reduce((s, l) => s + l.value, 0)),
        byName: staffName(ctx),
      },
      session
    );
    await repo.insertMovements(
      lines
        .filter((l) => l.variance !== 0)
        .map((l) => ({
          stockItemId: l.stockItemId,
          type: "adjustment" as const,
          quantity: l.variance,
          unitCost: stock.get(l.stockItemId.toString())!.avgCost,
          countId: created._id,
          note: "Stock count",
          byName: staffName(ctx),
        })),
      session
    );
    return created;
  });

  await refreshSoldOut(ctx.restaurantId);
  await writeAudit(
    ctx,
    "inventory.count",
    `Recorded a stock count of ${count.lines.length} items (variance ₹${count.varianceValue.toFixed(2)})`
  );
  return count;
}

export async function listCounts(ctx: RequestContext) {
  return new InventoryRepository(ctx.restaurantId).listCounts(30);
}

export async function usageReport(ctx: RequestContext, from?: string, to?: string) {
  const repo = new InventoryRepository(ctx.restaurantId);
  const range = await dateRange(repo, from, to);
  const [rows, items] = await Promise.all([repo.usageBetween(range.start, range.end), repo.listStockItems()]);
  const byItem = new Map<
    string,
    {
      purchased: number;
      consumed: number;
      wasted: number;
      adjusted: number;
      consumedValue: number;
      wastedValue: number;
    }
  >();
  for (const row of rows) {
    const key = row._id.stockItemId.toString();
    const entry = byItem.get(key) ?? {
      purchased: 0,
      consumed: 0,
      wasted: 0,
      adjusted: 0,
      consumedValue: 0,
      wastedValue: 0,
    };
    if (row._id.type === "purchase") entry.purchased += row.qty;
    if (row._id.type === "consumption" || row._id.type === "reversal") {
      entry.consumed -= row.qty;
      entry.consumedValue -= row.value;
    }
    if (row._id.type === "wastage") {
      entry.wasted -= row.qty;
      entry.wastedValue -= row.value;
    }
    if (row._id.type === "adjustment" || row._id.type === "opening") entry.adjusted += row.qty;
    byItem.set(key, entry);
  }
  const lines = items
    .filter((item) => byItem.has(item._id.toString()))
    .map((item) => {
      const e = byItem.get(item._id.toString())!;
      return {
        stockItemId: item._id,
        name: item.name,
        unit: item.unit,
        purchased: round3(e.purchased),
        consumed: round3(e.consumed),
        wasted: round3(e.wasted),
        adjusted: round3(e.adjusted),
        consumedValue: round2(e.consumedValue),
        wastedValue: round2(e.wastedValue),
      };
    });
  return {
    from: range.from,
    to: range.to,
    lines,
    consumedValue: round2(lines.reduce((s, l) => s + l.consumedValue, 0)),
    wastedValue: round2(lines.reduce((s, l) => s + l.wastedValue, 0)),
  };
}

export async function getSettings(ctx: RequestContext) {
  const restaurant = await new InventoryRepository(ctx.restaurantId).findRestaurant("inventorySettings");
  return { autoSoldOut: restaurant?.inventorySettings?.autoSoldOut ?? false };
}

export async function updateSettings(ctx: RequestContext, autoSoldOut: boolean) {
  await new InventoryRepository(ctx.restaurantId).updateInventorySettings(autoSoldOut);
  await refreshSoldOut(ctx.restaurantId, true);
  await writeAudit(ctx, "inventory.settings", `Turned automatic sold-out ${autoSoldOut ? "on" : "off"}`);
  return { autoSoldOut };
}

export async function refreshSoldOut(restaurantId: string, restoreWhenOff = false) {
  const repo = new InventoryRepository(restaurantId);
  const restaurant = await repo.findRestaurant("inventorySettings");
  const enabled = restaurant?.inventorySettings?.autoSoldOut ?? false;
  const soldOut = await repo.soldOutFoods();
  if (!enabled) {
    if (restoreWhenOff && soldOut.length) await repo.restoreFoods(soldOut.map((f) => f._id));
    return;
  }
  const recipes = await repo.listRecipes();
  const keyIds = [
    ...new Set(recipes.flatMap((r) => r.lines.filter((l) => l.key).map((l) => l.stockItemId.toString()))),
  ];
  const onHand = keyIds.length
    ? await repo.onHand(keyIds.map((id) => new Types.ObjectId(id)))
    : new Map<string, number>();
  const outOfStock = (recipe: IRecipe) =>
    recipe.lines.some((l) => l.key && (onHand.get(l.stockItemId.toString()) ?? 0) <= 0);
  const recipeOf = new Map(recipes.map((r) => [r.foodItemId.toString(), r]));

  const toSoldOut = recipes.filter(outOfStock).map((r) => r.foodItemId);
  const toRestore = soldOut
    .filter((f) => {
      const recipe = recipeOf.get(f._id.toString());
      return !recipe || !outOfStock(recipe);
    })
    .map((f) => f._id);
  if (toSoldOut.length) await repo.markSoldOut(toSoldOut);
  if (toRestore.length) await repo.restoreFoods(toRestore);
}

export async function consumeForKot(restaurantId: string, itemIds: string[]) {
  const repo = new InventoryRepository(restaurantId);
  const orderItems = (await repo.findOrderItems(itemIds)).filter((i) => i.status !== "cancelled" && i.foodItemId);
  if (orderItems.length === 0) return;
  const componentIds = orderItems.flatMap((i) =>
    (i.components ?? []).flatMap((c) => (c.foodItemId ? [c.foodItemId] : []))
  );
  const recipes = await repo.findRecipesForFoods([...orderItems.map((i) => i.foodItemId!), ...componentIds]);
  if (recipes.length === 0) return;
  const recipeOf = new Map(recipes.map((r) => [r.foodItemId.toString(), r]));
  const stockIds = [
    ...new Set(recipes.flatMap((r) => [...r.lines, ...r.modifierLines].map((l) => l.stockItemId.toString()))),
  ];
  const stock = new Map((await repo.findStockItems(stockIds)).map((i) => [i._id.toString(), i]));

  const movements: NewMovement[] = [];
  for (const item of orderItems) {
    const own = recipeOf.get(item.foodItemId!.toString());
    const parts = own
      ? [{ recipe: own, multiplier: item.quantity, modifiers: item.modifiers ?? [] }]
      : (item.components ?? []).flatMap((c) => {
          const recipe = c.foodItemId ? recipeOf.get(c.foodItemId.toString()) : undefined;
          return recipe ? [{ recipe, multiplier: item.quantity * c.quantity, modifiers: [] }] : [];
        });
    if (parts.length === 0) continue;
    const needed = new Map<string, number>();
    for (const { recipe, multiplier, modifiers } of parts) {
      for (const line of recipe.lines) {
        const key = line.stockItemId.toString();
        needed.set(key, (needed.get(key) ?? 0) + line.quantity * multiplier);
      }
      for (const chosen of modifiers) {
        for (const extra of recipe.modifierLines.filter(
          (m) => m.groupName === chosen.groupName && m.label === chosen.label
        )) {
          const key = extra.stockItemId.toString();
          needed.set(key, (needed.get(key) ?? 0) + extra.quantity * multiplier);
        }
      }
    }
    for (const [stockItemId, qty] of needed) {
      const stockItem = stock.get(stockItemId);
      if (!stockItem || qty <= 0) continue;
      movements.push({
        stockItemId: stockItem._id,
        type: "consumption",
        quantity: -round3(qty),
        unitCost: stockItem.avgCost,
        orderId: item.orderId,
        orderItemId: item._id,
        note: `${item.quantity} × ${item.foodName}`,
      });
    }
  }
  await repo.insertMovements(movements);
  await refreshSoldOut(restaurantId);
}

export async function settleCancelledItems(restaurantId: string, entries: { itemId: string; cooked: boolean }[]) {
  if (entries.length === 0) return;
  const repo = new InventoryRepository(restaurantId);
  const movements = await repo.movementsForOrderItems(entries.map((e) => new Types.ObjectId(e.itemId)));
  const posted: NewMovement[] = [];
  for (const entry of entries) {
    const own = movements.filter((m) => m.orderItemId?.toString() === entry.itemId);
    if (own.some((m) => m.type === "reversal" || m.type === "wastage")) continue;
    for (const used of own.filter((m) => m.type === "consumption")) {
      const base = {
        stockItemId: used.stockItemId,
        unitCost: used.unitCost,
        orderId: used.orderId,
        orderItemId: used.orderItemId,
      };
      posted.push({ ...base, type: "reversal", quantity: -used.quantity, note: "Item cancelled" });
      if (entry.cooked)
        posted.push({ ...base, type: "wastage", quantity: used.quantity, note: "Cancelled after cooking" });
    }
  }
  await repo.insertMovements(posted);
  await refreshSoldOut(restaurantId);
}

export async function settleCancelledOrder(restaurantId: string, orderId: string) {
  const items = await new InventoryRepository(restaurantId).findItemsOfOrder(orderId);
  await settleCancelledItems(
    restaurantId,
    items.map((item) => ({ itemId: item._id.toString(), cooked: item.status !== "cancelled" }))
  );
}
