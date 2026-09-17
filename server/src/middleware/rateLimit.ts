import rateLimit from "express-rate-limit";

/**
 * Credential endpoints (admin/chef/table login, password reset) are the prime target
 * for brute force. Cap attempts per IP so guessing a PIN or password over the network
 * isn't free. Successful requests don't count, so a busy real user isn't punished.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please wait a few minutes and try again." },
});

/** A looser ceiling for the rest of the API, to blunt scraping and simple floods. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});
