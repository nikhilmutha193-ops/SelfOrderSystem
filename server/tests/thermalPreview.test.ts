import { beforeAll, describe, expect, it } from "vitest";

import { decodeEscPos } from "../src/utils/escposPreview";
import { EscPos } from "../src/utils/escpos";
import { api, bearer, createWorld, loginAdmin } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

type Line = { kind: string; align?: string; runs?: { text: string; bold: boolean; wide: number; tall: number; small: boolean }[]; png?: string };
const textOf = (lines: Line[]) => lines.filter((l) => l.kind === "text").map((l) => (l.runs ?? []).map((r) => r.text).join(""));

describe("reading printer bytes back into styled lines", () => {
  it("keeps alignment, bold, sizes, feeds and the cut", () => {
    const p = new EscPos(32);
    p.align("center").textSize("large").bold(true).line("TOKEN 12").bold(false).textSize("medium").line("Tall");
    p.align("left").textSize("small").line("tiny").textSize("normal").feed(1).line("end").cut();
    const lines = decodeEscPos(p.toBuffer()) as Line[];
    expect(lines[0]).toMatchObject({ kind: "text", align: "center" });
    expect(lines[0].runs![0]).toMatchObject({ text: "TOKEN 12", bold: true, wide: 2, tall: 2 });
    expect(lines[1].runs![0]).toMatchObject({ text: "Tall", bold: false, wide: 1, tall: 2 });
    expect(lines[2]).toMatchObject({ align: "left" });
    expect(lines[2].runs![0]).toMatchObject({ text: "tiny", small: true });
    expect(lines.some((l) => l.kind === "cut")).toBe(true);
  });
});

describe("thermal preview in the settings", () => {
  it("shows the kitchen ticket as the printer prints it, per paper", async () => {
    const p58 = await api().post("/api/restaurant/kot-preview-thermal").set(bearer(owner)).send({ paper: "p58" });
    expect(p58.status).toBe(200);
    expect(p58.body.columns).toBe(32);
    const text = textOf(p58.body.lines);
    expect(text.some((t) => t.includes("TOKEN 12"))).toBe(true);
    expect(text.some((t) => t.includes("Paneer Butter Masala"))).toBe(true);
    const p80 = await api().post("/api/restaurant/kot-preview-thermal").set(bearer(owner)).send({ paper: "p80" });
    expect(p80.body.columns).toBe(48);
  });

  it("uses the unsaved settings, and shows an unpaid invoice with its table, the amount payable and the QR", async () => {
    const res = await api()
      .post("/api/restaurant/invoice-preview-thermal")
      .set(bearer(owner))
      .send({ paper: "p80", invoiceSettings: { layouts: { p80: { show: { upiQr: true } } } } });
    expect(res.status).toBe(200);
    const text = textOf(res.body.lines);
    expect(text.some((t) => t.startsWith("Invoice No:"))).toBe(true);
    expect(text.some((t) => t.includes("Amount Payable"))).toBe(true);
    expect(text.some((t) => /^Scan to pay Rs\.\d/.test(t))).toBe(true);
    expect(res.body.lines.some((l: Line) => l.kind === "image" && l.png)).toBe(true);

    const noQr = await api()
      .post("/api/restaurant/invoice-preview-thermal")
      .set(bearer(owner))
      .send({ paper: "p80", invoiceSettings: { layouts: { p80: { show: { upiQr: false } } } } });
    expect(noQr.body.lines.some((l: Line) => l.kind === "image")).toBe(false);
    expect((await api().post("/api/restaurant/kot-preview-thermal").send({})).status).toBe(401);
  });
});
