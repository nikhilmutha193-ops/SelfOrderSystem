import { describe, expect, it } from "vitest";

import { renderKot } from "../src/modules/printing/printing.render";
import { mergeKotLines } from "../src/utils/kotLines";

const line = (over: { total?: number; complimentary?: boolean; foodName?: string; isJain?: boolean; note?: string; modifiers?: { label: string }[] } = {}) => ({
  foodName: "Ghee Idli",
  quantity: 1,
  modifiers: [] as { label: string }[],
  note: "",
  ...over,
});

describe("one line per dish on the kitchen ticket", () => {
  it("joins a paid and a complimentary plate of the same dish into 2 x Ghee Idli", () => {
    const merged = mergeKotLines([line(), line({ complimentary: true, total: 0 })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(2);
  });

  it("keeps different dishes, different choices and different notes apart", () => {
    const merged = mergeKotLines([
      line(),
      line({ foodName: "Vada" }),
      line({ isJain: true }),
      line({ note: "less spicy" }),
      line({ modifiers: [{ label: "Extra ghee" }] }),
    ]);
    expect(merged.map((m) => m.quantity)).toEqual([1, 1, 1, 1, 1]);
  });

  it("keeps the complimentary plate on its own line when prices are shown, so the amounts add up", () => {
    const merged = mergeKotLines([line({ total: 60 }), line({ complimentary: true, total: 0 }), line({ total: 60 })], {
      keepComplimentary: true,
    });
    expect(merged.map((m) => [m.quantity, m.total])).toEqual([
      [2, 120],
      [1, 0],
    ]);
  });

  it("prints the thermal ticket with one 2 x line", () => {
    const bytes = renderKot({
      restaurant: { name: "Cafe", timezone: "Asia/Kolkata", kotSettings: undefined } as never,
      orderLabel: "Counter",
      tokenNumber: 15,
      round: 1,
      items: [line(), line({ complimentary: true })] as never,
      printedAt: new Date(),
      paperWidth: 80,
    }).toString("latin1");
    expect(bytes).toContain("2 x Ghee Idli");
    expect(bytes).not.toContain("1 x Ghee Idli");
  });
});

describe("lines that come from the database", () => {
  it("keeps the dish name and quantity of a Mongoose-like document", () => {
    // Like a Mongoose document: the fields are getters on the prototype, so a spread copies nothing.
    class Doc {
      get foodName() {
        return "Ghee Idli";
      }
      get quantity() {
        return 2;
      }
      get modifiers() {
        return [];
      }
      get note() {
        return "";
      }
      toObject() {
        return { foodName: "Ghee Idli", quantity: 2, modifiers: [], note: "" };
      }
    }
    const doc = new Doc();
    const merged = mergeKotLines([doc]);
    expect(merged[0].foodName).toBe("Ghee Idli");
    expect(merged[0].quantity).toBe(2);
  });
});
