import { X } from "lucide-react";
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type DialogSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

let openCount = 0;

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    openCount += 1;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      openCount -= 1;
      if (openCount === 0) body.style.overflow = previous;
    };
  }, [active]);
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  onSubmit,
  dismissible = true,
  bodyClassName = "",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  dismissible?: boolean;
  bodyClassName?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useScrollLock(open);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(
      "[autofocus], input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])"
    );
    if (first && window.matchMedia("(pointer: fine)").matches) first.focus();
    else panel?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        closeRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, dismissible]);

  if (!open) return null;

  const content = (
    <>
      {(title || description) && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && (
              <h2 id={titleId} className="text-lg font-semibold text-slate-900">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      <div className={`ui-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 ${bodyClassName}`}>{children}</div>
      {footer && (
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-3 [&>*]:w-full sm:[&>*]:w-auto">
          {footer}
        </div>
      )}
    </>
  );

  const panelClass = `relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop outline-none animate-sheet-up sm:max-h-[85dvh] sm:rounded-2xl sm:animate-pop-in ${SIZES[size]}`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade-in"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      {onSubmit ? (
        <form
          ref={panelRef as unknown as React.RefObject<HTMLFormElement>}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          tabIndex={-1}
          onSubmit={onSubmit}
          className={panelClass}
        >
          {content}
        </form>
      ) : (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          tabIndex={-1}
          className={panelClass}
        >
          {content}
        </div>
      )}
    </div>,
    document.body
  );
}
