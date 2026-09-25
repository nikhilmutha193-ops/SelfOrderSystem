import QRCode from "qrcode";

export interface QrFrameOptions {
  orderUrl: string;
  tableCode: string;
  restaurantName: string;
  logoUrl?: string;
  address?: string;
  instructionText?: string;
  accentColor?: string;
  showLogo?: boolean;
  showName?: boolean;
  showAddress?: boolean;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 900;
const BORDER = 18;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function resolveUrl(url: string): string {
  return url.startsWith("/") ? `${window.location.origin}${url}` : url;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function buildTableQrFrame(options: QrFrameOptions): Promise<string> {
  const {
    orderUrl,
    tableCode,
    restaurantName,
    logoUrl,
    address,
    instructionText = "Scan to view menu & order",
    accentColor = "#ea580c",
    showLogo = true,
    showName = true,
    showAddress = false,
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = BORDER;
  drawRoundedRect(ctx, BORDER / 2, BORDER / 2, CANVAS_WIDTH - BORDER, CANVAS_HEIGHT - BORDER, 24);
  ctx.stroke();

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 2;
  drawRoundedRect(
    ctx,
    BORDER + 10,
    BORDER + 10,
    CANVAS_WIDTH - (BORDER + 10) * 2,
    CANVAS_HEIGHT - (BORDER + 10) * 2,
    16
  );
  ctx.stroke();

  let cursorY = 70;

  if (showLogo && logoUrl) {
    try {
      const logo = await loadImage(resolveUrl(logoUrl));
      const size = 96;
      const lx = CANVAS_WIDTH / 2 - size / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(CANVAS_WIDTH / 2, cursorY + size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logo, lx, cursorY, size, size);
      ctx.restore();
      cursorY += size + 24;
    } catch {
      // Logo failed to load (e.g. offline/broken URL) - continue without it.
    }
  } else {
    cursorY += 10;
  }

  if (showName) {
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    wrapText(ctx, restaurantName, CANVAS_WIDTH / 2, cursorY + 30, CANVAS_WIDTH - 120, 40);
    cursorY += 70;
  }

  if (showAddress && address) {
    ctx.fillStyle = "#64748b";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "center";
    wrapText(ctx, address, CANVAS_WIDTH / 2, cursorY, CANVAS_WIDTH - 140, 22);
    cursorY += 36;
  }

  const qrDataUrl = await QRCode.toDataURL(orderUrl, {
    width: 420,
    margin: 1,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  const qrImage = await loadImage(qrDataUrl);
  const qrSize = 380;
  const qrX = CANVAS_WIDTH / 2 - qrSize / 2;
  const qrY = cursorY + 20;

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 12);
  ctx.fill();
  ctx.stroke();
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  let textY = qrY + qrSize + 70;
  ctx.fillStyle = accentColor;
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillText(`Table ${tableCode}`, CANVAS_WIDTH / 2, textY);

  textY += 40;
  ctx.fillStyle = "#475569";
  ctx.font = "20px system-ui, sans-serif";
  ctx.fillText(instructionText, CANVAS_WIDTH / 2, textY);

  return canvas.toDataURL("image/png");
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}
