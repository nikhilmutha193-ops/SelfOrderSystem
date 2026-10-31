import { randomBytes } from "crypto";

import { RequestContext } from "../../core/context";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { DisplaysRepository, findDisplayByCode } from "./displays.repository";
import { CreateDisplayInput, UpdateDisplayInput } from "./displays.schema";

const newCode = () => randomBytes(12).toString("base64url");

const isDuplicateName = (err: unknown) =>
  (err as { code?: number }).code === 11000;

export async function listDisplays(ctx: RequestContext) {
  return new DisplaysRepository(ctx.restaurantId).list();
}

export async function createDisplay(
  ctx: RequestContext,
  input: CreateDisplayInput,
) {
  try {
    const display = await new DisplaysRepository(ctx.restaurantId).create({
      ...input,
      code: newCode(),
    });
    await writeAudit(ctx, "display.create", `Added display "${display.name}"`);
    return display;
  } catch (err) {
    if (isDuplicateName(err))
      throw new HttpError(409, "A display with that name already exists");
    throw err;
  }
}

export async function updateDisplay(
  ctx: RequestContext,
  id: string,
  input: UpdateDisplayInput,
) {
  const repo = new DisplaysRepository(ctx.restaurantId);
  const display = await repo.find(id);
  if (!display) throw new HttpError(404, "Display not found");
  display.set(input);
  try {
    await display.save();
  } catch (err) {
    if (isDuplicateName(err))
      throw new HttpError(409, "A display with that name already exists");
    throw err;
  }
  await writeAudit(ctx, "display.update", `Changed display "${display.name}"`);
  return display;
}

/** A new address for the screen, for when the old link got out. The screens using the old one go blank. */
export async function renewDisplayCode(ctx: RequestContext, id: string) {
  const display = await new DisplaysRepository(ctx.restaurantId).find(id);
  if (!display) throw new HttpError(404, "Display not found");
  display.code = newCode();
  await display.save();
  await writeAudit(
    ctx,
    "display.renew",
    `Created a new link for display "${display.name}"`,
  );
  return display;
}

export async function deleteDisplay(ctx: RequestContext, id: string) {
  const removed = await new DisplaysRepository(ctx.restaurantId).remove(id);
  if (!removed) throw new HttpError(404, "Display not found");
  await writeAudit(ctx, "display.delete", `Deleted display "${removed.name}"`);
}

/** What a screen needs, for anyone with its code: images and settings only. */
export async function publicDisplay(code: string) {
  const display = await findDisplayByCode(code);
  if (!display || !display.active)
    throw new HttpError(404, "This display is not available");
  return {
    name: display.name,
    intervalSeconds: display.intervalSeconds,
    transition: display.transition,
    fit: display.fit,
    showCaptions: display.showCaptions,
    updatedAt: display.updatedAt,
    slides: display.slides.map((s) => ({
      url: s.url,
      caption: s.caption ?? "",
      seconds: s.seconds ?? display.intervalSeconds,
    })),
  };
}
