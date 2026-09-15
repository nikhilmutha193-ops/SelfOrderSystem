import app from "./app";
import { connectDb } from "./config/db";
import { initBackupScheduler } from "./utils/backupScheduler";

const PORT = process.env.PORT || 5000;

connectDb()
  .then(() => {
    app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
    initBackupScheduler();
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });
