import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { extractErrorMessage } from "../../../shared/api/client";
import type { PublicDisplay } from "../api";
import { usePublicDisplay } from "../queries";

const STYLES = `
.dsp-slide { position: absolute; inset: 0; opacity: 0; transition: opacity 1s ease, transform 1s ease; }
.dsp-slide.is-on { opacity: 1; z-index: 2; }
.dsp-slide.is-off { z-index: 1; }
.dsp-slide--slide { transform: translateX(100%); opacity: 1; }
.dsp-slide--slide.is-on { transform: translateX(0); }
.dsp-slide--slide.is-off { transform: translateX(-100%); }
.dsp-slide--slide:not(.is-on):not(.is-off) { transition: none; }
.dsp-slide--zoom img { transform: scale(1); transition: transform 12s linear; }
.dsp-slide--zoom.is-on img { transform: scale(1.08); }
@media (prefers-reduced-motion: reduce) {
  .dsp-slide, .dsp-slide--zoom img { transition: none; }
}
`;

/** Shows one slide after another, each for its own number of seconds, and starts over after the last. */
function useSlideIndex(display: PublicDisplay | undefined) {
  const [index, setIndex] = useState(0);
  const count = display?.slides.length ?? 0;
  // A changed slideshow can be shorter than where the screen was in the old one.
  const current = count > 0 ? index % count : 0;
  const seconds =
    display?.slides[current]?.seconds ?? display?.intervalSeconds ?? 8;

  useEffect(() => {
    if (count < 2) return;
    const timer = window.setTimeout(
      () => setIndex((i) => (i + 1) % count),
      seconds * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [current, count, seconds]);

  return current;
}

function useFullscreen() {
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  return { full, toggle };
}

/** Keeps a TV from going to sleep while the slideshow runs (where the browser allows it). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let stopped = false;
    const request = async () => {
      try {
        const wakeLock = (
          navigator as Navigator & {
            wakeLock?: { request: (t: "screen") => Promise<typeof lock> };
          }
        ).wakeLock;
        const got = await wakeLock?.request("screen");
        if (stopped) await got?.release();
        else lock = got ?? null;
      } catch {
        /* not supported, or the tab is hidden: the screen just follows its own power settings */
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);
}

export default function DisplayScreen() {
  const { code = "" } = useParams();
  const query = usePublicDisplay(code);
  const display = query.data;
  const index = useSlideIndex(display);
  const { full, toggle } = useFullscreen();
  const [hint, setHint] = useState(true);
  useWakeLock();

  // The hint and the mouse pointer go away on their own, like on any signage screen.
  useEffect(() => {
    document.title = display?.name ?? "Display";
    const timer = window.setTimeout(() => setHint(false), 6000);
    return () => window.clearTimeout(timer);
  }, [display?.name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  let body;
  if (!display) {
    body = (
      <div className="flex h-full items-center justify-center p-8 text-center text-lg text-white/70">
        {query.isError ? extractErrorMessage(query.error) : "Loading…"}
      </div>
    );
  } else if (display.slides.length === 0) {
    body = (
      <div className="flex h-full items-center justify-center p-8 text-center text-lg text-white/70">
        No images have been added to this display yet.
      </div>
    );
  } else {
    body = display.slides.map((slide, i) => {
      // The slide on screen is on, the one before it is leaving, and the rest wait out of sight.
      const count = display.slides.length;
      const state =
        i === index
          ? "is-on"
          : i === (index - 1 + count) % count
            ? "is-off"
            : "";
      return (
        <div
          key={`${i}-${slide.url}`}
          className={`dsp-slide dsp-slide--${display.transition} ${state}`}
        >
          <img
            src={slide.url}
            alt={slide.caption}
            decoding="async"
            loading={
              i === index || i === (index + 1) % display.slides.length
                ? "eager"
                : "lazy"
            }
            className={`h-full w-full ${display.fit === "contain" ? "object-contain" : "object-cover"}`}
            draggable={false}
          />
          {display.showCaptions && slide.caption && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-8 pt-16 pb-8 text-center text-3xl font-semibold text-white">
              {slide.caption}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black"
      style={{ cursor: hint ? "default" : "none" }}
      onClick={toggle}
      onMouseMove={() => {
        setHint(true);
        window.clearTimeout(
          (window as unknown as { __dspHint?: number }).__dspHint,
        );
        (window as unknown as { __dspHint?: number }).__dspHint =
          window.setTimeout(() => setHint(false), 3000);
      }}
    >
      <style>{STYLES}</style>
      {body}
      {hint && !full && (
        <div className="pointer-events-none absolute top-4 right-4 z-10 rounded-lg bg-black/60 px-3 py-2 text-sm text-white">
          Click or press F for full screen
        </div>
      )}
    </div>
  );
}
