import type { NameFont, RestaurantNamePart } from "../../lib/types";
import { BrandName, NAME_FONTS } from "./BrandName";
import { Button, Input, Select } from "./ui";

/** One word (and the space after it) per part, so each word can be styled on its own. */
function splitIntoWords(name: string): RestaurantNamePart[] {
  return (name.match(/\S+\s*/g) ?? []).map((text) => ({ text, font: "heading", bold: true, italic: false, color: "", size: 100 }));
}

/**
 * Styles the restaurant name piece by piece, for example "Benne" in bold terracotta and ".Kaffi" in a script font. The
 * pieces are joined in order to make the name shown on the website, the order pages and the QR cards.
 */
export function NameStyleEditor({
  name,
  parts,
  onChange,
}: {
  name: string;
  parts: RestaurantNamePart[];
  onChange: (parts: RestaurantNamePart[]) => void;
}) {
  const update = (index: number, changes: Partial<RestaurantNamePart>) =>
    onChange(parts.map((p, i) => (i === index ? { ...p, ...changes } : p)));
  const move = (index: number, to: number) => {
    const next = [...parts];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };
  const joined = parts.map((p) => p.text).join("");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
      <div>
        <p className="text-sm font-medium text-slate-700">Restaurant name style</p>
        <p className="text-xs text-slate-500">
          Give each piece of the name its own font, size, weight, slant and colour (size 100% is the same size as the text
          around the name, 150% is half as big again). Leave it empty to show the name in the
          page's normal style. Receipts and tickets keep the plain name.
        </p>
      </div>

      <div className="rounded-md bg-slate-50 px-3 py-4 text-center text-3xl text-slate-900" aria-label="Preview of the name">
        <BrandName name={name} parts={parts} />
      </div>
      {parts.length > 0 && joined !== name && (
        <p className="text-xs text-amber-700">
          The pieces read "{joined}", which is not the restaurant name "{name}". That is fine for a styled logo, but check
          the spelling.
        </p>
      )}

      {parts.map((part, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
            <label className="text-xs font-medium text-slate-600">
              Text (spaces count)
              <Input className="mt-1" value={part.text} maxLength={40} onChange={(e) => update(i, { text: e.target.value })} />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Font
              <Select className="mt-1" value={part.font ?? "heading"} onChange={(e) => update(i, { font: e.target.value as NameFont })}>
                {NAME_FONTS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!part.bold} onChange={(e) => update(i, { bold: e.target.checked })} />
              Bold
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!part.italic} onChange={(e) => update(i, { italic: e.target.checked })} />
              Italic
            </label>
            <label className="flex items-center gap-2">
              Size
              <Input
                className="!w-20"
                type="number"
                min={50}
                max={300}
                step={5}
                aria-label="Size in percent"
                value={part.size ?? 100}
                onChange={(e) => update(i, { size: Math.min(300, Math.max(50, Math.round(Number(e.target.value) || 100))) })}
              />
              %
            </label>
            <label className="flex items-center gap-2">
              Colour
              <input
                type="color"
                className="h-8 w-12 cursor-pointer rounded border border-slate-300"
                value={part.color || "#000000"}
                onChange={(e) => update(i, { color: e.target.value })}
              />
            </label>
            {part.color && (
              <button type="button" className="text-xs text-slate-500 underline" onClick={() => update(i, { color: "" })}>
                Same colour as around it
              </button>
            )}
            <span className="ml-auto flex items-center gap-3 text-xs">
              <button type="button" className="font-semibold text-slate-600 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)}>
                Move left
              </button>
              <button
                type="button"
                className="font-semibold text-slate-600 disabled:opacity-30"
                disabled={i === parts.length - 1}
                onClick={() => move(i, i + 1)}
              >
                Move right
              </button>
              <button type="button" className="font-semibold text-red-600" onClick={() => onChange(parts.filter((_, j) => j !== i))}>
                Remove
              </button>
            </span>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={parts.length >= 8}
          onClick={() => onChange([...parts, { text: "", font: "heading", bold: false, italic: false, color: "", size: 100 }])}
        >
          Add a piece
        </Button>
        <Button type="button" variant="secondary" disabled={!name.trim()} onClick={() => onChange(splitIntoWords(name))}>
          Start with one piece per word
        </Button>
        {parts.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => onChange([])}>
            Use the plain name
          </Button>
        )}
      </div>
    </div>
  );
}
