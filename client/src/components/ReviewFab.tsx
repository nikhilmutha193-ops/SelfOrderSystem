import { useState } from "react";
import { api, extractErrorMessage } from "../lib/apiClient";
import { Button, ErrorText, Input, Textarea } from "./ui";

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange(n)}
          className={`text-2xl leading-none transition-colors ${n <= value ? "text-amber-500" : "text-slate-300"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function ReviewFab() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setSubmitted(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/reviews", { customerName: name, rating, comment });
      setName("");
      setRating(5);
      setComment("");
      setSubmitted(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-orange-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-orange-700"
      >
        <span aria-hidden>★</span> Leave a review
      </button>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={close}>
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-green-700">
                  Thanks for your feedback! Your review will appear on our page once it's approved.
                </p>
                <Button onClick={close}>Close</Button>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">Leave a review</h2>
                  <button type="button" className="text-slate-400 hover:text-slate-600" onClick={close} aria-label="Close">
                    ✕
                  </button>
                </div>
                <label className="text-sm font-medium text-slate-700">
                  Your name
                  <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
                </label>
                <div className="text-sm font-medium text-slate-700">
                  Rating
                  <div className="mt-1">
                    <StarPicker value={rating} onChange={setRating} />
                  </div>
                </div>
                <label className="text-sm font-medium text-slate-700">
                  Your review
                  <Textarea className="mt-1" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} required />
                </label>
                <ErrorText>{error}</ErrorText>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit review"}
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
