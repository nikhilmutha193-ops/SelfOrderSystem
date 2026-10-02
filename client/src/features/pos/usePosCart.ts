import { useState } from "react";

import { newId } from "../../lib/id";
import type { PosMenu, PosMenuItem, SelectedModifier } from "../../lib/types";
import { usePrintKot } from "../kitchen/queries";
import { ordersApi } from "../orders/api";
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

  function addLine(item: PosMenuItem, quantity: number, modifiers: SelectedModifier[] = [], note = "") {
    setDraft((lines) => {
      const same = lines.find(
        (l) => l.item._id === item._id && l.note === note && sameModifiers(l.modifiers, modifiers)
      );
      if (same) return lines.map((l) => (l === same ? { ...l, quantity: l.quantity + quantity } : l));
      return [...lines, { key: newId(), item, quantity, modifiers, note }];
    });
  }

  function changeQuantity(key: string, delta: number) {
    setDraft((lines) =>
      lines.flatMap((l) =>
        l.key !== key ? [l] : l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }]
      )
    );
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
        const created = await createOrder.mutateAsync({ ...target, sendToKitchen: send, items });
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
    removeLine,
    save,
    bill,
  };
}
