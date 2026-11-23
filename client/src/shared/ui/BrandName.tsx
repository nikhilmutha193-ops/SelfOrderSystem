import type { CSSProperties } from "react";

import type { NameFont, RestaurantNamePart } from "../../lib/types";

/** The fonts a part of the restaurant name can use (all but the last are loaded from Google Fonts in index.html). */
export const NAME_FONTS: { value: NameFont; label: string; family: string }[] = [
  { value: "heading", label: "Warm serif (default)", family: '"Fraunces", Georgia, "Times New Roman", serif' },
  { value: "clean", label: "Clean sans", family: '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif' },
  { value: "classic", label: "Classic serif", family: '"Playfair Display", Georgia, serif' },
  { value: "script", label: "Handwritten script", family: '"Dancing Script", "Brush Script MT", cursive' },
  { value: "display", label: "Tall display", family: '"Bebas Neue", Impact, "Arial Narrow", sans-serif' },
  { value: "mono", label: "Typewriter", family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { value: "elegant", label: "Elegant light serif", family: '"Cormorant Garamond", Georgia, serif' },
  { value: "modern", label: "Modern geometric", family: '"Montserrat", system-ui, sans-serif' },
  { value: "rounded", label: "Friendly rounded", family: '"Nunito", system-ui, sans-serif' },
  { value: "slab", label: "Sturdy slab serif", family: '"Roboto Slab", Georgia, serif' },
  { value: "condensed", label: "Condensed sans", family: '"Oswald", Impact, "Arial Narrow", sans-serif' },
  { value: "fancy", label: "Capitals, engraved", family: '"Cinzel", Georgia, serif' },
  { value: "calligraphy", label: "Calligraphy", family: '"Great Vibes", "Brush Script MT", cursive' },
  { value: "brush", label: "Brush script", family: '"Pacifico", "Brush Script MT", cursive' },
  { value: "retro", label: "Retro script", family: '"Lobster", "Brush Script MT", cursive' },
  { value: "marker", label: "Marker pen", family: '"Permanent Marker", "Comic Sans MS", cursive' },
  { value: "poster", label: "Heavy poster", family: '"Abril Fatface", Georgia, serif' },
];

const familyOf = (font: NameFont) => NAME_FONTS.find((f) => f.value === font)?.family;

/** The style of one part of the name. A part with nothing set inherits whatever the page puts around the name. */
export function partStyle(part: RestaurantNamePart): CSSProperties {
  return {
    ...(part.font && familyOf(part.font) && { fontFamily: familyOf(part.font) }),
    ...(part.bold !== undefined && { fontWeight: part.bold ? 800 : 400 }),
    ...(part.italic && { fontStyle: "italic" }),
    ...(part.color && { color: part.color }),
    ...(part.size && part.size !== 100 && { fontSize: `${part.size / 100}em`, lineHeight: 1.1 }),
  };
}

/**
 * The restaurant name, with each piece in its own font, weight, slant and colour when the owner styled it
 * (Settings > General > Restaurant name style); the plain name otherwise.
 */
export function BrandName({ name, parts }: { name: string; parts?: RestaurantNamePart[] | null }) {
  const styled = (parts ?? []).filter((p) => p.text);
  if (styled.length === 0) return <>{name}</>;
  return (
    <>
      {styled.map((part, i) => (
        <span key={i} style={partStyle(part)} className="whitespace-pre-wrap">
          {part.text}
        </span>
      ))}
    </>
  );
}
