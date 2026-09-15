/**
 * Vercel rejects request bodies over 4.5MB before they reach the API, so large
 * camera/AI-generated images have to be downscaled in the browser first.
 */
const MAX_EDGE = 1920;
const PASSTHROUGH_BYTES = 3.5 * 1024 * 1024;
const QUALITY = 0.85;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file"));
    };
    img.src = url;
  });
}

export async function compressImage(file: File): Promise<File> {
  // GIFs would lose their animation on a canvas round-trip.
  if (file.type === "image/gif") return file;

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  if (scale === 1 && file.size <= PASSTHROUGH_BYTES) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // PNG is kept only when it's small enough; otherwise JPEG saves far more.
  const keepPng = file.type === "image/png" && file.size <= PASSTHROUGH_BYTES;
  const type = keepPng ? "image/png" : "image/jpeg";

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".jpg");
  return new File([blob], name, { type });
}
