import path from "path";

import { RequestContext } from "../../core/context";
import { HttpError } from "../../utils/httpError";
import { getObject, putObject } from "../../utils/objectStore";
import { getOwnedOrder } from "./orders.access";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Keeps a screenshot of a UPI payment in private storage (never the public bucket) and returns its key. */
export async function savePaymentProof(
  ctx: RequestContext,
  orderId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string } | undefined
) {
  if (!file) throw new HttpError(400, "No image was uploaded");
  const order = await getOwnedOrder(ctx, orderId);
  if (order.status !== "open" && order.status !== "billed") {
    throw new HttpError(409, "A payment screenshot can only be added while the order is unpaid");
  }
  const fromType = Object.entries(TYPES).find(([, type]) => type === file.mimetype)?.[0] ?? ".jpg";
  const name = `${order._id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${fromType}`;
  await putObject("proofs", name, file.buffer, file.mimetype);
  return { proofKey: name };
}

/** Staff open a saved screenshot from the order page. */
export async function readPaymentProof(ctx: RequestContext, orderId: string, name: string) {
  const order = await getOwnedOrder(ctx, orderId);
  const type = TYPES[path.extname(name).toLowerCase()];
  const proof = order.payments.some((p) => p.proofKey === name);
  // A just-uploaded screenshot is allowed to be previewed before the order is settled.
  if (!type || !/^[A-Za-z0-9-]+\.[a-z]+$/.test(name) || !name.startsWith(`${order._id}-`) || (!proof && order.status === "closed")) {
    throw new HttpError(404, "Screenshot not found");
  }
  try {
    return { data: await getObject("proofs", name), type };
  } catch {
    throw new HttpError(404, "Screenshot not found");
  }
}
