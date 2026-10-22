import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "selforder_pos_panel_width";
const MIN = 320;
const DEFAULT = 440;

function load(): number {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isFinite(value) && value >= MIN ? value : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Width of the order panel on desktop: drag the divider (or use the arrow keys); it is remembered per device. */
export function useResizablePanel() {
  const [width, setWidth] = useState(load);
  const dragging = useRef(false);

  const clamp = useCallback((value: number) => {
    const max = Math.max(MIN, Math.min(760, Math.round(window.innerWidth * 0.6)));
    return Math.min(max, Math.max(MIN, Math.round(value)));
  }, []);

  const save = useCallback((value: number) => {
    try {
      localStorage.setItem(KEY, String(value));
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (dragging.current) setWidth(clamp(window.innerWidth - e.clientX));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = "";
      setWidth((w) => {
        save(w);
        return w;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [clamp, save]);

  const set = useCallback(
    (value: number) => {
      const next = clamp(value);
      setWidth(next);
      save(next);
    },
    [clamp, save],
  );

  const handleProps = {
    role: "separator" as const,
    "aria-orientation": "vertical" as const,
    "aria-label": "Resize the order panel",
    "aria-valuenow": width,
    "aria-valuemin": MIN,
    tabIndex: 0,
    title: "Drag to resize. Double-click to reset.",
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      document.body.style.userSelect = "none";
    },
    onDoubleClick: () => set(DEFAULT),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        set(width + 24);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        set(width - 24);
      }
    },
  };

  return { width, handleProps };
}
