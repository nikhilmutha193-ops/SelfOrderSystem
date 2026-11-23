import { useEffect, useState } from "react";

import { StarPicker } from "../../components/ReviewFab";
import type { RestaurantNamePart } from "../../lib/types";
import { BrandName } from "../../shared/ui/BrandName";
import { api, extractErrorMessage } from "../../shared/api/client";

import "../../styles/order.css";

interface FeedbackInfo {
  name: string;
  nameStyle?: RestaurantNamePart[];
  logoUrl: string;
  googleReviewUrl: string;
  googleMinStars: number;
}

interface SubmitResult {
  message: string;
  googleReviewUrl: string | null;
}

/**
 * The page the feedback QR opens: no table sign-in. It looks like the table sign-in page (same header and panel)
 * and, for a happy rating, offers to post the same words on Google.
 */
export default function Feedback() {
  const [info, setInfo] = useState<FeedbackInfo>({ name: "", logoUrl: "", googleReviewUrl: "", googleMinStars: 4 });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState(""); // hidden field: only a bot fills it in
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SubmitResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<FeedbackInfo>("/reviews/public/info")
      .then((res) => setInfo(res.data))
      .catch(() => {
        /* the form still works without the branding */
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) return setError("Please tap a star to rate your visit");
    if (!name.trim()) return setError("Please enter your name");
    setError(null);
    setSending(true);
    try {
      const res = await api.post<SubmitResult>("/reviews/public", {
        customerName: name.trim(),
        phone: phone.trim() || undefined,
        rating,
        comment: comment.trim(),
        website,
      });
      setDone(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function openGoogle(url: string) {
    // Google's page starts empty, so the guest's own words are copied to paste there.
    if (comment.trim()) {
      try {
        await navigator.clipboard.writeText(comment.trim());
        setCopied(true);
      } catch {
        /* copying is a courtesy only */
      }
    }
    window.open(url, "_blank", "noopener");
  }

  return (
    <div className="order-page">
      <header className="order-header">
        <div className="container order-header__inner">
          <a className="order-header__brand" href="/">
            {info.logoUrl ? (
              <img className="order-header__logo" src={info.logoUrl} alt="" width={40} height={40} />
            ) : (
              <span
                className="order-header__logo"
                aria-hidden
                style={{ display: "grid", placeItems: "center", background: "var(--color-primary-tint)", fontSize: 20 }}
              >
                ☕
              </span>
            )}
            <span className="order-header__name">
              <BrandName name={info.name} parts={info.nameStyle} />
            </span>
          </a>
        </div>
      </header>

      <main className="order">
        <div className="order__layout">
          <aside className="order__aside">
            {info.logoUrl ? (
              <img className="order__aside-art order__aside-art--logo" src={info.logoUrl} alt="" aria-hidden />
            ) : (
              <div className="order__aside-art" aria-hidden>
                ☕
              </div>
            )}
            <div className="order__aside-copy">
              <p className="order__aside-eyebrow">Your feedback</p>
              <h2 className="order__aside-title">Tell us how it was</h2>
              <p className="order__aside-text">
                A minute of your time helps us serve you better. No sign-in needed.
              </p>
            </div>
          </aside>

          <section className="order__panel">
            {done ? (
              <div className="order-form">
                <p className="feedback__stars" aria-label={`${rating} out of 5`} style={{ fontSize: 32, color: "#f59e0b" }}>
                  {"★".repeat(rating)}
                </p>
                <h1 className="step__title">Thank you!</h1>
                <p className="step__lead">{done.message}</p>
                {done.googleReviewUrl && (
                  <div className="order-choice">
                    <p className="order-note order-note--info">
                      Glad you enjoyed it! Would you share it on Google too? It helps other guests find us.
                      {copied && " Your comment is copied: paste it on the Google page."}
                    </p>
                    <button
                      type="button"
                      className="btn btn--primary btn--lg btn--block"
                      onClick={() => openGoogle(done.googleReviewUrl!)}
                    >
                      Post on Google
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <form className="order-form" onSubmit={submit} noValidate>
                <h1 className="step__title">How was your visit?</h1>
                <p className="step__lead">Rate us and leave a few words.</p>
                {error && <p className="order-note order-note--error">{error}</p>}

                <div className="field">
                  <span className="field__label">Your rating</span>
                  <StarPicker value={rating} onChange={setRating} />
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="fb-name">
                    Your name
                  </label>
                  <input
                    className="field__input"
                    id="fb-name"
                    autoComplete="name"
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="fb-phone">
                    Mobile number <span style={{ opacity: 0.6 }}>(optional)</span>
                  </label>
                  <input
                    className="field__input"
                    id="fb-phone"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={20}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="fb-comment">
                    Your feedback <span style={{ opacity: 0.6 }}>(optional)</span>
                  </label>
                  <textarea
                    className="field__input"
                    id="fb-comment"
                    rows={4}
                    maxLength={1000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Tell us what you enjoyed, or what we could do better"
                  />
                </div>

                {/* Hidden from people; a bot that fills every field gives itself away. */}
                <div aria-hidden style={{ position: "absolute", left: "-10000px", height: 0, overflow: "hidden" }}>
                  <label>
                    Website
                    <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </label>
                </div>

                <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={sending}>
                  {sending ? "Sending…" : "Send feedback"}
                </button>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
