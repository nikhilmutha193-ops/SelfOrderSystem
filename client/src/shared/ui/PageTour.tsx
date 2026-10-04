import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "./ui";

export interface TourStep {
  /** Matches an element's `data-tour="<target>"` attribute somewhere on the page. */
  target: string;
  title: string;
  description: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const POPOVER_GAP = 12;
const POPOVER_WIDTH = 336; // keep in sync with the w-[...] class below
const VIEWPORT_MARGIN = 16;
const DEFAULT_POPOVER_HEIGHT = 170; // used for one frame, before the real popover is measured

/**
 * A click-to-start guided tour: dims the page, cuts a spotlight around each step's target element
 * (found via its `data-tour` attribute) and shows a popover with Back/Next/Skip. If a step's
 * target isn't on the page right now (e.g. an owner-only button for a non-owner), it's skipped
 * automatically in whichever direction the guide was already moving. The popover always keeps
 * itself fully inside the viewport - it anchors to whatever part of the target is actually
 * visible, not the target's full bounds, so a target taller than the screen (a long table) can
 * never push the Next/Done button off-screen.
 */
export function PageTour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [popoverTop, setPopoverTop] = useState(VIEWPORT_MARGIN);
  const directionRef = useRef<1 | -1>(1);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const step = open ? steps[index] : undefined;

  useEffect(() => {
    if (!open || !step) return;
    let cancelled = false;
    let frame: number;

    function measure() {
      // A responsive layout sometimes renders two elements for the same target (e.g. a mobile
      // tab bar and a desktop sidebar, one hidden via CSS at a time) - pick whichever one is
      // actually visible, since a hidden element measures as a zero-size rect.
      const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${step!.target}"]`);
      let el: HTMLElement | null = null;
      for (const candidate of candidates) {
        const r = candidate.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          el = candidate;
          break;
        }
      }
      if (!el) {
        const nextIndex = index + directionRef.current;
        if (nextIndex >= 0 && nextIndex < steps.length) setIndex(nextIndex);
        else onClose();
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      frame = requestAnimationFrame(() => {
        if (cancelled) return;
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, step]);

  useLayoutEffect(() => {
    if (!rect) return;
    const height = popoverRef.current?.getBoundingClientRect().height ?? DEFAULT_POPOVER_HEIGHT;
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.top + rect.height, window.innerHeight);
    const spaceBelow = window.innerHeight - visibleBottom;
    const spaceAbove = visibleTop;

    const top =
      spaceBelow >= height + POPOVER_GAP + VIEWPORT_MARGIN || spaceBelow >= spaceAbove
        ? visibleBottom + POPOVER_GAP
        : visibleTop - POPOVER_GAP - height;

    setPopoverTop(Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - VIEWPORT_MARGIN - height)));
  }, [rect, step]);

  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  function next() {
    directionRef.current = 1;
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function prev() {
    directionRef.current = -1;
    setIndex((i) => Math.max(i - 1, 0));
  }

  if (!open || !step) return null;

  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const left = rect
    ? Math.min(Math.max(rect.left, VIEWPORT_MARGIN), window.innerWidth - VIEWPORT_MARGIN - POPOVER_WIDTH)
    : 0;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Page guide">
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-lg transition-all duration-200"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-900/55" />
      )}

      {rect && (
        <div
          ref={popoverRef}
          className="fixed z-10 w-[21rem] max-w-[calc(100vw-2rem)] rounded-xl bg-white p-4 shadow-xl"
          style={{ left, top: popoverTop }}
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-slate-400 hover:text-slate-600"
              aria-label="Close guide"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1.5 text-sm text-slate-600">{step.description}</p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400 tabular-nums">
              {index + 1} / {steps.length}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                Skip
              </button>
              {!isFirst && (
                <Button type="button" size="sm" variant="secondary" onClick={prev}>
                  Back
                </Button>
              )}
              <Button type="button" size="sm" onClick={isLast ? onClose : next}>
                {isLast ? "Done" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

interface TourControls {
  setSteps: (steps: TourStep[]) => void;
  start: () => void;
  close: () => void;
  hasSteps: boolean;
}

const TourContext = createContext<TourControls | null>(null);

/** Hosts the single guide overlay for the whole admin app - wrap the admin layout in this once.
 *  Individual pages register their own steps with usePageTour; the header's Guide button
 *  (useTour) starts whatever the current page has registered. */
export function TourProvider({ children }: { children: ReactNode }) {
  const [steps, setStepsState] = useState<TourStep[]>([]);
  const [open, setOpen] = useState(false);

  const setSteps = useCallback((next: TourStep[]) => setStepsState(next), []);
  const start = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const controls = useMemo<TourControls>(
    () => ({ setSteps, start, close, hasSteps: steps.length > 0 }),
    [setSteps, start, close, steps.length]
  );

  return (
    <TourContext.Provider value={controls}>
      {children}
      <PageTour steps={steps} open={open} onClose={close} />
    </TourContext.Provider>
  );
}

/** Registers this page's guide steps for as long as it's mounted. Pass a memoized array (e.g.
 *  from useMemo) - a new array identity on every render would re-register on every render. */
export function usePageTour(steps: TourStep[]) {
  // Depend on setSteps itself (stable - see TourProvider), not the whole controls object: that
  // object's identity changes whenever `steps.length` flips (which is exactly what this effect
  // causes), so depending on it here would re-fire the effect every time it runs, forever.
  const setSteps = useContext(TourContext)?.setSteps;
  useEffect(() => {
    if (!setSteps) return;
    setSteps(steps);
    return () => setSteps([]);
  }, [setSteps, steps]);
}

/** For the header's Guide button: whether the current page has a guide, and a way to start it. */
export function useTour(): { hasSteps: boolean; start: () => void } {
  const ctx = useContext(TourContext);
  return { hasSteps: ctx?.hasSteps ?? false, start: ctx?.start ?? (() => {}) };
}
