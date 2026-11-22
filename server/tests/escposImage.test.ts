import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { EscPos } from "../src/utils/escpos";
import { qrBitmap, toBitmap } from "../src/utils/escposImage";

/** A 40 x 20 picture: a black left half and a transparent right half. */
function sample(): Buffer {
  const png = new PNG({ width: 40, height: 20 });
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4;
      const black = x < 20;
      png.data.set(black ? [0, 0, 0, 255] : [255, 255, 255, 0], i);
    }
  return PNG.sync.write(png);
}

describe("printing a logo", () => {
  it("turns a PNG into dots: dark and covered pixels print, transparent ones stay paper", () => {
    const bitmap = toBitmap(sample(), 40)!;
    expect(bitmap).toMatchObject({ widthBytes: 5, height: 20 });
    expect(bitmap.data[0]).toBe(0xff); // the first 8 dots are black
    expect(bitmap.data[4]).toBe(0x00); // the last 8 dots are paper
  });

  it("shrinks a big picture to the width of the paper and ignores files that are not pictures", () => {
    expect(toBitmap(sample(), 20)).toMatchObject({ widthBytes: 3, height: 10 });
    expect(toBitmap(Buffer.from("not a picture"), 100)).toBeNull();
  });

  it("sends the picture with the raster command", () => {
    const bytes = new EscPos(32).image(toBitmap(sample(), 40)!).toBuffer();
    expect(bytes.includes(Buffer.from([0x1d, 0x76, 0x30, 0x00, 5, 0, 20, 0]))).toBe(true);
  });
});

describe("printing the UPI QR code", () => {
  it("makes a square picture that fits the paper, with a quiet border", () => {
    const qr = qrBitmap("upi://pay?pa=shop@upi&pn=Shop&am=158.00&cu=INR&tn=INV%2F26-27%2F000020", 240);
    expect(qr.height).toBeLessThanOrEqual(240);
    expect(qr.widthBytes * 8).toBeGreaterThanOrEqual(qr.height);
    expect(qr.data.subarray(0, qr.widthBytes).every((b) => b === 0)).toBe(true); // the top border is blank
    expect(qr.data.some((b) => b !== 0)).toBe(true);
  });
});
