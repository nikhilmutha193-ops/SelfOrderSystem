import { Router } from "express";

import {
  createTeamMember,
  deleteTeamMember,
  listTeam,
  setTeamMemberActive,
  updateTeamMember,
} from "../controllers/team.controller";
import { requireAuth, requireModule } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth("admin"), requireModule("team"), listTeam);
router.post("/", requireAuth("admin"), requireModule("team"), createTeamMember);
router.put("/:id", requireAuth("admin"), requireModule("team"), updateTeamMember);
router.patch("/:id/active", requireAuth("admin"), requireModule("team"), setTeamMemberActive);
router.delete("/:id", requireAuth("admin"), requireModule("team"), deleteTeamMember);

export default router;
