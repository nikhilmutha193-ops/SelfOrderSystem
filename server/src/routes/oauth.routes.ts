import { Router, urlencoded } from "express";
import { oauthAuthorize, oauthToken, oauthDemoCallback } from "../controllers/oauth.controller";
import { sanitizeRequest } from "../middleware/sanitize";

const router = Router();

// The login form posts application/x-www-form-urlencoded (standard <form>), and the OAuth
// spec (RFC 6749) requires the token endpoint to accept the same - the app-wide parser (see
// app.ts) already handles application/json, so only urlencoded needs adding here. It runs
// after the app-wide sanitizeRequest, so re-run it once this body exists.
router.use(urlencoded({ extended: false }));
router.use(sanitizeRequest);

// Public - authenticated by the admin's own credentials on the login form, not a bearer token.
router.get("/authorize", oauthAuthorize);
router.post("/authorize", oauthAuthorize);
router.post("/token", oauthToken);
router.get("/callback", oauthDemoCallback);

export default router;
