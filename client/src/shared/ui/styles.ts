const TOUCH_TARGET = "min-h-[44px] sm:min-h-[40px] touch-manipulation";

const FIELD_TEXT = "text-base sm:text-sm";

export const FIELD = `w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-xs ${FIELD_TEXT} ${TOUCH_TARGET} placeholder:text-slate-400 transition-[border-color,box-shadow] focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-red-500 aria-invalid:ring-red-500/15`;

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft" | "success";
export type ButtonSize = "sm" | "md" | "lg";

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-orange-600 text-white shadow-xs hover:bg-orange-700 active:bg-orange-800",
  secondary: "border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900",
  outline: "border border-orange-300 bg-white text-orange-700 hover:bg-orange-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-800",
  soft: "bg-orange-50 text-orange-700 hover:bg-orange-100",
  success: "bg-emerald-600 text-white shadow-xs hover:bg-emerald-700",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "min-h-[36px] sm:min-h-[32px] px-3 py-1.5 text-xs gap-1.5 rounded-md",
  md: `${TOUCH_TARGET} px-4 py-2 text-sm gap-2 rounded-lg`,
  lg: "min-h-[48px] px-5 py-2.5 text-base gap-2 rounded-lg",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = "") {
  return `inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap select-none touch-manipulation transition-[background-color,color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`;
}
