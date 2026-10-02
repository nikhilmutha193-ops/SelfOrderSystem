import { describeError, logger } from "./logger";

/**
 * Fast2SMS's "quick SMS" route (https://www.fast2sms.com/dev/bulkV2, route "q") - no DLT template
 * needed, meant for OTPs/alerts. India-only: `numbers` is a bare 10-digit mobile, no "91" prefix.
 *
 * Silently no-ops (with a log line) when FAST2SMS_API_KEY isn't configured, so callers never need
 * to check whether SMS is turned on, and never throws, so a failed or unconfigured send never
 * breaks the request that triggered it - same "best effort" contract as writeAudit and the event
 * handlers in core/events.ts.
 */
export async function sendSms(phone: string, message: string): Promise<void> {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    // "info", not "debug" - production runs at "info" by default, and a silent skip here looks
    // identical to a silent success unless this is visible in the normal log output.
    logger.info("sms not sent - FAST2SMS_API_KEY is not configured");
    return;
  }
  const numbers = phone.length === 12 && phone.startsWith("91") ? phone.slice(2) : phone;
  try {
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: { authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ route: "q", message, numbers }),
    });
    const body = (await res.json().catch(() => null)) as { return?: boolean } | null;
    if (!res.ok || body?.return === false) {
      logger.error("sms send failed", { numbers, status: res.status, body });
    } else {
      logger.info("sms sent", { numbers });
    }
  } catch (err) {
    logger.error("sms send threw", describeError(err));
  }
}
