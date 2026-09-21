import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  activateStoredAuth,
  storeToken,
  setActiveAuth,
  extractErrorMessage,
  wasSessionExpired,
  clearExpiredFlag,
} from "../../lib/apiClient";
import type { TableRow } from "../../lib/types";
import { useTableSession } from "../../lib/useTableSession";
import "../../styles/order.css";

export default function TableLogin() {
  const [searchParams] = useSearchParams();
  const qrToken = searchParams.get("t") || "";
  const [sessionExpired] = useState(() => searchParams.get("expired") === "1" || wasSessionExpired("table"));
  const [code, setCode] = useState(() => searchParams.get("code") || "");
  const [password, setPassword] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [available, setAvailable] = useState<TableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState<{ name: string; logoUrl: string }>({ name: "Benne Kaffi", logoUrl: "" });
  // Re-scanning/re-signing-in to one's own already-occupied table: offer a choice instead of
  // silently resuming or showing a raw "already occupied" error - see attemptLogin().
  const [needsOrderChoice, setNeedsOrderChoice] = useState(false);
  const navigate = useNavigate();
  const session = useTableSession();

  useEffect(() => {
    api
      .get<{ name?: string; logoUrl?: string }>("/restaurant/public")
      .then((res) => setBrand({ name: res.data.name || "Benne Kaffi", logoUrl: res.data.logoUrl || "" }))
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  /** Exact text of the server's "it's your own table, still occupied" 409 - see auth.controller.ts. */
  const OWN_TABLE_OCCUPIED_MESSAGE = "You already have an order in progress at this table";

  /**
   * Shared by both sign-in paths (QR scan and typed code+PIN) - the "your own table is still
   * occupied" case has to be handled identically either way, since it's the same server check
   * regardless of how the guest got here. Previously only the QR path had this, so re-logging
   * into an occupied table by typing the code+PIN just showed a bare "already occupied" error
   * with no way forward.
   */
  async function attemptLogin(opts: { startNewOrder?: boolean; continueOrder?: boolean } = {}) {
    setError(null);
    setNeedsOrderChoice(false);
    setLoading(true);
    try {
      const res = await api.post("/auth/table/login", {
        ...(qrToken ? { token: qrToken } : { code, password }),
        // Lets the server tell "it's my own table" apart from "someone else is seated
        // here" - only meaningful (and only sent) when a session already exists.
        ...(session.tableId ? { currentTableId: session.tableId } : {}),
        ...(opts.startNewOrder ? { startNewOrder: true } : {}),
        ...(opts.continueOrder ? { continueOrder: true } : {}),
      });
      storeToken("table", res.data.token);
      setActiveAuth({ role: "table", token: res.data.token });
      try { localStorage.setItem("selforder_table_code", res.data.table?.code || code); } catch { /* ignore */ }
      // The server embeds orderId in the token when one already exists (continueOrder or an
      // already-provisioned session) - CustomerDetails' own redirect picks that up and moves
      // straight on to the menu, so there is no need to branch on it here too.
      navigate("/order/details");
    } catch (err) {
      const message = extractErrorMessage(err);
      if (message === OWN_TABLE_OCCUPIED_MESSAGE) {
        // Own table, still occupied - let the guest choose rather than guessing.
        setNeedsOrderChoice(true);
        setLoading(false);
        return;
      }
      // Any other failure on the QR path (someone else's table, a network hiccup, etc.) - if a
      // valid session already exists, fall back to it rather than stranding the guest on a
      // scary error screen that "Try again" could never get past anyway. Only for QR: a typed
      // code+PIN is a deliberate attempt at a *specific* table, so silently landing back on a
      // different, older session there would be confusing rather than helpful.
      if (qrToken && session.tableId) {
        navigate(session.orderId ? "/order/menu" : "/order/details", { replace: true });
        return;
      }
      setError(message);
      setLoading(false);
    }
  }

  /**
   * "Continue my order" from the occupied-table choice. This device may already have a valid
   * session for this exact table (e.g. re-scanning its own QR) - then there's nothing to fetch,
   * just go there. Otherwise (a different/fresh device whose PIN was still correct) it has no
   * token of its own yet, so it has to actually sign in to rejoin the existing seating rather
   * than navigating using session data it doesn't have.
   */
  function continueExistingOrder() {
    if (session.tableId) {
      navigate(session.orderId ? "/order/menu" : "/order/details", { replace: true });
      return;
    }
    attemptLogin({ continueOrder: true });
  }

  useEffect(() => {
    clearExpiredFlag("table");
    const token = activateStoredAuth("table");

    if (qrToken) {
      // A fresh QR scan always gets to decide what happens next - attemptLogin() itself
      // handles every outcome (a different, available table switches onto it; the guest's own
      // still-occupied table shows the continue/new-order choice; any other failure falls back
      // to resuming an existing session). Navigating away here first would race ahead of that
      // network call and skip straight past the choice prompt before it can ever show.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <span className="order-header__logo" aria-hidden style={{ display: "grid", placeItems: "center", background: "var(--color-primary-tint)", fontSize: 20 }}>
                ☕
              </span>
            )}
            <span className="order-header__name">{brand.name}</span>
          </a>
          <a className="order-header__back" href="/">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
              <div className="order__aside-art" aria-hidden>☕</div>
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
                  <span className="stepper__num" aria-hidden>1</span>
                  <span className="stepper__label">Your table</span>
                </li>
                <li className="stepper__step">
                  <span className="stepper__num" aria-hidden>2</span>
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
                    You already have an order in progress at this table. Would you like to continue it, or start a
                    new order?
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
                          <svg className="field__toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                            <path d="M1 1l22 22" />
                          </svg>
                        ) : (
                          <svg className="field__toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                            <button
                              type="button"
                              className="table-chip"
                              onClick={() => setCode(t.code)}
                            >
                              <span className="table-chip__code">{t.code}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
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
        <p className="order-footer__copy">© {new Date().getFullYear()} {brand.name} · Taste of Bengaluru</p>
      </footer>
    </div>
  );
}
