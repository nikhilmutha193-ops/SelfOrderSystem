import { useEffect, useMemo, useState } from "react";

import type { Review } from "../../lib/types";
import { api, extractErrorMessage } from "../../shared/api/client";
import { confirmDialog } from "../../shared/ui/confirm";
import { usePageTour, type TourStep } from "../../shared/ui/PageTour";
import { Badge, Card, ErrorText, PageHeader } from "../../shared/ui/ui";

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
    if (
      !(await confirmDialog({
        title: "Delete this review?",
        message: `The review from ${review.customerName} is removed for good.`,
        confirmLabel: "Delete review",
      }))
    )
      return;
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
            <button
              className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100"
              onClick={() => setApproved(review, false)}
            >
              Unapprove
            </button>
          ) : (
            <button className="text-green-700 hover:underline" onClick={() => setApproved(review, true)}>
              Approve
            </button>
          )}
          <button
            className="rounded-md px-2 py-1 text-sm font-medium transition-colors text-red-600 hover:bg-red-50"
            onClick={() => remove(review)}
          >
            Delete
          </button>
        </div>
      </Card>
    );
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        target: "reviews-pending",
        title: "Pending reviews",
        description: "New reviews from the landing page wait here until you approve them for public display.",
      },
      {
        target: "reviews-approved",
        title: "Approved reviews",
        description: "Shown publicly on the landing page. Unapprove one to pull it down, or delete it.",
      },
    ],
    []
  );
  usePageTour(tourSteps);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 sm:gap-6">
      <PageHeader
        title="Customer Reviews"
        description={
          <>
            Reviews submitted from the landing page show up here as "Pending" until you approve them for public display.
          </>
        }
      />

      <ErrorText>{error}</ErrorText>

      <div data-tour="reviews-pending">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing to review right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{pending.map(renderReview)}</div>
        )}
      </div>

      <div data-tour="reviews-approved">
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
