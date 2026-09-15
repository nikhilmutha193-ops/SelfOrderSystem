import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractErrorMessage } from "../lib/apiClient";
import { Button, Card, ErrorText } from "../components/ui";
import {
  ChiliDoodle,
  CoconutDoodle,
  CoffeeCupDoodle,
  CurryBowlDoodle,
  DosaSwirlDoodle,
  IdliDoodle,
  LeafDoodle,
  SteamDoodle,
  VadaDoodle,
} from "../components/CafeDoodles";
import type { LandingData } from "../lib/types";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function HeroSlideshow({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % images.length), 5000);
    return () => clearInterval(timer);
  }, [images.length]);

  if (images.length === 0) return null;

  return (
    <div className="absolute inset-0">
      {images.map((src, i) => (
        <img
          key={src + i}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
          style={{ opacity: i === index ? 0.4 : 0 }}
        />
      ))}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              aria-label={`Show slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-2 w-2 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const [data, setData] = useState<LandingData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<LandingData>("/landing")
      .then((res) => setData(res.data))
      .catch((err) => setLoadError(extractErrorMessage(err)));
  }, []);

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <ErrorText>{loadError}</ErrorText>
        <Link to="/order" className="text-orange-600 hover:underline">
          Continue to ordering &rarr;
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading...</div>;
  }

  const { restaurant, team, bestsellers, reviews, awards, googleReviews } = data;
  const owners = team.filter((m) => m.role === "owner");
  const chefs = team.filter((m) => m.role === "chef");
  const hasReviews = reviews.length > 0 || googleReviews.length > 0;

  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt={restaurant.name} className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-orange-100" />
            )}
            <span className="text-xl font-bold text-slate-800">{restaurant.name}</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 sm:flex">
            {[
              ["#about", "About"],
              ["#team", "Our Team"],
              ["#bestsellers", "Bestsellers"],
              ["#awards", "Awards"],
              ["#reviews", "Reviews"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="group relative py-1 transition-colors hover:text-orange-600"
              >
                {label}
                <span className="absolute inset-x-0 -bottom-0.5 h-0.5 origin-left scale-x-0 bg-orange-600 transition-transform duration-300 group-hover:scale-x-100" />
              </a>
            ))}
          </nav>
          <Link to="/order">
            <Button>Order Now</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-[90vh] max-h-[1100px] items-center overflow-hidden bg-orange-950 text-white sm:min-h-screen">
        <HeroSlideshow images={restaurant.heroImages} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-orange-950 via-orange-950/40 to-orange-950/10" />
        <CoffeeCupDoodle className="pointer-events-none absolute -right-6 top-10 h-40 w-40 rotate-6 text-white/10 sm:h-56 sm:w-56" />
        <DosaSwirlDoodle className="pointer-events-none absolute -left-10 bottom-10 h-44 w-44 -rotate-12 text-white/10 sm:h-60 sm:w-60" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-end gap-5 px-4 py-16 text-right sm:px-6 sm:py-20">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-orange-300 backdrop-blur">
            Welcome to
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">{restaurant.name}</h1>
          {restaurant.tagline && <p className="max-w-xl text-lg text-slate-200 sm:text-xl">{restaurant.tagline}</p>}
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Link to="/order">
              <Button className="group px-5 py-3 text-base shadow-lg shadow-orange-900/30 transition-transform hover:scale-105">
                Order Now
                <span className="ml-1 inline-block transition-transform group-hover:translate-x-1">&rarr;</span>
              </Button>
            </Link>
          </div>
        </div>

        <a
          href="#about"
          aria-label="Scroll down"
          className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 animate-bounce text-white/70 hover:text-white sm:block"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </a>
      </section>

      {/* About */}
      {restaurant.aboutText && (
        <section id="about" className="relative scroll-mt-24 overflow-hidden px-4 py-20 sm:px-6">
          <LeafDoodle className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 -rotate-12 text-orange-100" />
          <SteamDoodle className="pointer-events-none absolute -right-4 bottom-0 h-36 w-36 text-orange-100" />
          <IdliDoodle className="pointer-events-none absolute right-6 top-4 hidden h-24 w-24 rotate-6 text-orange-100 sm:block" />
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Our Story</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">Why guests keep coming back</h2>
            <div className="mx-auto mt-5 h-1 w-14 rounded-full bg-orange-500" />
            <p className="mt-6 text-lg leading-relaxed text-slate-600">{restaurant.aboutText}</p>
            {restaurant.address && <p className="mt-6 text-sm text-slate-400">{restaurant.address}</p>}
          </div>
        </section>
      )}

      {/* Team */}
      {team.length > 0 && (
        <section id="team" className="relative scroll-mt-24 overflow-hidden bg-orange-50/60 px-4 py-20 sm:px-6">
          <CoffeeCupDoodle className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rotate-12 text-orange-200/60" />
          <ChiliDoodle className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 -rotate-12 text-orange-200/50" />
          <VadaDoodle className="pointer-events-none absolute left-1/2 top-4 hidden h-24 w-24 -translate-x-1/2 text-orange-200/40 lg:block" />
          <SteamDoodle className="pointer-events-none absolute -left-6 -top-6 h-28 w-28 text-orange-200/40" />
          <div className="relative mx-auto max-w-6xl">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-orange-600">Our People</p>
            <h2 className="mt-2 text-center text-3xl font-bold text-slate-900">Meet the Team</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-slate-500">
              The people behind every dish and every warm welcome.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[...owners, ...chefs].map((member) => (
                <Card
                  key={member._id}
                  className="group flex flex-col items-center gap-3 p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="h-24 w-24 overflow-hidden rounded-full shadow-sm ring-4 ring-white">
                    {member.photoUrl ? (
                      <img
                        src={member.photoUrl}
                        alt={member.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="h-full w-full bg-slate-200" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{member.name}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-orange-600">
                      {member.title || (member.role === "owner" ? "Owner" : "Chef")}
                    </p>
                  </div>
                  {member.bio && <p className="text-sm text-slate-500">{member.bio}</p>}
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Bestsellers */}
      {bestsellers.length > 0 && (
        <section id="bestsellers" className="relative scroll-mt-24 overflow-hidden px-4 py-20 sm:px-6">
          <ChiliDoodle className="pointer-events-none absolute -left-8 top-6 h-36 w-36 rotate-6 text-orange-100" />
          <DosaSwirlDoodle className="pointer-events-none absolute -right-10 bottom-0 h-48 w-48 rotate-12 text-orange-100" />
          <CoffeeCupDoodle className="pointer-events-none absolute right-1/4 top-0 hidden h-28 w-28 -rotate-6 text-orange-100 lg:block" />
          <IdliDoodle className="pointer-events-none absolute -bottom-6 left-1/4 hidden h-28 w-28 -rotate-6 text-orange-100 lg:block" />
          <CurryBowlDoodle className="pointer-events-none absolute -left-6 bottom-1/4 hidden h-24 w-24 rotate-6 text-orange-100 xl:block" />
          <div className="relative mx-auto max-w-6xl">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-orange-600">Fan Favorites</p>
            <h2 className="mt-2 text-center text-3xl font-bold text-slate-900">Customer Favorites</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-slate-500">
              The dishes our regulars keep coming back for.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {bestsellers.map((item) => (
                <Card
                  key={item._id}
                  className="group flex flex-col gap-2 overflow-hidden !p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  {item.imageUrl && (
                    <div className="relative h-40 w-full overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <span
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-base shadow"
                        title="Bestseller"
                      >
                        {item.bestsellerEmoji || "⭐"}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800">
                        {!item.imageUrl && (item.bestsellerEmoji || "⭐")} {item.name}
                      </p>
                      <span className="whitespace-nowrap font-semibold text-orange-600">₹{item.price.toFixed(2)}</span>
                    </div>
                    {item.description && <p className="text-sm text-slate-500">{item.description}</p>}
                  </div>
                </Card>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Link to="/order">
                <Button className="px-6 py-3 text-base shadow-md shadow-orange-600/20 transition-transform hover:scale-105">
                  Order these now
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Awards */}
      {awards.length > 0 && (
        <section id="awards" className="relative scroll-mt-24 overflow-hidden bg-orange-50/60 px-4 py-20 sm:px-6">
          <LeafDoodle className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rotate-12 text-orange-200/50" />
          <CoconutDoodle className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rotate-12 text-orange-200/50" />
          <ChiliDoodle className="pointer-events-none absolute -left-6 -top-6 h-28 w-28 -rotate-6 text-orange-200/40" />
          <div className="relative mx-auto max-w-6xl">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-orange-600">Recognition</p>
            <h2 className="mt-2 text-center text-3xl font-bold text-slate-900">Awards &amp; Recognition</h2>
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {awards.map((award) => (
                <Card
                  key={award._id}
                  className="flex flex-col items-center gap-3 p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  {award.imageUrl ? (
                    <img src={award.imageUrl} alt={award.title} className="h-20 w-20 rounded-md object-cover shadow-sm" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-md bg-amber-100 text-3xl">🏆</div>
                  )}
                  <div>
                    <p className="font-semibold text-slate-800">{award.title}</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-orange-600">
                      {[award.issuer, award.year].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {award.description && <p className="text-sm text-slate-500">{award.description}</p>}
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Reviews */}
      {hasReviews && (
        <section id="reviews" className="relative scroll-mt-24 overflow-hidden px-4 py-20 sm:px-6">
          <CoffeeCupDoodle className="pointer-events-none absolute -right-8 top-8 h-36 w-36 -rotate-6 text-orange-100" />
          <DosaSwirlDoodle className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rotate-6 text-orange-100" />
          <VadaDoodle className="pointer-events-none absolute bottom-6 right-1/4 hidden h-24 w-24 rotate-12 text-orange-100 xl:block" />
          <CurryBowlDoodle className="pointer-events-none absolute -left-6 -top-6 h-28 w-28 rotate-6 text-orange-100" />
          <div className="relative mx-auto max-w-6xl">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-orange-600">Testimonials</p>
            <h2 className="mt-2 text-center text-3xl font-bold text-slate-900">What Our Guests Say</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-slate-500">
              Diners can leave a review right from their table after ordering.
            </p>

            {reviews.length > 0 && (
              <div className="mt-10">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">From our guests</h3>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {reviews.map((review) => (
                    <Card
                      key={review._id}
                      className="relative flex flex-col gap-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                    >
                      <span className="absolute right-4 top-3 font-serif text-5xl leading-none text-orange-100">&rdquo;</span>
                      <Stars rating={review.rating} />
                      <p className="relative text-sm italic text-slate-600">&ldquo;{review.comment}&rdquo;</p>
                      <p className="text-sm font-semibold text-slate-800">{review.customerName}</p>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {googleReviews.length > 0 && (
              <div className="mt-12">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">From Google</h3>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {googleReviews.map((review, idx) => (
                    <Card
                      key={idx}
                      className="flex flex-col gap-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                    >
                      <div className="flex items-center gap-2">
                        {review.profilePhotoUrl ? (
                          <img src={review.profilePhotoUrl} alt={review.author} className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-slate-200" />
                        )}
                        <p className="text-sm font-semibold text-slate-800">{review.author}</p>
                      </div>
                      <Stars rating={review.rating} />
                      {review.text && <p className="text-sm italic text-slate-600">&ldquo;{review.text}&rdquo;</p>}
                      {review.relativeDate && <p className="text-xs text-slate-400">{review.relativeDate}</p>}
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-16 text-center text-white sm:px-6">
        <SteamDoodle className="pointer-events-none absolute -left-6 -top-6 h-32 w-32 text-white/10" />
        <SteamDoodle className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 rotate-180 text-white/10" />
        <IdliDoodle className="pointer-events-none absolute right-8 top-1/2 hidden h-24 w-24 -translate-y-1/2 rotate-6 text-white/10 lg:block" />
        <h2 className="relative text-2xl font-bold sm:text-3xl">Hungry already?</h2>
        <p className="mx-auto mt-2 max-w-xl text-orange-50">
          Scan the QR code at your table, or tap below to start your order in seconds.
        </p>
        <div className="mt-6">
          <Link to="/order">
            <Button
              variant="secondary"
              className="!bg-white px-6 py-3 text-base font-semibold !text-orange-700 shadow-lg transition-transform hover:scale-105 hover:!bg-orange-50"
            >
              Start Ordering &rarr;
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative overflow-hidden bg-orange-950 px-4 py-12 text-orange-200/70 sm:px-6">
        <LeafDoodle className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rotate-12 text-white/5" />
        <CoconutDoodle className="pointer-events-none absolute -left-8 -top-8 hidden h-32 w-32 -rotate-12 text-white/5 sm:block" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-3">
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt={restaurant.name} className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-orange-500/20" />
            )}
            <div>
              <p className="font-semibold text-white">{restaurant.name}</p>
              {restaurant.address && <p className="text-sm">{restaurant.address}</p>}
            </div>
          </div>

          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm sm:justify-end">
            <a href="#about" className="hover:text-white">About</a>
            <a href="#team" className="hover:text-white">Our Team</a>
            <a href="#bestsellers" className="hover:text-white">Bestsellers</a>
            <a href="#awards" className="hover:text-white">Awards</a>
            <a href="#reviews" className="hover:text-white">Reviews</a>
            <Link to="/order" className="font-medium text-orange-400 hover:text-orange-300">
              Start your order &rarr;
            </Link>
          </nav>
        </div>
        <div className="mx-auto mt-8 max-w-6xl border-t border-white/10 pt-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} {restaurant.name}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
