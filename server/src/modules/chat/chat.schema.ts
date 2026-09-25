import { z } from "zod";

import { objectId } from "../../core/validate";

export const messageIdParams = z.object({ messageId: objectId() });

export const sendMessageSchema = z.object({
  message: z.string({ error: "message is required" }).trim().min(1, { error: "message is required" }),
});
