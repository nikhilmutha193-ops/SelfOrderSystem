import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, extractErrorMessage } from "../lib/apiClient";
import type { LandingContent, LandingData } from "../lib/types";

import "../styles/landing/index.css";

const ASSET = "/landing";

const FALLBACK_SLIDE = { desktop: `${ASSET}/desktop_banner.png`, mobile: `${ASSET}/mobile_banner.png` };

const FALLBACK_SERVE = [
  { title: "Benne Dosa", text: "Crisp, golden crepes from hand-ground batter.", imageUrl: `${ASSET}/dosa.png` },
  { title: "Thatte Idli", text: "Soft, plate-sized idlis steamed to order.", imageUrl: `${ASSET}/idly.png` },
  { title: "Vada", text: "Crispy lentil fritters, airy inside and perfectly spiced.", imageUrl: `${ASSET}/vada.png` },
  { title: "Filter Kaffi", text: "Slow decoction, frothy milk, brass dabara.", imageUrl: `${ASSET}/coffee.png` },
];

const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const NAV_LINKS: [string, string][] = [
  ["#serve", "What We Serve"],
  ["#menu", "Menu"],
  ["#story", "Our Story"],
  ["#locations", "Visit Us"],
];

export default function Landing() {
  const [data, setData] = useState<LandingData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [flipped, setFlipped] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    api
      .get<LandingData>("/landing")
      .then((res) => setData(res.data))
      .catch((err) => setLoadError(extractErrorMessage(err)));
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("no-scroll", navOpen);
    return () => document.body.classList.remove("no-scroll");
  }, [navOpen]);

  const editorSlides = data?.content?.hero?.slides?.filter((s) => s.desktopUrl) ?? [];
  const heroSlides = editorSlides.length
    ? editorSlides
    : (data?.restaurant.heroImages ?? []).map((url) => ({ desktopUrl: url, mobileUrl: "" }));
  const heroImages = heroSlides;
  useEffect(() => {
    if (heroImages.length < 2) return;
    const timer = setInterval(() => setSlide((i) => (i + 1) % heroImages.length), 6000);
    return () => clearInterval(timer);
  }, [heroImages.length]);

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
        <Link to="/order" className="text-orange-600 hover:underline">
          Continue to ordering &rarr;
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading...</div>;
  }

  const { restaurant, team, bestsellers, reviews, awards } = data;
  const c = data.content as LandingContent | undefined;
  const founder = team.find((m) => m.role === "owner");
  const logo = restaurant.logoUrl || `${ASSET}/logo.jpeg`;

  const serveItems = c?.serve.items.length ? c.serve.items : FALLBACK_SERVE;
  const heroSubtitle = c?.hero.subtitle || restaurant.tagline || "";
  const storyText = c?.story.text || restaurant.aboutText || "";
  const storyTitle = c?.story.title || (founder ? `Meet ${founder.name}` : "Our journey");
  const storyImage = c?.story.imageUrl || founder?.photoUrl || "";
  const storyQuote = c?.story.quote || founder?.bio || "";
  const outletItems = c?.outlets.items ?? [];

  const heroClassName = [
    "hero",
    c?.hero.verticalAlignMobile && `hero--valign-mobile-${c.hero.verticalAlignMobile}`,
    c?.hero.verticalAlignDesktop && `hero--valign-desktop-${c.hero.verticalAlignDesktop}`,
  ]
    .filter(Boolean)
    .join(" ");

  const heroContentClassName = [
    "container hero__content",
    c?.hero.textAlignMobile && `hero__content--mobile-${c.hero.textAlignMobile}`,
    c?.hero.textAlignDesktop && `hero__content--desktop-${c.hero.textAlignDesktop}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="bk-landing">
      <header className={`header${scrolled ? " header--scrolled" : ""}${navOpen ? " header--open" : ""}`} id="header">
        <div className="container header__inner">
          <a className="header__logo" href="#top" aria-label={`${restaurant.name} - home`}>
            <img className="header__logo-img" src={logo} alt="" width={48} height={48} />
            <span className="header__logo-text">{restaurant.name}</span>
          </a>

          <button
            className={`nav__toggle${navOpen ? " nav__toggle--active" : ""}`}
            type="button"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            aria-controls="primary-nav"
            onClick={() => setNavOpen((v) => !v)}
          >
            <span className="nav__toggle-bar" />
            <span className="nav__toggle-bar" />
            <span className="nav__toggle-bar" />
          </button>

          <nav className={`nav${navOpen ? " nav--open" : ""}`} id="primary-nav" aria-label="Primary">
            <ul className="nav__list">
              {NAV_LINKS.map(([href, label]) => (
                <li className="nav__item" key={href}>
                  <a className="nav__link" href={href} onClick={() => setNavOpen(false)}>
                    {label}
                  </a>
                </li>
              ))}
              <li className="nav__item">
                <Link className="nav__link nav__link--cta" to="/order" onClick={() => setNavOpen(false)}>
                  {c?.hero.primaryLabel || "Order Now"}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className={heroClassName} id="top" aria-labelledby="hero-title">
          <div className="hero__slides" id="hero-slides">
            {heroSlides.length > 0 ? (
              heroSlides.map((s, i) => (
                <picture key={s.desktopUrl + i} className={`hero__slide${i === slide ? " hero__slide--active" : ""}`}>
                  {s.mobileUrl && <source media="(max-width: 767px)" srcSet={s.mobileUrl} />}
                  <img className="hero__img" src={s.desktopUrl} alt="" />
                </picture>
              ))
            ) : (
              <picture className="hero__slide hero__slide--active">
                <source media="(max-width: 767px)" srcSet={FALLBACK_SLIDE.mobile} />
                <img className="hero__img" src={FALLBACK_SLIDE.desktop} alt="" />
              </picture>
            )}
          </div>

          <div className="hero__overlay" />
          <img className="hero__light" src={`${ASSET}/light.png`} alt="" aria-hidden="true" />

          <div className={heroContentClassName}>
            {c?.hero.showEyebrow !== false && c?.hero.eyebrow && (
              <p className="hero__eyebrow" style={c.hero.eyebrowColor ? { color: c.hero.eyebrowColor } : undefined}>
                {c.hero.eyebrow}
              </p>
            )}
            <h1
              className="hero__title"
              id="hero-title"
              style={{
                ...(c?.hero.headlineColor ? { color: c.hero.headlineColor } : undefined),
                ...(c?.hero.showHeadline === false ? VISUALLY_HIDDEN : undefined),
              }}
            >
              {c?.hero.headline || restaurant.name}
            </h1>
            {c?.hero.showSubtitle !== false && heroSubtitle && (
              <p className="hero__subtitle" style={c?.hero.subtitleColor ? { color: c.hero.subtitleColor } : undefined}>
                {heroSubtitle}
              </p>
            )}
            <div className="hero__actions">
              <Link className="btn btn--primary btn--lg" to="/order">
                {c?.hero.primaryLabel || "Order Now"}
              </Link>
              <a className="btn btn--secondary btn--lg" href="#menu">
                {c?.hero.secondaryLabel || "Explore Menu"}
              </a>
            </div>
          </div>
        </section>

        {c?.serve.enabled !== false && (
          <section className="section serve" id="serve" aria-labelledby="serve-title">
            <div className="container">
              <header className="section__header section__header--center">
                <h2 className="section__title section__title--display" id="serve-title">
                  {c?.serve.title || "What We Serve"}
                </h2>
                {c?.serve.lead && <p className="section__lead">{c.serve.lead}</p>}
              </header>

              <ul className="serve__grid" role="list">
                {serveItems.map((item, i) => (
                  <li
                    className={`food-card${flipped === `${item.title}-${i}` ? " food-card--flipped" : ""}`}
                    key={`${item.title}-${i}`}
                  >
                    <button
                      className="food-card__inner"
                      type="button"
                      aria-expanded={flipped === `${item.title}-${i}`}
                      aria-label={`${item.title} - tap for details`}
                      onClick={() => setFlipped((cur) => (cur === `${item.title}-${i}` ? null : `${item.title}-${i}`))}
                    >
                      <span className="food-card__face food-card__face--front">
                        {item.imageUrl ? (
                          <img className="food-card__img" src={item.imageUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="placeholder">{item.title}</span>
                        )}
                      </span>
                      <span className="food-card__face food-card__face--back">
                        <span className="food-card__title">{item.title}</span>
                        <span className="food-card__text">{item.text}</span>
                        <span className="food-card__rule" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {c?.serve.hint !== "" && <p className="serve__hint">{c?.serve.hint || "Tap a dish to know more"}</p>}
            </div>
          </section>
        )}

        {c?.menu.enabled !== false && bestsellers.length > 0 && (
          <section className="section menu" id="menu" aria-labelledby="menu-title">
            <div className="container">
              <header className="section__header">
                {c?.menu.eyebrow && <p className="section__eyebrow">{c.menu.eyebrow}</p>}
                <h2 className="section__title" id="menu-title">
                  {c?.menu.title || "Crowd favourites"}
                </h2>
                {c?.menu.lead && <p className="section__lead">{c.menu.lead}</p>}
              </header>

              <div className="menu__category">
                <ul role="list">
                  {bestsellers.map((item) => (
                    <li className="menu-item" key={item._id}>
                      <div className="menu-item__info">
                        <p className="menu-item__name">
                          {item.bestsellerEmoji ? `${item.bestsellerEmoji} ` : ""}
                          {item.name}
                        </p>
                        {item.description && <p className="menu-item__desc">{item.description}</p>}
                      </div>
                      <p className="menu-item__price">₹{item.price.toFixed(2)}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="menu__footer">
                <Link className="btn btn--primary btn--lg" to="/order">
                  {c?.menu.ctaLabel || "See the full menu"}
                </Link>
              </div>
            </div>
          </section>
        )}

        {c?.reels.enabled && c.reels.items.length > 0 && (
          <section className="section reels" id="gallery" aria-labelledby="reels-title">
            <div className="container">
              <header className="section__header section__header--center">
                <h2 className="section__title section__title--display reels__title" id="reels-title">
                  {c.reels.title}
                </h2>
                {c.reels.lead && <p className="section__lead reels__lead">{c.reels.lead}</p>}
              </header>

              <ul className="reels__grid" role="list">
                {c.reels.items.map((reel, i) => (
                  <li className="reel-card" key={i}>
                    <a
                      className="reel-card__link"
                      href={reel.url || "#"}
                      target={reel.url ? "_blank" : undefined}
                      rel="noopener"
                      aria-label={reel.caption}
                    >
                      {reel.imageUrl ? (
                        <img className="reel-card__media" src={reel.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="reel-card__media placeholder placeholder--dark" aria-hidden="true" />
                      )}
                      <span className="reel-card__shade" aria-hidden="true" />
                      <span className="reel-card__play" aria-hidden="true" />
                      <span className="reel-card__caption">{reel.caption}</span>
                    </a>
                  </li>
                ))}
              </ul>

              {c.reels.followUrl && (
                <div className="reels__footer">
                  <a className="btn btn--light" href={c.reels.followUrl} target="_blank" rel="noopener">
                    {c.reels.followLabel || "Follow us"}
                  </a>
                </div>
              )}
            </div>
          </section>
        )}

        {c?.story.enabled !== false && (storyText || storyQuote) && (
          <section className="section section--tinted story" id="story" aria-labelledby="story-title">
            <div className="container story__inner">
              <figure className="story__media">
                {storyImage ? (
                  <img className="story__img" src={storyImage} alt={storyTitle} />
                ) : (
                  <div className="story__img placeholder placeholder--tall" role="img" aria-label={restaurant.name}>
                    {restaurant.name}
                  </div>
                )}
                {(c?.story.caption || founder) && (
                  <figcaption className="story__caption">{c?.story.caption || founder?.name}</figcaption>
                )}
              </figure>

              <div className="story__content">
                {c?.story.eyebrow && <p className="section__eyebrow">{c.story.eyebrow}</p>}
                <h2 className="section__title" id="story-title">
                  {storyTitle}
                </h2>
                {storyText && <p className="story__text">{storyText}</p>}
                {storyQuote && (
                  <blockquote className="story__quote">
                    {storyQuote}
                    <cite className="story__cite">
                      {c?.story.quoteCite ||
                        (founder ? `${founder.name}${founder.title ? `, ${founder.title}` : ""}` : "")}
                    </cite>
                  </blockquote>
                )}
              </div>
            </div>
          </section>
        )}

        {awards.length > 0 && (
          <section className="section" id="awards" aria-labelledby="awards-title">
            <div className="container">
              <header className="section__header section__header--center">
                <p className="section__eyebrow">Recognition</p>
                <h2 className="section__title" id="awards-title">
                  Awards &amp; Recognition
                </h2>
              </header>
              <ul className="outlets__grid" role="list">
                {awards.map((award) => (
                  <li className="outlet-card" key={award._id}>
                    {award.year && <p className="outlet-card__city">{award.year}</p>}
                    <h3 className="outlet-card__area">{award.title}</h3>
                    {award.issuer && <p className="outlet-card__hours">{award.issuer}</p>}
                    {award.description && <p className="outlet-card__address">{award.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {reviews.length > 0 && (
          <section className="section section--tinted" id="reviews" aria-labelledby="reviews-title">
            <div className="container">
              <header className="section__header section__header--center">
                <p className="section__eyebrow">Testimonials</p>
                <h2 className="section__title" id="reviews-title">
                  What our guests say
                </h2>
              </header>
              <ul className="outlets__grid" role="list">
                {reviews.slice(0, 6).map((review) => (
                  <li className="outlet-card" key={review._id}>
                    <p className="outlet-card__city" aria-label={`${review.rating} out of 5`}>
                      {"★".repeat(review.rating)}
                    </p>
                    <p className="outlet-card__address">“{review.comment}”</p>
                    <p className="outlet-card__hours">{review.customerName}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {c?.outlets.enabled !== false && (
          <section className="section outlets" id="locations" aria-labelledby="outlets-title">
            <div className="container">
              <header className="section__header">
                <p className="section__eyebrow">{c?.outlets.eyebrow || "Visit Us"}</p>
                <h2 className="section__title" id="outlets-title">
                  {c?.outlets.title || "Find us"}
                </h2>
              </header>

              <ul className="outlets__grid" role="list">
                {outletItems.length > 0
                  ? outletItems.map((o, i) => (
                      <li className={`outlet-card${o.comingSoon ? " outlet-card--soon" : ""}`} key={i}>
                        {o.city && <p className="outlet-card__city">{o.city}</p>}
                        {o.area && <h3 className="outlet-card__area">{o.area}</h3>}
                        {o.address && <address className="outlet-card__address">{o.address}</address>}
                        {o.hours && <p className="outlet-card__hours">{o.hours}</p>}
                        {o.mapUrl && (
                          <a className="btn btn--outline btn--block" href={o.mapUrl} target="_blank" rel="noopener">
                            Get Directions
                          </a>
                        )}
                      </li>
                    ))
                  : restaurant.address && (
                      <li className="outlet-card">
                        <p className="outlet-card__city">{restaurant.name}</p>
                        <address className="outlet-card__address">{restaurant.address}</address>
                        <a
                          className="btn btn--outline btn--block"
                          href={`https://maps.google.com/?q=${encodeURIComponent(`${restaurant.name} ${restaurant.address}`)}`}
                          target="_blank"
                          rel="noopener"
                        >
                          Get Directions
                        </a>
                      </li>
                    )}

                <li className="outlet-card outlet-card--soon">
                  <p className="outlet-card__city">Dining in?</p>
                  <h3 className="outlet-card__area">Order from your table</h3>
                  <p className="outlet-card__address">
                    Scan the QR code on your table to browse the menu and order without waiting.
                  </p>
                  <Link className="btn btn--primary btn--block" to="/order">
                    Start Ordering
                  </Link>
                </li>
              </ul>
            </div>
          </section>
        )}

        {c?.partnership.enabled !== false && (
          <section className="cta-band" id="partnership" aria-labelledby="cta-title">
            <div className="container cta-band__inner">
              <div>
                <h2 className="cta-band__title" id="cta-title">
                  {c?.partnership.title || "Hungry already?"}
                </h2>
                <p className="cta-band__text">
                  {c?.partnership.text || "Scan the QR code at your table, or tap below to start your order."}
                </p>
              </div>
              {c?.partnership.ctaUrl ? (
                <a className="btn btn--light btn--lg" href={c.partnership.ctaUrl} target="_blank" rel="noopener">
                  {c.partnership.ctaLabel || "Enquire now"}
                </a>
              ) : (
                <Link className="btn btn--light btn--lg" to="/order">
                  {c?.partnership.ctaLabel || "Start Ordering"}
                </Link>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="footer" id="footer">
        <div className="container footer__inner">
          <div className="footer__col footer__col--brand">
            <a className="footer__logo" href="#top">
              <img className="footer__logo-img" src={logo} alt={restaurant.name} width={64} height={64} />
            </a>
            {(c?.footer.tagline || restaurant.tagline) && (
              <p className="footer__tagline">{c?.footer.tagline || restaurant.tagline}</p>
            )}
          </div>

          <nav className="footer__col" aria-labelledby="footer-links-title">
            <h3 className="footer__heading" id="footer-links-title">
              Quick Links
            </h3>
            <ul className="footer__list" role="list">
              {NAV_LINKS.map(([href, label]) => (
                <li key={href}>
                  <a className="footer__link" href={href}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {(c?.footer.contacts.length || restaurant.address) && (
            <div className="footer__col">
              <h3 className="footer__heading">Contact</h3>
              {c?.footer.contacts.length ? (
                <ul className="footer__list" role="list">
                  {c.footer.contacts.map((link, i) => (
                    <li key={i}>
                      <a className="footer__link" href={link.url}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <address className="footer__tagline">{restaurant.address}</address>
              )}
            </div>
          )}

          {c?.footer.socials.length ? (
            <div className="footer__col">
              <h3 className="footer__heading">Follow Us</h3>
              <ul className="footer__list" role="list">
                {c.footer.socials.map((link, i) => (
                  <li key={i}>
                    <a className="footer__link" href={link.url} target="_blank" rel="noopener">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="footer__col">
              <h3 className="footer__heading">Order</h3>
              <ul className="footer__list" role="list">
                <li>
                  <Link className="footer__link" to="/order">
                    Start your order
                  </Link>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="footer__bottom">
          <div className="container">
            <p className="footer__copy">
              &copy; {new Date().getFullYear()} {restaurant.name}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
