import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Thin progress bar at the top of the window that runs on every route change, giving
 * instant "the page is loading" feedback. It is driven by navigation, not API calls, so
 * it never flickers from the app's background polling (chat/invoice refresh on a timer).
 */
export default function RouteProgress() {
  const location = useLocation();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    setWidth(0);
    // Jump out fast, ease toward the end, then complete and fade - the usual nprogress feel.
    const toStart = setTimeout(() => setWidth(75), 50);
    const toEnd = setTimeout(() => setWidth(100), 350);
    const hide = setTimeout(() => setVisible(false), 700);
    return () => {
      clearTimeout(toStart);
      clearTimeout(toEnd);
      clearTimeout(hide);
    };
  }, [location.pathname]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5" aria-hidden>
      <div
        className="h-full bg-orange-600 transition-[width,opacity] duration-300 ease-out"
        style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
      />
    </div>
  );
}
