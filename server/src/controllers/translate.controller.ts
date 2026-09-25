import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import { HttpError } from "../utils/httpError";
import { SUPPORTED_LANGS, TargetLang, translateText } from "../utils/translate";

export const translateTexts = asyncHandler(async (req: Request, res: Response) => {
  const { texts, to } = req.body as { texts?: unknown; to?: string };
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string")) {
    throw new HttpError(400, "texts must be an array of strings");
  }
  if (typeof to !== "string" || !SUPPORTED_LANGS.includes(to as TargetLang)) {
    throw new HttpError(400, `to must be one of: ${SUPPORTED_LANGS.join(", ")}`);
  }
  if (texts.length > 20) throw new HttpError(400, "Too many texts in one request");

  const translations = [];
  for (const text of texts as string[]) {
    translations.push(await translateText(text, to as TargetLang));
  }
  res.json({ translations });
});
