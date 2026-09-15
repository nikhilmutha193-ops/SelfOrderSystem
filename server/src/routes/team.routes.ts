import { Router } from "express";
import { listTeam, createTeamMember, updateTeamMember, setTeamMemberActive, deleteTeamMember } from "../controllers/team.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth("admin"), listTeam);
router.post("/", requireAuth("admin"), createTeamMember);
router.put("/:id", requireAuth("admin"), updateTeamMember);
router.patch("/:id/active", requireAuth("admin"), setTeamMemberActive);
router.delete("/:id", requireAuth("admin"), deleteTeamMember);

export default router;
