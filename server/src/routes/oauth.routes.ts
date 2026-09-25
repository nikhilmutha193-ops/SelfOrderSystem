import { Router, urlencoded } from "express";

import { oauthAuthorize, oauthDemoCallback, oauthToken } from "../controllers/oauth.controller";
import { sanitizeRequest } from "../middleware/sanitize";

const router = Router();

router.use(urlencoded({ extended: false }));
router.use(sanitizeRequest);

// Public - authenticated by the admin's own credentials on the login form, not a bearer token.
router.get("/authorize", oauthAuthorize);
router.post("/authorize", oauthAuthorize);
router.post("/token", oauthToken);
router.get("/callback", oauthDemoCallback);

export default router;
