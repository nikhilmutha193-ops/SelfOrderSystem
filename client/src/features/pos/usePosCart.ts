import { useState } from "react";

import { newId } from "../../lib/id";
import type { PosMenu, PosMenuItem, SelectedModifier } from "../../lib/types";
import { usePrintKot } from "../kitchen/queries";
import { ordersApi } from "../orders/api";
import { askGuestName } from "../../shared/ui/GuestNameHost";
import { useAddOrderItems, useGenerateBill, useOrder } from "../orders/queries";
import { toOrderLines, type CreatePosOrderInput, type DraftLine } from "./api";
import { useCreatePosOrder } from "./queries";

export type NewOrderTarget = Omit<CreatePosOrderInput, "items" | "sendToKitchen">;

export interface SaveResult {
  id: string | null;
  kot: { round: number; tokenNumber?: number } | null;
}

const sameModifiers = (a: SelectedModifier[], b: SelectedModifier[]) =>
  a.length === b.length && a.every((m, i) => m.groupName === b[i].groupName && m.label === b[i].label);

/** The same dish with the same choices, apart from whether it is on the house. */
const sameChoices = (a: DraftLine, b: DraftLine) =>
  a.item._id === b.item._id &&
  a.note === b.note &&
  !!a.isJain === !!b.isJain &&
  !!a.isPacked === !!b.isPacked &&
  sameModifiers(a.modifiers, b.modifiers);

/**
 * Only one plate of a dish can be on the house in an order. A free line therefore never holds more than one: the
 * rest of what was asked for is added to the paid line of the same dish (made if there is none yet).
 */
function withPaidRest(lines: DraftLine[], free: DraftLine, rest: number): DraftLine[] {
  if (rest <= 0) return lines;
  const paid = lines.find((l) => l !== free && !l.complimentary && sameChoices(l, free));
  if (paid) return lines.map((l) => (l === paid ? { ...l, quantity: l.quantity + rest } : l));
  const at = lines.indexOf(free);
  return [
    ...lines.slice(0, at + 1),
    { ...free, key: newId(), quantity: rest, complimentary: false, complimentaryReason: undefined },
    ...lines.slice(at + 1),
  ];
}

/**
 * Ranks a dish against the typed term so the best match lands first - what Enter adds and what
 * appears at the top of the grid while searching. Exact short code beats a short code prefix
 * (both are a deliberate fast-add shortcut) beats the dish name starting with the term beats the
 * term just appearing somewhere in the name or code. 0 means no match at all.
 */
function matchScore(item: PosMenuItem, code: string, lower: string): number {
  const shortCode = item.shortCode?.toUpperCase() ?? "";
  const name = item.name.toLowerCase();
  if (shortCode === code) return 5;
  if (shortCode.startsWith(code)) return 4;
  if (name.startsWith(lower)) return 3;
  if (name.includes(lower)) return 2;
  if (shortCode.includes(code)) return 1;
  return 0;
}

export interface PriceTarget {
  orderType: "dine-in" | "takeaway";
  areaId?: string | null;
}

export function priceFor(item: PosMenuItem, target: PriceTarget): number {
  const prices = item.prices;
  if (!prices) return item.price;
  if (target.orderType === "takeaway" && prices.takeaway != null) return prices.takeaway;
  if (target.orderType === "dine-in" && target.areaId && prices.areas[target.areaId] != null) {
    return prices.areas[target.areaId];
  }
  return item.price;
}

export function pricedMenu(menu: PosMenu, target: PriceTarget): PosMenu {
  return {
    ...menu,
    items: menu.items.map((item) => ({
      ...item,
      price: priceFor(item, target),
    })),
  };
}

export function filterMenu(menu: PosMenu, search: string, category: string): PosMenuItem[] {
  const term = search.trim();
  if (term) {
    const code = term.toUpperCase();
    const lower = term.toLowerCase();
    return menu.items
      .map((item) => ({ item, score: matchScore(item, code, lower) }))
      .filter((ranked) => ranked.score > 0)
      .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
      .map((ranked) => ranked.item);
  }
  return category === "all" ? menu.items : menu.items.filter((i) => i.categoryId === category);
}

export function hasOptions(item: PosMenuItem) {
  return item.modifierGroups.some((g) => g.options.length > 0);
}

