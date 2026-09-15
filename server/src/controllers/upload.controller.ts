import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";

export const handleImageUpload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new HttpError(400, "No image file was uploaded");
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});
