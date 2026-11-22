import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import QRCode from "qrcode";

/** A black and white picture ready for the printer: one bit per dot, rows padded to whole bytes. */
export interface Bitmap {
  widthBytes: number;
  height: number;
  data: Buffer;
}

/**
 * A QR code as a picture, at most `maxWidth` dots wide, with the usual four-module quiet zone. Printing it as a picture
 * works on every printer that can print a logo, unlike the printer's own QR command, which many models lack.
 */
export function qrBitmap(text: string, maxWidth: number): Bitmap {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const modules = qr.modules.size;
  const quiet = 4;
  const scale = Math.max(1, Math.floor(maxWidth / (modules + quiet * 2)));
  const side = (modules + quiet * 2) * scale;
  const widthBytes = Math.ceil(side / 8);
  const data = Buffer.alloc(widthBytes * side);
  for (let y = 0; y < side; y++) {
    const my = Math.floor(y / scale) - quiet;
    if (my < 0 || my >= modules) continue;
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / scale) - quiet;
      if (mx >= 0 && mx < modules && qr.modules.get(mx, my)) data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { widthBytes, height: side, data };
}

/**
 * Turns a PNG or JPEG into a bitmap `maxWidth` dots wide (or narrower for a tall picture). Transparent areas count as
 * paper, colours become grey and anything darker than the threshold is printed black. Returns null when the file is
 * neither format or cannot be read.
 */
export function toBitmap(file: Buffer, maxWidth: number, maxHeight = maxWidth): Bitmap | null {
  try {
    let width: number;
    let height: number;
    let rgba: Uint8Array;
    if (file.length > 8 && file[0] === 0x89 && file[1] === 0x50) {
      const png = PNG.sync.read(file);
      ({ width, height } = png);
      rgba = png.data;
    } else if (file.length > 3 && file[0] === 0xff && file[1] === 0xd8) {
      const image = jpeg.decode(file, { useTArray: true, maxMemoryUsageInMB: 64 });
      ({ width, height } = image);
      rgba = image.data;
    } else {
      return null;
    }
    if (!width || !height) return null;

    const scale = Math.min(maxWidth / width, maxHeight / height, 1);
    const outWidth = Math.max(1, Math.round(width * scale));
    const outHeight = Math.max(1, Math.round(height * scale));
    const widthBytes = Math.ceil(outWidth / 8);
    const data = Buffer.alloc(widthBytes * outHeight);

    for (let y = 0; y < outHeight; y++) {
      const y0 = Math.floor((y * height) / outHeight);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / outHeight));
      for (let x = 0; x < outWidth; x++) {
        const x0 = Math.floor((x * width) / outWidth);
        const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / outWidth));
        // The average grey of the source pixels this dot covers, over white paper.
        let sum = 0;
        let count = 0;
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++) {
            const i = (sy * width + sx) * 4;
            const alpha = rgba[i + 3] / 255;
            const grey = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
            sum += grey * alpha + 255 * (1 - alpha);
            count++;
          }
        }
        if (sum / count < 150) data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return { widthBytes, height: outHeight, data };
  } catch {
    return null;
  }
}