export function usePosCart() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const detail = useOrder(orderId ?? undefined, 10000).data ?? null;
  const activeDetail = detail && detail.order._id === orderId ? detail : null;

  const createOrder = useCreatePosOrder();
  const addItems = useAddOrderItems();
  const printKot = usePrintKot();
  const generateBill = useGenerateBill();

  function open(id: string | null) {
    setOrderId(id);
    setDraft([]);
  }

  function addLine(
    item: PosMenuItem,
    quantity: number,
    modifiers: SelectedModifier[] = [],
    note = "",
    isJain = false,
    isPacked = false
  ) {
    setDraft((lines) => {
      const same = lines.find(
        (l) =>
          l.item._id === item._id &&
          l.note === note &&
          !!l.isJain === isJain &&
          !!l.isPacked === isPacked &&
          !l.complimentary &&
          sameModifiers(l.modifiers, modifiers)
      );
      if (same) return lines.map((l) => (l === same ? { ...l, quantity: l.quantity + quantity } : l));
      return [...lines, { key: newId(), item, quantity, modifiers, note, isJain, isPacked }];
    });
  }

  function changeQuantity(key: string, delta: number) {
    setDraft((lines) => {
      const line = lines.find((l) => l.key === key);
      // One plate is free; asking for another one adds a paid plate.
      if (line?.complimentary && delta > 0) return withPaidRest(lines, line, delta);
      return lines.flatMap((l) =>
        l.key !== key ? [l] : l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }]
      );
    });
  }

  /** Replaces what was chosen for a draft line (quantity, options, Jain, spice and comment, pack). */
  function updateLine(
    key: string,
    quantity: number,
    modifiers: SelectedModifier[],
    note: string,
    isJain = false,
    isPacked = false
  ) {
    setDraft((lines) => {
      const edited = lines.map((l) =>
        l.key === key
          ? { ...l, quantity: l.complimentary ? 1 : quantity, modifiers, note, isJain, isPacked }
          : l
      );
      const line = edited.find((l) => l.key === key);
      return line?.complimentary ? withPaidRest(edited, line, quantity - 1) : edited;
    });
  }

  /**
   * Staff can give one plate of a new dish on the house (a reason is required) or take it back before the order is
   * saved. With two or more on the line, one becomes free and the rest stay payable.
   */
  function toggleComplimentary(key: string, reason = "") {
    setDraft((lines) => {
      const line = lines.find((l) => l.key === key);
      if (!line) return lines;
      if (line.complimentary) {
        // Taking it back: join the paid line of the same dish, or just start charging for it.
        const paid = lines.find((l) => l !== line && !l.complimentary && sameChoices(l, line));
        if (paid) {
          return lines.filter((l) => l !== line).map((l) => (l === paid ? { ...l, quantity: l.quantity + line.quantity } : l));
        }
        return lines.map((l) => (l === line ? { ...l, complimentary: false, complimentaryReason: undefined } : l));
      }
      if (reason.trim().length < 3) return lines;
      if (lines.some((l) => l.complimentary && l.item._id === line.item._id)) return lines;
      if (line.quantity > 1) {
        const free: DraftLine = {
          ...line,
          key: newId(),
          quantity: 1,
          complimentary: true,
          complimentaryReason: reason.trim(),
        };
        return lines.flatMap((l) => (l === line ? [{ ...l, quantity: l.quantity - 1 }, free] : [l]));
      }
      return lines.map((l) => (l === line ? { ...l, complimentary: true, complimentaryReason: reason.trim() } : l));
    });
  }

  function removeLine(key: string) {
    setDraft((lines) => lines.filter((l) => l.key !== key));
  }

  async function save(send: boolean, target: NewOrderTarget): Promise<SaveResult> {
    let id = orderId;
    let kot: SaveResult["kot"] = null;
    if (draft.length > 0) {
      const items = toOrderLines(draft);
      if (!id) {
        // A new order for a table asks who the guest is; staff can skip it (the order is then just "Guest").
        if (target.tableId && !target.customerName?.trim()) {
          const name = await askGuestName();
          if (name) target = { ...target, customerName: name };
        }
        const created = await createOrder.mutateAsync({
          ...target,
          sendToKitchen: send,
          items,
        });
        setOrderId(created.order._id);
        setDraft([]);
        return { id: created.order._id, kot: created.kot };
      }
      await addItems.mutateAsync({ orderId: id, items });
      setDraft([]);
    }
    const unsent =
      draft.length > 0 || (activeDetail?.items ?? []).some((i) => i.kotRound == null && i.status !== "cancelled");
    if (send && id && unsent) {
      const result = await printKot.mutateAsync(id);
      if (result.round) kot = { round: result.round, tokenNumber: result.tokenNumber };
    }
    return { id, kot };
  }

  async function bill(id: string): Promise<boolean> {
    const current = await ordersApi.get(id);
    if (current.order.status !== "open") return false;
    await generateBill.mutateAsync({ orderId: id });
    return true;
  }

  return {
    orderId,
    draft,
    detail: activeDetail,
    open,
    addLine,
    changeQuantity,
    updateLine,
    toggleComplimentary,
    removeLine,
    save,
    bill,
  };
}
