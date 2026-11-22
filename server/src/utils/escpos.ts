const ESC = 0x1b;
const GS = 0x1d;

export function toPrinterText(value: string): string {
  return value
    .replace(/₹/g, "Rs.")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

export class EscPos {
  private readonly parts: Buffer[] = [];

  constructor(readonly width: number) {
    this.raw(ESC, 0x40);
  }

  raw(...bytes: number[]): this {
    this.parts.push(Buffer.from(bytes));
    return this;
  }

  text(value: string): this {
    this.parts.push(Buffer.from(toPrinterText(value), "ascii"));
    return this;
  }

  line(value = ""): this {
    return this.text(value).raw(0x0a);
  }

  align(position: "left" | "center" | "right"): this {
    return this.raw(ESC, 0x61, position === "left" ? 0 : position === "center" ? 1 : 2);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  size(large: boolean): this {
    return this.raw(GS, 0x21, large ? 0x11 : 0x00);
  }

  /** small = the printer's narrow font B, large = double width and height, normal = the usual font A. */
  textSize(size: "small" | "normal" | "large"): this {
    return this.raw(ESC, 0x4d, size === "small" ? 1 : 0).raw(GS, 0x21, size === "large" ? 0x11 : 0x00);
  }

  /** How many characters fit on a line at this text size. */
  columns(size: "small" | "normal" | "large"): number {
    return size === "small" ? Math.floor((this.width * 4) / 3) : size === "large" ? Math.floor(this.width / 2) : this.width;
  }

  wrapped(value: string, width = this.width): this {
    for (const chunk of wrap(value, width)) this.line(chunk);
    return this;
  }

  row(left: string, right: string, width = this.width): this {
    const rightText = toPrinterText(right);
    const room = Math.max(width - rightText.length - 1, 8);
    const lines = wrap(left, room);
    lines.forEach((chunk, i) => {
      if (i === lines.length - 1) this.line(chunk.padEnd(width - rightText.length) + rightText);
      else this.line(chunk);
    });
    return this;
  }

  /** One table row: the name (wrapped) on the left, then the quantity and the total in their own right-aligned columns. */
  table(name: string, qty: string, total: string, width = this.width): this {
    const qtyWidth = 4;
    const totalWidth = Math.max(total.length + 1, 9);
    const nameWidth = Math.max(width - qtyWidth - totalWidth, 8);
    const lines = wrap(name, nameWidth - 1);
    lines.forEach((chunk, i) => {
      if (i === 0) this.line(chunk.padEnd(nameWidth) + toPrinterText(qty).padStart(qtyWidth) + toPrinterText(total).padStart(totalWidth));
      else this.line(chunk);
    });
    return this;
  }

  divider(char = "-", width = this.width): this {
    return this.line(char.repeat(width));
  }

  feed(lines = 1): this {
    return this.raw(ESC, 0x64, lines);
  }

  qr(data: string, moduleSize = 6): this {
    const bytes = Buffer.from(data, "utf8");
    const length = bytes.length + 3;
    this.raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize);
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30);
    this.raw(GS, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x31, 0x50, 0x30);
    this.parts.push(bytes);
    return this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
  }

  cut(): this {
    // GS V 66 0 already feeds the paper up to the cutter, so only a little extra is fed before it.
    return this.feed(1).raw(GS, 0x56, 0x42, 0x00);
  }

  openDrawer(): this {
    return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.parts);
  }
}

export function charsPerLine(paperWidth: 58 | 80): number {
  return paperWidth === 58 ? 32 : 48;
}

function wrap(value: string, width: number): string[] {
  const words = toPrinterText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current) lines.push(current);
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      current = "";
      continue;
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
