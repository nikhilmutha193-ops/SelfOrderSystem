import { useEffect, useState } from "react";

import type { Review } from "../../lib/types";
import { api, extractErrorMessage } from "../../shared/api/client";
import { Badge, Card, ErrorText } from "../../shared/ui/ui";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500">
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<Review[]>("/reviews")
      .then((res) => setReviews(res.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(load, []);

  async function setApproved(review: Review, isApproved: boolean) {
    try {
      await api.patch(`/reviews/${review._id}/approve`, { isApproved });
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function remove(review: Review) {
    if (!confirm(`Delete this review from "${review.customerName}"?`)) return;
    try {
      await api.delete(`/reviews/${review._id}`);
      load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const pending = reviews.filter((r) => !r.isApproved);
  const approved = reviews.filter((r) => r.isApproved);

  function tableCode(review: Review) {
    return typeof review.tableId === "object" ? review.tableId?.code : undefined;
  }

  function renderReview(review: Review) {
    const code = tableCode(review);
    return (
      <Card key={review._id} className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-800">
              {review.customerName}
              {code && <span className="ml-2 text-xs font-normal text-slate-400">Table {code}</span>}
            </p>
            <Stars rating={review.rating} />
          </div>
          <Badge tone={review.isApproved ? "green" : "amber"}>{review.isApproved ? "Approved" : "Pending"}</Badge>
        </div>
        <p className="text-sm text-slate-600">{review.comment}</p>
        <p className="text-xs text-slate-400">{new Date(review.createdAt).toLocaleString()}</p>
        <div className="flex gap-3 text-sm">
          {review.isApproved ? (
            <button className="text-slate-600 hover:underline" onClick={() => setApproved(review, false)}>
              Unapprove
            </button>
          ) : (
            <button className="text-green-700 hover:underline" onClick={() => setApproved(review, true)}>
              Approve
            </button>
          )}
          <button className="text-red-600 hover:underline" onClick={() => remove(review)}>
            Delete
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-800">Customer Reviews</h1>
      <p className="text-sm text-slate-500">
        Reviews submitted from the landing page show up here as "Pending" until you approve them for public display.
      </p>

      <ErrorText>{error}</ErrorText>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing to review right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{pending.map(renderReview)}</div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Approved ({approved.length})</h2>
        {approved.length === 0 ? (
          <p className="text-sm text-slate-400">No approved reviews yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{approved.map(renderReview)}</div>
        )}
      </div>
    </div>
  );
}
