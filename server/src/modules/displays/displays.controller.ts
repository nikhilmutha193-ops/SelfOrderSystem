import { Request, Response } from "express";

import { getContext } from "../../core/context";
import { parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { HttpError } from "../../utils/httpError";
import {
  createDisplaySchema,
  displayParams,
  publicDisplayParams,
  updateDisplaySchema,
} from "./displays.schema";
import * as displays from "./displays.service";

export const listDisplays = asyncHandler(
  async (req: Request, res: Response) => {
    res.json(await displays.listDisplays(getContext(req)));
  },
);

export const createDisplay = asyncHandler(
  async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await displays.createDisplay(
          getContext(req),
          parse(createDisplaySchema, req.body),
        ),
      );
  },
);

export const updateDisplay = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = parse(displayParams, req.params);
    res.json(
      await displays.updateDisplay(
        getContext(req),
        id,
        parse(updateDisplaySchema, req.body),
      ),
    );
  },
);

export const renewDisplayCode = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = parse(displayParams, req.params);
    res.json(await displays.renewDisplayCode(getContext(req), id));
  },
);

export const deleteDisplay = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = parse(displayParams, req.params);
    await displays.deleteDisplay(getContext(req), id);
    res.status(204).end();
  },
);

export const getPublicDisplay = asyncHandler(
  async (req: Request, res: Response) => {
    // A code of the wrong shape is simply a screen that does not exist.
  const parsed = publicDisplayParams.safeParse(req.params);
  if (!parsed.success) throw new HttpError(404, "This display is not available");
  const { code } = parsed.data;
    // Short cache: a changed slideshow reaches the screens within a minute (they also re-check on their own).
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(await displays.publicDisplay(code));
  },
);
