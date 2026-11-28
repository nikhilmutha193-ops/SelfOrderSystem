import { Router } from "express";

import { getLandingPage, getLandingSeoHead } from "../controllers/landing.controller";

const router = Router();

router.get("/", getLandingPage);
router.get("/seo-head", getLandingSeoHead);

export default router;
