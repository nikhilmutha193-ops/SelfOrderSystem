import { beforeAll, describe, expect, it } from "vitest";

import { api, bearer, createWorld, loginAdmin, seatTable } from "./fixtures";

let owner: string;

beforeAll(async () => {
  await createWorld();
  owner = await loginAdmin();
});

describe("table and staff chat", () => {
  it("tracks unread messages for staff until they open the conversation", async () => {
    const { token, orderId } = await seatTable(1, "Chatty");

    const empty = await api().post(`/api/orders/${orderId}/chat`).set(bearer(token)).send({ message: "   " });
    expect(empty.body.message).toBe("message is required");

    const sent = await api()
      .post(`/api/orders/${orderId}/chat`)
      .set(bearer(token))
      .send({ message: "  Water please  " });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ message: "Water please", senderRole: "table", senderName: "Chatty" });

    const active = await api().get("/api/orders/chat/active").set(bearer(owner));
    expect(active.body[0]).toMatchObject({ lastMessage: "Water please", unreadCount: 1 });

    const thread = await api().get(`/api/orders/${orderId}/chat`).set(bearer(owner));
    expect(thread.body).toHaveLength(1);
    const after = await api().get("/api/orders/chat/active").set(bearer(owner));
    expect(after.body[0].unreadCount).toBe(0);

    const reply = await api().post(`/api/orders/${orderId}/chat`).set(bearer(owner)).send({ message: "Coming" });
    expect(reply.body).toMatchObject({ senderRole: "admin", senderName: "Restaurant" });
  });

  it("marks everything read and deletes messages by id", async () => {
    const { token, orderId } = await seatTable(2, "Second");
    await api().post(`/api/orders/${orderId}/chat`).set(bearer(token)).send({ message: "Bill please" });

    const readAll = await api().patch("/api/orders/chat/read-all").set(bearer(owner));
    expect(readAll.body).toEqual({ message: "All messages marked as read", updated: 1 });

    const messages = await api().get(`/api/orders/${orderId}/chat`).set(bearer(owner));
    expect((await api().delete("/api/orders/chat/bad").set(bearer(owner))).status).toBe(400);
    expect(
      (
        await api()
          .delete(`/api/orders/chat/${"b".repeat(24)}`)
          .set(bearer(owner))
      ).status
    ).toBe(404);
    const deleted = await api().delete(`/api/orders/chat/${messages.body[0]._id}`).set(bearer(owner));
    expect(deleted.body).toEqual({ message: "Message deleted" });
  });
});
