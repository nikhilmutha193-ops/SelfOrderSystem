import { PNG } from "pngjs";

/** A stretch of text printed in one style. `wide` and `tall` are the ESC/POS size multipliers (1 = normal). */
export interface PreviewRun {
  text: string;
  bold: boolean;
  small: boolean;
  wide: number;
  tall: number;
}

export type PreviewLine =
  | { kind: "text"; align: Align; runs: PreviewRun[] }
  | { kind: "image"; align: Align; width: number; height: number; png: string }
  | { kind: "cut" };

type Align = "left" | "center" | "right";
const ALIGN: Align[] = ["left", "center", "right"];

/**
 * Reads the bytes made for a thermal printer (the ESC/POS subset this app prints) back into lines with their styles,
 * so the settings screens can show what the printer will put on paper. Anything it does not know is skipped.
 */
export function decodeEscPos(bytes: Buffer): PreviewLine[] {
  const lines: PreviewLine[] = [];
  let runs: PreviewRun[] = [];
  let align: Align = "left";
  let bold = false;
  let small = false;
  let wide = 1;
  let tall = 1;
  let text = "";
  let lineAlign: Align = align as Align;

  const flushText = () => {
    if (!text) return;
    runs.push({ text, bold, small, wide, tall });
    text = "";
  };
  const endLine = () => {
    flushText();
    lines.push({ kind: "text", align: lineAlign, runs });
    runs = [];
    lineAlign = align;
  };

  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0x0a) {
      endLine();
      i++;
    } else if (b === 0x1b) {
      const cmd = bytes[i + 1];
      if (cmd === 0x40) i += 2; // initialise
      else if (cmd === 0x61) {
        flushText();
        align = ALIGN[bytes[i + 2]] ?? "left";
        if (runs.length === 0) lineAlign = align;
        i += 3;
      } else if (cmd === 0x45) {
        flushText();
        bold = bytes[i + 2] === 1;
        i += 3;
      } else if (cmd === 0x4d) {
        flushText();
        small = bytes[i + 2] === 1;
        i += 3;
      } else if (cmd === 0x64) {
        if (runs.length || text) endLine();
        for (let n = 0; n < bytes[i + 2]; n++) lines.push({ kind: "text", align, runs: [] });
        i += 3;
      } else if (cmd === 0x70) i += 5; // cash drawer
      else i += 2;
    } else if (b === 0x1d) {
      const cmd = bytes[i + 1];
      if (cmd === 0x21) {
        flushText();
        const n = bytes[i + 2];
        wide = (n >> 4) + 1;
        tall = (n & 0x0f) + 1;
        i += 3;
      } else if (cmd === 0x56) {
        if (runs.length || text) endLine();
        lines.push({ kind: "cut" });
        i += bytes[i + 2] === 65 || bytes[i + 2] === 66 ? 4 : 3;
      } else if (cmd === 0x76 && bytes[i + 2] === 0x30) {
        // Raster picture: GS v 0 m xL xH yL yH data
        if (runs.length || text) endLine();
        const widthBytes = bytes[i + 4] | (bytes[i + 5] << 8);
        const height = bytes[i + 6] | (bytes[i + 7] << 8);
        const data = bytes.subarray(i + 8, i + 8 + widthBytes * height);
        lines.push({ kind: "image", align, width: widthBytes * 8, height, png: bitmapToPng(data, widthBytes, height) });
        i += 8 + widthBytes * height;
      } else if (cmd === 0x28 && bytes[i + 2] === 0x6b) {
        // The printer's own QR command: skip its data (the app prints QR codes as pictures).
        i += 5 + (bytes[i + 3] | (bytes[i + 4] << 8));
      } else i += 2;
    } else {
      if (b >= 0x20 && b < 0x7f) text += String.fromCharCode(b);
      i++;
    }
  }
  if (runs.length || text) endLine();
  return lines;
}

function bitmapToPng(data: Buffer, widthBytes: number, height: number): string {
  const width = widthBytes * 8;
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dark = (data[y * widthBytes + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
      png.data.set(dark ? [0, 0, 0, 255] : [255, 255, 255, 0], (y * width + x) * 4);
    }
  }
  return PNG.sync.write(png).toString("base64");
}
