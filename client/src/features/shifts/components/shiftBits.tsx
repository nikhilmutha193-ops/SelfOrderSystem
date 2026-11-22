export function AmountChips({ values, onPick }: { values: number[]; onPick: (v: number) => void }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className="min-h-[36px] rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 tabular-nums hover:bg-slate-100"
        >
          ₹{v}
        </button>
      ))}
    </div>
  );
}
