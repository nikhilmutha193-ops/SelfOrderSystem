import { z } from "zod";

import { blankToUndefined, objectId } from "../../core/validate";

export const kotQueueQuery = z.object({
  tableId: blankToUndefined(objectId()),
});

export const kotPdfParams = z.object({
  orderId: objectId(),
  round: z.coerce
    .number({ error: "Invalid KOT round" })
    .int({ error: "Invalid KOT round" })
    .min(1, { error: "Invalid KOT round" }),
});
