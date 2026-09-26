import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { Request, Response } from "express";

import { asyncHandler } from "../middleware/errorHandler";
import Admin from "../models/Admin";
import OAuthAuthCode from "../models/OAuthAuthCode";
import { HttpError } from "../utils/httpError";
import { nowSeconds, signToken } from "../utils/jwt";
import { comparePassword } from "../utils/password";

interface AuthorizeParams {
  client_id?: unknown;
  redirect_uri?: unknown;
  response_type?: unknown;
  state?: unknown;
  code_challenge?: unknown;
  code_challenge_method?: unknown;
  scope?: unknown;
}

const CODE_TTL_MS = 5 * 60 * 1000;

// 5 minutes - authorization codes are meant to be used immediately
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

function allowedRedirectUris(): string[] {
  return (process.env.OAUTH_ALLOWED_REDIRECT_URIS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedRedirectUri(uri: string): boolean {
  const allowed = allowedRedirectUris();
  // Nothing configured yet - fail closed rather than silently accepting any callback.
  if (allowed.length === 0) return false;
  return allowed.includes(uri);
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

function renderLoginPage(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  error?: string;
}): string {
  const { clientId, redirectUri, state, codeChallenge, codeChallengeMethod, scope, error } = opts;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in to authorize access</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; margin: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
    form { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; width: 100%; max-width: 360px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    h1 { font-size: 18px; margin: 0 0 4px; color: #1e293b; }
    p.sub { font-size: 13px; color: #64748b; margin: 0 0 20px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px; }
    input[type=text], input[type=password] { width: 100%; box-sizing: border-box; padding: 9px 10px; margin-bottom: 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; }
    button { width: 100%; padding: 10px; background: #ea580c; color: #fff; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; }
    .error { background: #fef2f2; color: #b91c1c; font-size: 13px; padding: 8px 10px; border-radius: 8px; margin-bottom: 14px; }
    .client { font-size: 12px; color: #94a3b8; margin-top: 16px; text-align: center; }
  </style>
</head>
<body>
  <form method="post" action="/api/oauth/authorize">
    <h1>Authorize access</h1>
    <p class="sub">Sign in with your admin account to let this application act with your permissions.</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <label for="username">Username</label>
    <input type="text" id="username" name="username" autocomplete="username" required autofocus />
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required />
    <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
    <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
    <input type="hidden" name="state" value="${escapeHtml(state)}" />
    <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}" />
    <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}" />
    <input type="hidden" name="scope" value="${escapeHtml(scope)}" />
    <button type="submit">Sign in &amp; authorize</button>
    <p class="client">Requested by <strong>${escapeHtml(clientId)}</strong></p>
  </form>
</body>
</html>`;
}

function parseAuthorizeParams(q: AuthorizeParams) {
  const clientId = typeof q.client_id === "string" ? q.client_id : "";
  const redirectUri = typeof q.redirect_uri === "string" ? q.redirect_uri : "";
  const responseType = typeof q.response_type === "string" ? q.response_type : "";
  const state = typeof q.state === "string" ? q.state : "";
  const codeChallenge = typeof q.code_challenge === "string" ? q.code_challenge : "";
  const codeChallengeMethod = typeof q.code_challenge_method === "string" ? q.code_challenge_method : "S256";
  const scope = typeof q.scope === "string" ? q.scope : "";
  return { clientId, redirectUri, responseType, state, codeChallenge, codeChallengeMethod, scope };
}

export const oauthAuthorize = asyncHandler(async (req: Request, res: Response) => {
  const source = req.method === "GET" ? req.query : req.body;
  const { clientId, redirectUri, responseType, state, codeChallenge, codeChallengeMethod, scope } =
    parseAuthorizeParams(source as AuthorizeParams);

  if (req.method === "GET" && responseType !== "code") {
    throw new HttpError(400, "Only response_type=code is supported");
  }
  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    throw new HttpError(
      400,
      "Unknown or unregistered redirect_uri. Ask the site owner to add it to OAUTH_ALLOWED_REDIRECT_URIS."
    );
  }
  if (!clientId) throw new HttpError(400, "client_id is required");
  if (codeChallengeMethod !== "S256" || !codeChallenge) {
    throw new HttpError(400, "PKCE is required: code_challenge and code_challenge_method=S256");
  }

  if (req.method === "GET") {
    res.type("html").send(renderLoginPage({ clientId, redirectUri, state, codeChallenge, codeChallengeMethod, scope }));
    return;
  }

  // POST: verify the admin's credentials, then hand back an authorization code instead of a token.
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const admin = await Admin.findOne({ restaurantId: req.restaurantId, username });
  if (!admin || !(await comparePassword(password, admin.passwordHash))) {
    res
      .status(401)
      .type("html")
      .send(
        renderLoginPage({
          clientId,
          redirectUri,
          state,
          codeChallenge,
          codeChallengeMethod,
          scope,
          error: "Invalid username or password.",
        })
      );
    return;
  }

  const code = randomBytes(32).toString("base64url");
  await OAuthAuthCode.create({
    code,
    adminId: admin._id,
    restaurantId: req.restaurantId,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod: "S256",
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  res.redirect(redirect.toString());
});

export const oauthToken = asyncHandler(async (req: Request, res: Response) => {
  const grantType = req.body?.grant_type;
  if (grantType !== "authorization_code") {
    throw new HttpError(400, "Only grant_type=authorization_code is supported");
  }
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const redirectUri = typeof req.body?.redirect_uri === "string" ? req.body.redirect_uri : "";
  const codeVerifier = typeof req.body?.code_verifier === "string" ? req.body.code_verifier : "";
  if (!code || !redirectUri || !codeVerifier) {
    throw new HttpError(400, "code, redirect_uri and code_verifier are required");
  }

  const record = await OAuthAuthCode.findOne({ code });
  if (!record || record.used || record.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, "Invalid, expired or already-used authorization code");
  }
  if (record.redirectUri !== redirectUri) {
    throw new HttpError(400, "redirect_uri does not match the one used to request this code");
  }

  // PKCE check: SHA-256(code_verifier), base64url, must equal the stored code_challenge.
  const expectedChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const a = Buffer.from(expectedChallenge);
  const b = Buffer.from(record.codeChallenge);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(400, "code_verifier does not match code_challenge");
  }

  // Single-use: mark it spent so a captured/replayed code can't be redeemed twice.
  record.used = true;
  await record.save();

  const admin = await Admin.findById(record.adminId);
  if (!admin) throw new HttpError(401, "This admin account no longer exists");

  const accessToken = signToken({
    role: "admin",
    restaurantId: record.restaurantId.toString(),
    id: admin._id.toString(),
    tv: admin.tokenVersion ?? 0,
    sst: nowSeconds(),
  });

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresInSeconds(ACCESS_TOKEN_EXPIRES_IN),
    scope: "admin",
  });
});

function expiresInSeconds(expiresIn: string): number {
  const match = /^(\d+)([smhd])?$/.exec(expiresIn.trim());
  if (!match) return 28800; // 8h fallback
  const n = Number(match[1]);
  const unit = match[2] || "s";
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
  return n * mult;
}

export const oauthDemoCallback = asyncHandler(async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const error = typeof req.query.error === "string" ? req.query.error : "";
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8" /><title>OAuth callback (demo)</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#1e293b}code{background:#f1f5f9;padding:2px 6px;border-radius:4px}</style>
</head><body>
<h1>OAuth callback received</h1>
${error ? `<p style="color:#b91c1c">error: <code>${escapeHtml(error)}</code></p>` : ""}
<p>code: <code>${escapeHtml(code) || "(none)"}</code></p>
<p>state: <code>${escapeHtml(state) || "(none)"}</code></p>
<p>This is a demo endpoint for testing the OAuth flow directly; a real client exchanges this code for a token at <code>POST /api/oauth/token</code> instead of displaying it.</p>
</body></html>`);
});
