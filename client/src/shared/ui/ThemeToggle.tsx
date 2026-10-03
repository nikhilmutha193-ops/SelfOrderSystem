import { Monitor, Moon, Sun } from "lucide-react";

import { setThemePreference, useResolvedTheme, useThemePreference, type ThemePreference } from "../theme";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Device", icon: Monitor },
];

export function ThemeChoice() {
  const preference = useThemePreference();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={() => setThemePreference(value)}
          className={`flex min-h-[36px] items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${
            preference === value ? "bg-white text-slate-900 shadow-card" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Icon size={14} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggleButton({ className = "" }: { className?: string }) {
  const theme = useResolvedTheme();
  const next = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => setThemePreference(next)}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white ${className}`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
