import app from "../src/app";

// Vercel invokes this as a serverless function; an Express app is itself a
// (req, res) handler, so no app.listen() here - see src/index.ts for the
// long-running Docker/local entry point.
export default app;
