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

  wrapped(value: string, width = this.width): this {
    for (const chunk of wrap(value, width)) this.line(chunk);
    return this;
  }

  row(left: string, right: string): this {
    const rightText = toPrinterText(right);
    const room = Math.max(this.width - rightText.length - 1, 8);
    const lines = wrap(left, room);
    lines.forEach((chunk, i) => {
      if (i === lines.length - 1) this.line(chunk.padEnd(this.width - rightText.length) + rightText);
      else this.line(chunk);
    });
    return this;
  }

  divider(char = "-"): this {
    return this.line(char.repeat(this.width));
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
    return this.feed(3).raw(GS, 0x56, 0x42, 0x00);
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
