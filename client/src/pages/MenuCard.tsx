import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { LandingData } from "../lib/types";
import { api } from "../shared/api/client";

/** The restaurant's printed menu card, as photos: one page of its own, apart from the landing page. */
export default function MenuCard() {
  const [data, setData] = useState<LandingData | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<LandingData>("/landing")
      .then((res) => setData(res.data))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const content = data?.content as LandingData["content"] | undefined;
  const card = content?.menuCard;
  const photos = (card?.images ?? []).filter((i) => i.imageUrl);
  const restaurant = data?.restaurant;

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold">
            {restaurant?.logoUrl && <img src={restaurant.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />}
            <span className="truncate">{restaurant?.name ?? ""}</span>
          </Link>
          <Link to="/" className="shrink-0 text-sm font-medium text-slate-600 hover:text-slate-900">
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {failed && <p className="text-center text-slate-600">The menu card could not be loaded. Please try again.</p>}
        {data && (
          <>
            {card?.eyebrow && <p className="text-center text-xs font-semibold tracking-widest text-slate-500 uppercase">{card.eyebrow}</p>}
            <h1 className="mt-1 text-center text-3xl font-bold">{card?.title || "The menu card"}</h1>
            {card?.lead && <p className="mt-2 text-center text-slate-600">{card.lead}</p>}

            {card?.enabled === false || photos.length === 0 ? (
              <p className="mt-10 text-center text-slate-600">The menu card is not available right now.</p>
            ) : (
              <ul className="mt-6 flex flex-col gap-6" role="list">
                {photos.map((photo, i) => (
                  <li key={`${photo.imageUrl}-${i}`}>
                    <button
                      type="button"
                      className="block w-full cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 shadow-sm"
                      aria-label={`View ${photo.caption || `page ${i + 1}`} larger`}
                      onClick={() => setOpen(i)}
                    >
                      <img src={photo.imageUrl} alt={photo.caption || `Menu card page ${i + 1}`} className="block w-full" loading={i === 0 ? "eager" : "lazy"} />
                    </button>
                    {photo.caption && <p className="mt-2 text-center text-sm font-medium text-slate-600">{photo.caption}</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {open !== null && photos[open] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="Menu card"
          onClick={() => setOpen(null)}
        >
          <img
            src={photos[open].imageUrl}
            alt={photos[open].caption || `Menu card page ${open + 1}`}
            className="max-h-full max-w-full rounded-md bg-white object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="Close"
            className="absolute top-3 right-3 h-11 w-11 rounded-full bg-white/20 text-3xl leading-none text-white"
            onClick={() => setOpen(null)}
          >
            ×
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous page"
                className="absolute top-1/2 left-3 h-11 w-11 -translate-y-1/2 rounded-full bg-white/20 text-3xl leading-none text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((open + photos.length - 1) % photos.length);
                }}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next page"
                className="absolute top-1/2 right-3 h-11 w-11 -translate-y-1/2 rounded-full bg-white/20 text-3xl leading-none text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((open + 1) % photos.length);
                }}
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
