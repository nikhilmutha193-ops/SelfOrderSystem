import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ordersApi } from "../../features/orders/api";
import { useTableSession } from "../../lib/useTableSession";
import { api, clearStoredToken, extractErrorMessage, setActiveAuth, storeToken } from "../../shared/api/client";

import "../../styles/order.css";

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export default function CustomerDetails() {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [members, setMembers] = useState(2);
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const navigate = useNavigate();
  const session = useTableSession();
  const tableCode = (() => {
    try {
      return localStorage.getItem("selforder_table_code") || "";
    } catch {
      return "";
    }
  })();

  useEffect(() => {
    if (session.orderId) navigate("/order/menu", { replace: true });
    else if (!session.tableId) navigate("/order", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A returning guest shouldn't have to retype their name/birthday - once the phone number looks
  // complete, check if we already know this guest and fill in whatever they haven't typed yet.
  useEffect(() => {
    if (customerPhone.length !== 10) return;
    const timer = setTimeout(() => {
      api
        .get<{ name: string; birthday: string } | null>("/customers/guest-lookup", { params: { phone: customerPhone } })
        .then((res) => {
          const found = res.data;
          if (!found) return;
          if (found.name) setCustomerName((prev) => prev || found.name);
          if (found.birthday) {
            const [month, day] = found.birthday.split("-");
            setBirthMonth((prev) => prev || month);
            setBirthDay((prev) => prev || day);
          }
        })
        .catch(() => {
          /* best effort - a failed lookup just means the guest types their details as normal */
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [customerPhone]);

  async function backToTableLogin() {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    try {
      await api.patch("/tables/session/release");
    } catch {}
    clearStoredToken("table");
    setActiveAuth(null);
    try {
      localStorage.removeItem("selforder_table_code");
    } catch {}
    navigate("/order", { replace: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const phone = customerPhone.trim();
      const started = await ordersApi.startDineIn({
        customerName,
        customerPhone: phone ? `+91 ${phone}` : "",
        members,
        ...(birthDay && birthMonth && { customerBirthday: `${birthMonth}-${birthDay}` }),
        customerMarketingConsent: marketingConsent,
      });
      storeToken("table", started.token);
      setActiveAuth({ role: "table", token: started.token });
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
                  <span className="stepper__num" aria-hidden>
                    1
                  </span>
                  <span className="stepper__label">Your table</span>
                </li>
                <li className="stepper__step stepper__step--active" aria-current="step">
                  <span className="stepper__num" aria-hidden>
                    2
                  </span>
                  <span className="stepper__label">Your visit</span>
                </li>
              </ol>

              {tableCode && (
                <div className="step__context">
                  <span>Signed in at</span>
                  <span className="step__context-value">{tableCode}</span>
                  <button type="button" className="step__context-change" onClick={backToTableLogin} disabled={leaving}>
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
                  <span className="field__prefix" aria-hidden>
                    +91
                  </span>
                  <input
                    className="field__input field__input--phone"
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={customerPhone}
                    onChange={(e) => {
                      const next = e.target.value.replace(/[^\d]/g, "");
                      setCustomerPhone(next);
                      if (!next) setMarketingConsent(false);
                    }}
                  />
                </div>
                <p className="field__hint">We'll only use this to reach you about your order.</p>
                <label
                  className={`mt-2 flex items-start gap-2 text-sm ${customerPhone ? "text-slate-600" : "text-slate-400"}`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    checked={marketingConsent}
                    disabled={!customerPhone}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                  />
                  Agreed to receive new offers and marketing messages on this number
                </label>
              </div>

              <div className="field">
                <span className="field__label">
                  Date of birth <span className="field__optional">(optional)</span>
                </span>
                <div className="flex gap-2">
                  <select
                    className="field__input"
                    id="birth-day"
                    aria-label="Day"
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                  >
                    <option value="">Day</option>
                    {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((day) => (
                      <option key={day} value={day}>
                        {Number(day)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="field__input"
                    id="birth-month"
                    aria-label="Month"
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                  >
                    <option value="">Month</option>
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="field__hint">Tell us and we'll send you a birthday treat.</p>
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
              <button className="step__back" type="button" onClick={backToTableLogin} disabled={leaving}>
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
                Back
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
