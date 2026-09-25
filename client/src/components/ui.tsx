import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const TOUCH_TARGET = "min-h-[44px] sm:min-h-[38px] touch-manipulation";

// 16px on mobile stops iOS Safari from auto-zooming when a field takes focus.
const FIELD_TEXT = "text-base sm:text-sm";

const FIELD = `w-full min-w-0 max-w-full rounded-md border border-slate-300 px-3 py-2 ${FIELD_TEXT} ${TOUCH_TARGET} focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500`;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const base = `inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${TOUCH_TARGET} select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 transition`;
  const variants: Record<string, string> = {
    primary: "bg-orange-600 text-white hover:bg-orange-700",
    secondary: "bg-slate-200 text-slate-800 hover:bg-slate-300",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${FIELD} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${FIELD} ${props.className ?? ""}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4 ${className}`}>{children}</div>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />;
}

export function Badge({ tone, children }: { tone: "green" | "gray" | "red" | "amber" | "blue"; children: ReactNode }) {
  const tones: Record<string, string> = {
    green: "bg-green-100 text-green-800",
    gray: "bg-slate-100 text-slate-700",
    red: "bg-red-100 text-red-800",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-3 overflow-x-auto sm:mx-0">
      <div className="inline-block min-w-full px-3 align-middle sm:px-0">{children}</div>
    </div>
  );
}
