import app from "./app";
import { connectDb } from "./config/db";
import { initBackupScheduler } from "./utils/backupScheduler";
import { describeError, logger } from "./utils/logger";
import { initTableReleaseScheduler } from "./utils/tableReleaseScheduler";

const PORT = process.env.PORT || 5000;

connectDb()
  .then(() => {
    app.listen(PORT, () => logger.info("API listening", { port: PORT }));
    initBackupScheduler();
    initTableReleaseScheduler();
  })
  .catch((err) => {
    logger.error("Failed to connect to MongoDB", describeError(err));
    process.exit(1);
  });
