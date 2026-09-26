import { beforeAll, describe, expect, it } from "vitest";

import { ANONYMOUS_LIMIT_PER_MINUTE, PRINCIPAL_LIMIT_PER_MINUTE } from "../src/middleware/rateLimit";
import { signToken } from "../src/utils/jwt";
import { api, bearer, createWorld, World } from "./fixtures";

let world: World;

beforeAll(async () => {
  world = await createWorld();
});

function deviceToken(n: number): string {
  return signToken({
    role: "table",
    restaurantId: world.restaurantId,
    id: world.tableIds[0],
    tableId: world.tableIds[0],
    sessionId: `device-${n}`,
  });
}

describe("rate limits on shared restaurant Wi-Fi", () => {
  it("lets 30 devices behind one IP poll past the old per-IP limit", async () => {
    const statuses: number[] = [];
    for (let round = 0; round < 12; round++) {
      const batch = await Promise.all(
        Array.from({ length: 30 }, (_, n) =>
          api()
            .get("/api/orders/kot/queue")
            .set(bearer(deviceToken(n)))
        )
      );
      statuses.push(...batch.map((res) => res.status));
    }
    expect(statuses).toHaveLength(360);
    expect(statuses).not.toContain(429);
  });

  it("still limits a single device that floods the API", async () => {
    const token = deviceToken(999);
    let limited = 0;
    for (let i = 0; i < PRINCIPAL_LIMIT_PER_MINUTE + 5; i += 25) {
      const batch = await Promise.all(
        Array.from({ length: 25 }, () => api().get("/api/orders/kot/queue").set(bearer(token)))
      );
      limited += batch.filter((res) => res.status === 429).length;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it("limits anonymous traffic by IP address", async () => {
    let limited = 0;
    for (let i = 0; i < ANONYMOUS_LIMIT_PER_MINUTE + 25; i += 25) {
      const batch = await Promise.all(Array.from({ length: 25 }, () => api().get("/api/menu")));
      limited += batch.filter((res) => res.status === 429).length;
    }
    expect(limited).toBeGreaterThan(0);
  });
});
