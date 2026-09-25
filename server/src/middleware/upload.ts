import multer from "multer";

import { HttpError } from "../utils/httpError";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // Vercel rejects request bodies over 4.5MB before they reach us
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new HttpError(400, "Only JPEG, PNG, WEBP or GIF images are allowed"));
      return;
    }
    cb(null, true);
  },
}).single("image");
