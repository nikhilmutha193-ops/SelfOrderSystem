import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendSms } from "../src/utils/sms";

const originalKey = process.env.FAST2SMS_API_KEY;

afterEach(() => {
  process.env.FAST2SMS_API_KEY = originalKey;
  vi.unstubAllGlobals();
});

describe("sendSms", () => {
  it("does nothing when no API key is configured", async () => {
    delete process.env.FAST2SMS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await sendSms("919845000000", "Hello");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Fast2SMS with the number stripped of its 91 prefix", async () => {
    process.env.FAST2SMS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ return: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await sendSms("919845000000", "Your table is confirmed");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.fast2sms.com/dev/bulkV2");
    expect(options.headers.authorization).toBe("test-key");
    expect(JSON.parse(options.body)).toEqual({
      route: "q",
      message: "Your table is confirmed",
      numbers: "9845000000",
    });
  });

  it("passes a non-91-prefixed number through unchanged", async () => {
    process.env.FAST2SMS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ return: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await sendSms("9845000000", "Hi");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).numbers).toBe("9845000000");
  });

  it("never throws when Fast2SMS reports failure or the request itself fails", async () => {
    process.env.FAST2SMS_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ return: false }) })
    );
    await expect(sendSms("919845000000", "Hi")).resolves.toBeUndefined();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    await expect(sendSms("919845000000", "Hi")).resolves.toBeUndefined();
  });
});
