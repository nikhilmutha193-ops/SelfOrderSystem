/** Full-area loading state - used as the Suspense fallback while a page's code or data loads. */
export default function PageLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-white"
      role="status"
      aria-live="polite"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-orange-600 border-t-transparent" />
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <span className="sr-only">Loading</span>
    </div>
  );
}
