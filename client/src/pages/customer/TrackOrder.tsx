import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  api,
  extractErrorMessage,
  setActiveAuth,
  storeToken,
} from "../../shared/api/client";
import "../../styles/order.css";

/** Its own screen: a guest with a receipt enters the token number to follow their order. */
export default function TrackOrder() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{
        serviceFlow?: string;
        tableLoginSettings?: { allowTokenLogin?: boolean };
      }>("/restaurant/public")
      .then((res) =>
        setAllowed(
          res.data.tableLoginSettings?.allowTokenLogin ??
            res.data.serviceFlow === "cafe",
        ),
      )
      .catch(() => setAllowed(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ token: string }>("/auth/table/token-login", {
        token: Number(token),
      });
      storeToken("table", res.data.token);
      setActiveAuth({ role: "table", token: res.data.token });
      navigate("/order/invoice");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="order">
      <section
        className="order__panel"
        style={{ margin: "0 auto", maxWidth: 480 }}
      >
        {allowed === false ? (
          <div className="order-form">
            <h2 className="step__title">Order tracking is not available</h2>
            <p className="step__lead">Please ask the staff about your order.</p>
          </div>
        ) : (
          <form className="order-form" onSubmit={submit} noValidate>
            <h2 className="step__title">Track your order</h2>
            <p className="step__lead">
              Enter the token number on your receipt to see how your order is
              coming along. To order from a table, scan the QR code on it
              afterwards.
            </p>
            {error && <p className="order-note order-note--error">{error}</p>}
            <div className="field">
              <label className="field__label" htmlFor="track-token">
                Token number
              </label>
              <input
                className="field__input field__input--code"
                id="track-token"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 12"
                value={token}
                onChange={(e) =>
                  setToken(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
              />
            </div>
            <button
              className="btn btn--secondary btn--lg btn--block"
              type="submit"
              disabled={busy || token === ""}
            >
              {busy ? "Finding your order…" : "Track my order"}
            </button>
          </form>
        )}
        <p className="order-note" style={{ marginTop: "1rem" }}>
          <Link to="/order" className="link">
            Back to table sign-in
          </Link>
        </p>
      </section>
    </main>
  );
}
