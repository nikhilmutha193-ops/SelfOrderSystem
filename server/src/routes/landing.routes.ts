import { Router } from "express";
import { getLandingPage } from "../controllers/landing.controller";

const router = Router();

router.get("/", getLandingPage);

export default router;
