import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUriTemplate: string;
  }
}

export default async function setup(project: TestProject) {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  project.provide("mongoUriTemplate", replSet.getUri("__DB__"));
  return async () => {
    await replSet.stop();
  };
}
