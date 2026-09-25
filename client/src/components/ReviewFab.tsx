import { useEffect, useState } from "react";

import { api, extractErrorMessage } from "../lib/apiClient";
import { Button, ErrorText, Input, Textarea } from "./ui";

export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          aria-pressed={n === value}
          onClick={() => onChange(n)}
          className={`px-1 text-3xl leading-none transition-colors ${n <= value ? "text-amber-500" : "text-slate-300"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function ReviewDialog({
  open,
  onClose,
  defaultName = "",
}: {
  open: boolean;
  onClose: () => void;
  defaultName?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saves the customer retyping a name the order already knows.
  useEffect(() => {
    if (open && defaultName) setName((current) => current || defaultName);
  }, [open, defaultName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/reviews", { customerName: name, rating, comment });
      setComment("");
      setSubmitted(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setSubmitted(false);
    setError(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Leave feedback"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
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
              <h2 className="text-base font-semibold text-slate-800">How was your experience?</h2>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                onClick={close}
                aria-label="Close"
              >
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
              Your feedback <span className="font-normal text-slate-400">(optional)</span>
              <Textarea
                className="mt-1"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us what you enjoyed, or what we could do better"
              />
            </label>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit feedback"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ReviewFab({ defaultName }: { defaultName?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-orange-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-orange-700"
      >
        <span aria-hidden>★</span> Feedback
      </button>
      <ReviewDialog open={open} onClose={() => setOpen(false)} defaultName={defaultName} />
    </>
  );
}
