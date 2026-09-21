import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, storeToken, clearStoredToken, setActiveAuth, extractErrorMessage } from "../../lib/apiClient";
import { useTableSession } from "../../lib/useTableSession";
import "../../styles/order.css";

export default function CustomerDetails() {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [members, setMembers] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const session = useTableSession();
  const tableCode = (() => {
    try {
      return localStorage.getItem("selforder_table_code") || "";
    } catch {
      return "";
    }
  })();

  // Once an order has started the guest belongs on the menu - block coming back here.
  // And a guest who somehow lands here without a table session is sent to sign in.
  useEffect(() => {
    if (session.orderId) navigate("/order/menu", { replace: true });
    else if (!session.tableId) navigate("/order", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Table login (see TableLogin.tsx) auto-redirects straight back here whenever a valid
  // table token is still stored - so simply navigating to "/order" while that token remains
  // just bounces the guest right back. Going back to table login has to actually end this
  // table session first, or "Change"/"Back" silently do nothing.
  async function backToTableLogin() {
    try {
      // Best-effort: also free the table server-side so it doesn't stay falsely "occupied"
      // for other guests. Still navigate away even if this fails (e.g. offline) - the
      // client-side sign-out below is what actually unblocks the Change/Back buttons.
      await api.patch("/tables/session/release");
    } catch {
      /* non-critical - the table auto-releases later if this doesn't go through */
    }
    clearStoredToken("table");
    setActiveAuth(null);
    try {
      localStorage.removeItem("selforder_table_code");
    } catch {
      /* ignore - the code just won't be prefilled next time */
    }
    navigate("/order", { replace: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const phone = customerPhone.trim();
      const res = await api.post("/orders/dine-in", {
        customerName,
        customerPhone: phone ? `+91 ${phone}` : "",
        members,
      });
      storeToken("table", res.data.token);
      setActiveAuth({ role: "table", token: res.data.token });
      navigate("/order/menu");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="order-page">
      <main className="order">
        <div className="order__layout" style={{ gridTemplateColumns: "1fr" }}>
          <section className="order__panel">
            <form className="order-form" onSubmit={submit} noValidate>
              <ol className="stepper" aria-label="Progress">
                <li className="stepper__step stepper__step--done">
                  <span className="stepper__num" aria-hidden>1</span>
                  <span className="stepper__label">Your table</span>
                </li>
                <li className="stepper__step stepper__step--active" aria-current="step">
                  <span className="stepper__num" aria-hidden>2</span>
                  <span className="stepper__label">Your visit</span>
                </li>
              </ol>

              {tableCode && (
                <div className="step__context">
                  <span>Signed in at</span>
                  <span className="step__context-value">{tableCode}</span>
                  <button type="button" className="step__context-change" onClick={backToTableLogin}>
                    Change
                  </button>
                </div>
              )}

              <h1 className="step__title">Tell us about your visit</h1>
              <p className="step__lead">Just a couple of details so we can look after you.</p>

              {error && <p className="order-note order-note--error">{error}</p>}

              <div className="field">
                <label className="field__label" htmlFor="guest-name">
                  Your name
                </label>
                <input
                  className="field__input"
                  id="guest-name"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. Ananya"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="phone">
                  Phone number <span className="field__optional">(optional)</span>
                </label>
                <div className="field__phone">
                  <span className="field__prefix" aria-hidden>+91</span>
                  <input
                    className="field__input field__input--phone"
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/[^\d]/g, ""))}
                  />
                </div>
                <p className="field__hint">We'll only use this to reach you about your order.</p>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="members">
                  Number of members
                </label>
                <div className="counter">
                  <button
                    className="counter__btn"
                    type="button"
                    aria-label="Fewer members"
                    disabled={members <= 1}
                    onClick={() => setMembers((m) => Math.max(1, m - 1))}
                  >
                    −
                  </button>
                  <input
                    className="field__input counter__input"
                    id="members"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={12}
                    value={members}
                    onChange={(e) => setMembers(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
                    required
                  />
                  <button
                    className="counter__btn"
                    type="button"
                    aria-label="More members"
                    disabled={members >= 12}
                    onClick={() => setMembers((m) => Math.min(12, m + 1))}
                  >
                    +
                  </button>
                </div>
              </div>

              <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={loading}>
                {loading ? "Starting order…" : "Continue to menu"}
              </button>
              <button className="step__back" type="button" onClick={backToTableLogin}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
