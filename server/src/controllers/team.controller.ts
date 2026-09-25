import { Request, Response } from "express";
import { Types } from "mongoose";

import { asyncHandler } from "../middleware/errorHandler";
import TeamMember from "../models/TeamMember";
import { HttpError } from "../utils/httpError";

function validId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Invalid id");
}

export const listTeam = asyncHandler(async (req: Request, res: Response) => {
  const team = await TeamMember.find({ restaurantId: req.restaurantId }).sort({ sortOrder: 1, createdAt: 1 });
  res.json(team);
});

export const createTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const { role, name, title, bio, photoUrl, sortOrder } = req.body as {
    role?: "owner" | "chef";
    name?: string;
    title?: string;
    bio?: string;
    photoUrl?: string;
    sortOrder?: number;
  };
  if (!role || !["owner", "chef"].includes(role)) throw new HttpError(400, "role must be 'owner' or 'chef'");
  if (!name) throw new HttpError(400, "name is required");

  const member = await TeamMember.create({
    restaurantId: req.restaurantId,
    role,
    name,
    title,
    bio,
    photoUrl,
    sortOrder: sortOrder ?? 0,
    isActive: true,
  });
  res.status(201).json(member);
});

export const updateTeamMember = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { role, name, title, bio, photoUrl, sortOrder } = req.body as {
    role?: "owner" | "chef";
    name?: string;
    title?: string;
    bio?: string;
    photoUrl?: string;
    sortOrder?: number;
  };
  if (role && !["owner", "chef"].includes(role)) throw new HttpError(400, "role must be 'owner' or 'chef'");

  const member = await TeamMember.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    {
      $set: {
        ...(role !== undefined && { role }),
        ...(name !== undefined && { name }),
        ...(title !== undefined && { title }),
        ...(bio !== undefined && { bio }),
        ...(photoUrl !== undefined && { photoUrl }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    },
    { new: true }
  );
  if (!member) throw new HttpError(404, "Team member not found");
  res.json(member);
});

export const setTeamMemberActive = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const { isActive } = req.body as { isActive: boolean };
  const member = await TeamMember.findOneAndUpdate(
    { _id: req.params.id, restaurantId: req.restaurantId },
    { $set: { isActive: !!isActive } },
    { new: true }
  );
  if (!member) throw new HttpError(404, "Team member not found");
  res.json(member);
});

export const deleteTeamMember = asyncHandler(async (req: Request, res: Response) => {
  validId(req.params.id);
  const result = await TeamMember.findOneAndDelete({ _id: req.params.id, restaurantId: req.restaurantId });
  if (!result) throw new HttpError(404, "Team member not found");
  res.status(204).send();
});
