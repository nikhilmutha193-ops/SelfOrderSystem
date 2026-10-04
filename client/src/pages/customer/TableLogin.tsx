import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import QrScanner from "qr-scanner";

import { todayIst } from "../../lib/istDate";
import type { BookingAvailabilitySlot, BookingSettings, TableLoginSettings, TableRow } from "../../lib/types";
import { useTableSession } from "../../lib/useTableSession";
import {
  activateStoredAuth,
  api,
  clearExpiredFlag,
  extractErrorMessage,
  setActiveAuth,
  storeToken,
  wasSessionExpired,
} from "../../shared/api/client";

import "../../styles/order.css";

/**
 * The printed table QR encodes a full URL like ".../order?t=<token>" (see admin QrCodes.tsx).
 * A camera scan decodes that same string, so pull the "t" param back out of it - falling back
 * to treating the whole scanned text as the token itself, in case it's ever just the bare value.
 */
function extractQrTokenFromScan(text: string): string {
  try {
    const url = new URL(text, window.location.origin);
    const t = url.searchParams.get("t");
    if (t) return t;
  } catch {
    /* not a parseable URL - fall through to the raw-text fallback below */
  }
  return text.trim();
}

/** "14:30" -> "2:30 PM", for the slot picker boxes. */
function formatSlotLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function TableLogin() {
  const [searchParams] = useSearchParams();
  const urlQrToken = searchParams.get("t") || "";
  const [sessionExpired] = useState(() => searchParams.get("expired") === "1" || wasSessionExpired("table"));
  const [code, setCode] = useState(() => searchParams.get("code") || "");
  const [password, setPassword] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [available, setAvailable] = useState<TableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState<{ name: string; logoUrl: string }>({ name: "Benne Kaffi", logoUrl: "" });
  const [needsOrderChoice, setNeedsOrderChoice] = useState(false);
  // In-page camera QR scanning, as an alternative to arriving via a scanned-elsewhere link
  // (?t=) or typing the code+PIN by hand. Once a scan succeeds, its token is kept here and
  // treated exactly like a URL-provided one everywhere else (retry, the continue/new-order
  // choice, etc.) via `qrToken` below - only the *source* of the token differs.
  const [scannedToken, setScannedToken] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [cameraAvailable, setCameraAvailable] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const navigate = useNavigate();
  const session = useTableSession();
  const qrToken = urlQrToken || scannedToken;

  // Prebooking - a guest can reserve a table for a later time slot without needing to be at a
  // table (or logged in) at all. Staff then confirm it and assign a table from the admin side.
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bkName, setBkName] = useState("");
  const [bkPhone, setBkPhone] = useState("");
  const [bkParty, setBkParty] = useState(2);
  const [bkDate, setBkDate] = useState(() => todayIst());
  const [bkSlot, setBkSlot] = useState("");
  const [bkSlots, setBkSlots] = useState<BookingAvailabilitySlot[]>([]);
  const [bkSlotsLoading, setBkSlotsLoading] = useState(false);
  const [bkError, setBkError] = useState<string | null>(null);
  const [bkSubmitting, setBkSubmitting] = useState(false);
  const [bkDone, setBkDone] = useState(false);
  // Defaults to true so the button doesn't flash away then back while this loads.
  const [allowQrScan, setAllowQrScan] = useState(true);

  useEffect(() => {
    api
      .get<{ name?: string; logoUrl?: string; tableLoginSettings?: TableLoginSettings }>("/restaurant/public")
      .then((res) => {
        setBrand({ name: res.data.name || "Benne Kaffi", logoUrl: res.data.logoUrl || "" });
        setAllowQrScan(res.data.tableLoginSettings?.allowQrScan ?? true);
      })
      .catch(() => {});
  }, []);

  // Camera access (getUserMedia/enumerateDevices) only exists in a "secure context" - HTTPS,
  // or the special case of "localhost". Loaded over plain HTTP via a LAN IP (e.g. a phone
  // opening the Docker deployment's http://192.168.x.x:8080 during local testing), the browser
  // doesn't expose navigator.mediaDevices at all, so QrScanner.hasCamera() harmlessly resolves
  // to false regardless of whether a camera actually exists - the button then just vanishes
  // with no explanation ("not able to see the QR scan option"). Distinguish that case so the
  // guest (or whoever's testing it) sees why, instead of a silently missing button.
  const insecureContext = typeof window !== "undefined" && !window.isSecureContext;

  // Only offer "Scan QR code" where a camera can plausibly exist - avoids a button that would
  // just fail on a desktop with no webcam.
  useEffect(() => {
    if (insecureContext) return;
    QrScanner.hasCamera()
      .then(setCameraAvailable)
      .catch(() => setCameraAvailable(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const OWN_TABLE_OCCUPIED_MESSAGE = "You already have an order in progress at this table";

  async function attemptLogin(
    opts: { startNewOrder?: boolean; continueOrder?: boolean; qrTokenOverride?: string } = {}
  ) {
    const tokenToUse = opts.qrTokenOverride ?? qrToken;
    setError(null);
    setNeedsOrderChoice(false);
    setLoading(true);
    try {
      const res = await api.post("/auth/table/login", {
        ...(tokenToUse ? { token: tokenToUse } : { code, password }),
        ...(session.tableId ? { currentTableId: session.tableId } : {}),
        ...(opts.startNewOrder ? { startNewOrder: true } : {}),
        ...(opts.continueOrder ? { continueOrder: true } : {}),
      });
      storeToken("table", res.data.token);
      setActiveAuth({ role: "table", token: res.data.token });
      try {
        localStorage.setItem("selforder_table_code", res.data.table?.code || code);
      } catch {
        /* ignore */
      }
      navigate("/order/details");
    } catch (err) {
      const message = extractErrorMessage(err);
      if (message === OWN_TABLE_OCCUPIED_MESSAGE) {
        // Own table, still occupied - let the guest choose rather than guessing.
        setNeedsOrderChoice(true);
        setLoading(false);
        return;
      }
      if (tokenToUse && session.tableId) {
        navigate(session.orderId ? "/order/menu" : "/order/details", { replace: true });
        return;
      }
      setError(message);
      setLoading(false);
    }
  }

  function continueExistingOrder() {
    if (session.tableId) {
      navigate(session.orderId ? "/order/menu" : "/order/details", { replace: true });
      return;
    }
    attemptLogin({ continueOrder: true });
  }

  function stopScanner() {
    qrScannerRef.current?.stop();
    qrScannerRef.current?.destroy();
    qrScannerRef.current = null;
  }

  function closeScanner() {
    stopScanner();
    setScannerOpen(false);
  }

  function openScanner() {
    setScannerError(null);
    setError(null);
    setScannerOpen(true);
  }

  // Starts the camera once the <video> element for it exists (i.e. once scannerOpen renders
  // the overlay), and always tears it down again on close/unmount - a live camera stream left
  // running would keep draining the guest's battery and showing the "camera in use" indicator.
  useEffect(() => {
    if (!scannerOpen || !videoRef.current) return;
    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        const token = extractQrTokenFromScan(result.data);
        closeScanner();
        setScannedToken(token);
        attemptLogin({ qrTokenOverride: token });
      },
      {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        onDecodeError: () => {
          /* fires continuously while no code is in frame - not a real error */
        },
      }
    );
    qrScannerRef.current = scanner;
    scanner.start().catch(() => {
      setScannerError("Couldn't access the camera. Check your browser's camera permission and try again.");
    });
    return stopScanner;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerOpen]);

  useEffect(() => {

    clearExpiredFlag("table");
    const token = activateStoredAuth("table");

    if (qrToken) {
      attemptLogin();
      return;
    }

    if (token && !sessionExpired) {
      if (session.orderId) navigate("/order/menu", { replace: true });
      else if (session.tableId) navigate("/order/details", { replace: true });
      return;
    }

    api
      .get<TableRow[]>("/tables/available")
      .then((res) => setAvailable(res.data))
      .catch(() => setAvailable([]));
    api
      .get<BookingSettings>("/bookings/public/settings")
      .then((res) => setBookingSettings(res.data))
      .catch(() => setBookingSettings(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload the slot list whenever the dialog is open and the chosen date changes - a slot that
  // was free a moment ago may already be gone by the time the guest picks it.
  useEffect(() => {
    if (!bookingOpen) return;
    setBkSlotsLoading(true);
    setBkSlot("");
    api
      .get<BookingAvailabilitySlot[]>("/bookings/public/availability", { params: { date: bkDate } })
      .then((res) => setBkSlots(res.data))
      .catch(() => setBkSlots([]))
      .finally(() => setBkSlotsLoading(false));
  }, [bookingOpen, bkDate]);

  function openBooking() {
    setBkError(null);
    setBkDone(false);
    setBookingOpen(true);
  }

  function closeBooking() {
    setBookingOpen(false);
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    setBkError(null);
    if (!bkSlot) {
      setBkError("Choose a time slot");
      return;
    }
    setBkSubmitting(true);
    try {
      await api.post("/bookings/public", {
        customerName: bkName.trim(),
        phone: bkPhone.trim(),
        partySize: bkParty,
        bookingDate: bkDate,
        slotStart: bkSlot,
      });
      setBkDone(true);
    } catch (err) {
      setBkError(extractErrorMessage(err));
    } finally {
      setBkSubmitting(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    attemptLogin();
  }

  return (
    <div className="order-page">
      <header className="order-header">
        <div className="container order-header__inner">
          <a className="order-header__brand" href="/">
            {brand.logoUrl ? (
              <img className="order-header__logo" src={brand.logoUrl} alt="" width={40} height={40} />
            ) : (
              <span
                className="order-header__logo"
                aria-hidden
                style={{ display: "grid", placeItems: "center", background: "var(--color-primary-tint)", fontSize: 20 }}
              >
                ☕
              </span>
            )}
            <span className="order-header__name">{brand.name}</span>
          </a>
          <a className="order-header__back" href="/">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Back to site
          </a>
        </div>
      </header>

      <main className="order">
        <div className="order__layout">
          <aside className="order__aside">
            {brand.logoUrl ? (
              <img className="order__aside-art order__aside-art--logo" src={brand.logoUrl} alt="" aria-hidden />
            ) : (
              <div className="order__aside-art" aria-hidden>
                ☕
              </div>
            )}
            <div className="order__aside-copy">
              <p className="order__aside-eyebrow">Dine-in ordering</p>
              <h2 className="order__aside-title">Order from your table</h2>
              <p className="order__aside-text">
                Sign in with the code on your table and we'll bring your kaffi and dosas straight to you.
              </p>
              <ul className="order__perks">
                <li className="order__perk">No queue, no waving for the waiter</li>
                <li className="order__perk">Live menu with today's specials</li>
                <li className="order__perk">Pay at the table when you're done</li>
              </ul>
            </div>
          </aside>

          <section className="order__panel">
            <form className="order-form" onSubmit={submit} noValidate>
              <ol className="stepper" aria-label="Progress">
                <li className="stepper__step stepper__step--active" aria-current="step">
                  <span className="stepper__num" aria-hidden>
                    1
                  </span>
                  <span className="stepper__label">Your table</span>
                </li>
                <li className="stepper__step">
                  <span className="stepper__num" aria-hidden>
                    2
                  </span>
                  <span className="stepper__label">Your visit</span>
                </li>
              </ol>

              <h1 className="step__title">Welcome</h1>
              <p className="step__lead">Enter your table code and PIN to start ordering.</p>

              {sessionExpired && (
                <p className="order-note order-note--warn">
                  Your session has ended. Please scan the QR code again or sign in to continue.
                </p>
              )}
              {qrToken && !error && !needsOrderChoice && (
                <p className="order-note order-note--info">Table identified from QR code — signing you in…</p>
              )}
              {error && <p className="order-note order-note--error">{error}</p>}

              {needsOrderChoice && (
                <div className="order-choice">
                  <p className="order-note order-note--info">
                    You already have an order in progress at this table. Would you like to continue it, or start a new
                    order?
                  </p>
                  <div className="order-choice__actions">
                    <button
                      className="btn btn--primary btn--lg btn--block"
                      type="button"
                      onClick={continueExistingOrder}
                      disabled={loading}
                    >
                      Continue my order
                    </button>
                    <button
                      className="btn btn--secondary btn--lg btn--block"
                      type="button"
                      onClick={() => attemptLogin({ startNewOrder: true })}
                      disabled={loading}
                    >
                      {loading ? "Starting…" : "Start a new order"}
                    </button>
                  </div>
                </div>
              )}

              {!qrToken && !needsOrderChoice && (
                <>
                  {allowQrScan && cameraAvailable && (
                    <>
                      <button type="button" className="btn btn--primary btn--lg btn--block" onClick={openScanner}>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          style={{ width: 20, height: 20 }}
                        >
                          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                          <rect x="7" y="7" width="10" height="10" rx="1" />
                        </svg>
                        Scan table QR code
                      </button>
                      <p className="field__divider">or enter your table code and PIN</p>
                    </>
                  )}
                  {allowQrScan && insecureContext && (
                    <p className="order-note order-note--warn">
                      Camera scanning needs a secure (https) connection, so it isn't available here - enter your
                      table code and PIN below instead.
                    </p>
                  )}

                  <div className="field">
                    <label className="field__label" htmlFor="table-code">
                      Table code
                    </label>
                    <input
                      className="field__input field__input--code"
                      id="table-code"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder="e.g. tbl1"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                    />
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor="pin">
                      PIN
                    </label>
                    <div className="field__pin">
                      <input
                        className="field__input field__input--pin"
                        id="pin"
                        type={showPin ? "text" : "password"}
                        inputMode="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        autoComplete="one-time-code"
                        placeholder="e.g. A1B2"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        className="field__toggle"
                        type="button"
                        aria-label={showPin ? "Hide PIN" : "Show PIN"}
                        aria-pressed={showPin}
                        onClick={() => setShowPin((v) => !v)}
                      >
                        {showPin ? (
                          <svg
                            className="field__toggle-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                            <path d="M1 1l22 22" />
                          </svg>
                        ) : (
                          <svg
                            className="field__toggle-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="field__hint">The PIN is printed on the card on your table.</p>
                  </div>

                  <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </button>

                  {available.length > 0 && (
                    <div className="tables">
                      <div className="tables__head">
                        <p className="tables__title">Available tables</p>
                        <p className="tables__hint">Tap to fill in your code</p>
                      </div>
                      <ul className="tables__list" aria-label="Available tables">
                        {available.map((t) => (
                          <li key={t._id}>
                            <button type="button" className="table-chip" onClick={() => setCode(t.code)}>
                              <span className="table-chip__code">{t.code}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {bookingSettings?.enabled && (
                    <>
                      <p className="field__divider">or</p>
                      <button type="button" className="btn btn--secondary btn--lg btn--block" onClick={openBooking}>
                        Reserve a table for later
                      </button>
                    </>
                  )}
                </>
              )}

              {qrToken && error && !needsOrderChoice && (
                <button
                  className="btn btn--primary btn--lg btn--block"
                  type="button"
                  onClick={() => attemptLogin()}
                  disabled={loading}
                >
                  {loading ? "Signing in…" : "Try again"}
                </button>
              )}
            </form>
          </section>
        </div>
      </main>

      <footer className="order-footer">
        <p className="order-footer__copy">
          © {new Date().getFullYear()} {brand.name} · Taste of Bengaluru
        </p>
      </footer>

      {scannerOpen && (
        <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label="Scan table QR code">
          <div className="scanner-overlay__inner">
            <div className="scanner-overlay__head">
              <p className="scanner-overlay__title">Scan the QR code on your table</p>
              <button type="button" className="scanner-overlay__close" onClick={closeScanner} aria-label="Close scanner">
                ✕
              </button>
            </div>
            <div className="scanner-overlay__video-wrap">
              {/* muted+playsInline are required for iOS Safari to auto-play the camera stream inline. */}
              <video ref={videoRef} className="scanner-overlay__video" muted playsInline />
            </div>
            {scannerError ? (
              <p className="order-note order-note--error">{scannerError}</p>
            ) : (
              <p className="scanner-overlay__hint">Line the QR code up inside the frame.</p>
            )}
            <button type="button" className="btn btn--secondary btn--lg btn--block" onClick={closeScanner}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {bookingOpen && (
        <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label="Reserve a table">
          <div className="scanner-overlay__inner">
            <div className="scanner-overlay__head">
              <p className="scanner-overlay__title">{bkDone ? "Booking requested" : "Reserve a table"}</p>
              <button type="button" className="scanner-overlay__close" onClick={closeBooking} aria-label="Close">
                ✕
              </button>
            </div>

            {bkDone ? (
              <>
                <p className="order-note order-note--info">
                  Thanks{bkName ? `, ${bkName}` : ""}! We've noted your booking for {bkDate} at {bkSlot}. Our staff
                  will confirm it and may call {bkPhone} to coordinate.
                </p>
                <button type="button" className="btn btn--primary btn--lg btn--block" onClick={closeBooking}>
                  Done
                </button>
              </>
            ) : (
              <form onSubmit={submitBooking} noValidate>
                <div className="field">
                  <label className="field__label" htmlFor="bk-name">
                    Your name
                  </label>
                  <input
                    className="field__input"
                    id="bk-name"
                    value={bkName}
                    onChange={(e) => setBkName(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="bk-phone">
                    Contact number
                  </label>
                  <input
                    className="field__input"
                    id="bk-phone"
                    type="tel"
                    value={bkPhone}
                    onChange={(e) => setBkPhone(e.target.value)}
                    required
                  />
                  <p className="field__hint">We may call to confirm your booking.</p>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="bk-party">
                    Number of guests
                  </label>
                  <input
                    className="field__input"
                    id="bk-party"
                    type="number"
                    min={1}
                    max={100}
                    value={bkParty}
                    onChange={(e) => setBkParty(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="bk-date">
                    Date
                  </label>
                  <input
                    className="field__input"
                    id="bk-date"
                    type="date"
                    min={todayIst()}
                    value={bkDate}
                    onChange={(e) => setBkDate(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <span className="field__label" id="bk-slot-label">
                    Time slot
                  </span>
                  {bkSlotsLoading ? (
                    <p className="field__hint">Loading slots…</p>
                  ) : bkSlots.some((s) => s.available) ? (
                    <div className="slot-grid" role="group" aria-labelledby="bk-slot-label">
                      {bkSlots
                        .filter((s) => s.available)
                        .map((s) => (
                          <button
                            key={s.slotStart}
                            type="button"
                            className={`slot-box${bkSlot === s.slotStart ? " slot-box--active" : ""}`}
                            aria-pressed={bkSlot === s.slotStart}
                            onClick={() => setBkSlot(s.slotStart)}
                          >
                            {formatSlotLabel(s.slotStart)}
                          </button>
                        ))}
                    </div>
                  ) : (
                    <p className="field__hint">No slots available for this date</p>
                  )}
                </div>
                {bkError && <p className="order-note order-note--error">{bkError}</p>}
                <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={bkSubmitting}>
                  {bkSubmitting ? "Requesting…" : "Request booking"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
