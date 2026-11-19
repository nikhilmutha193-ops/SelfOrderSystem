// Creates the storage folders for this restaurant (see ensureStorageFolders in objectStore.ts).
//   npm run storage:init
import "dotenv/config";

import { ensureStorageFolders, storageBase } from "./objectStore";

ensureStorageFolders()
  .then(({ created, skipped }) => {
    console.log(`Restaurant folder: ${storageBase() || "(none: RESTAURANT_KEY is not set or not usable)"}`);
    for (const line of created) console.log(`  ready   ${line}`);
    for (const line of skipped) console.log(`  skipped ${line}`);
  })
  .catch((err) => {
    console.error("Could not create the folders:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
