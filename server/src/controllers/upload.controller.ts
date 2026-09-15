import { Request, Response } from "express";
import path from "path";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";
import { Folder, PUBLIC_FOLDERS, putObject } from "../utils/objectStore";

const ALLOWED: ReadonlySet<string> = new Set(PUBLIC_FOLDERS);

export const handleImageUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new HttpError(400, "No image file was uploaded");

  // Allowlisted so a crafted value can't escape the prefix or reach a private folder.
  const folder = typeof req.body?.folder === "string" ? req.body.folder : "product";
  if (!ALLOWED.has(folder)) throw new HttpError(400, `Unknown upload folder "${folder}"`);

  const ext = path.extname(req.file.originalname).toLowerCase();
  const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

  const { url } = await putObject(folder as Folder, name, req.file.buffer, req.file.mimetype);
  res.status(201).json({ url });
});
