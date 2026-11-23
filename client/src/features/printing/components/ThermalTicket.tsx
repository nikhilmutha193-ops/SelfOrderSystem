export interface ThermalRun {
  text: string;
  bold: boolean;
  small: boolean;
  wide: number;
  tall: number;
}

export type ThermalLine =
  | { kind: "text"; align: "left" | "center" | "right"; runs: ThermalRun[] }
  | { kind: "image"; align: "left" | "center" | "right"; width: number; height: number; png: string }
  | { kind: "cut" };

export interface ThermalPreview {
  /** Characters across the roll at the normal text size (32 for 58 mm, 48 for 80 mm). */
  columns: number;
  lines: ThermalLine[];
}

const LINE_HEIGHT = 1.25;
const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" } as const;

/**
 * What a thermal printer puts on the paper: the printer's own bytes (made by the server from the unsaved settings),
 * drawn in a monospace font with its bold, double-size and narrow text, pictures and cut.
 */
export function ThermalTicket({ preview }: { preview: ThermalPreview }) {
  // A 58 mm roll is 384 dots wide and an 80 mm one 576, which is what a printed picture's width is measured against.
  const paperDots = preview.columns <= 32 ? 384 : 576;
  return (
    <div
      className="mx-auto bg-white text-slate-900 shadow-md ring-1 ring-slate-200"
      style={{
        width: `calc(${preview.columns}ch + 28px)`,
        maxWidth: "100%",
        padding: "14px 14px 18px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 13,
        lineHeight: LINE_HEIGHT,
      }}
      role="img"
      aria-label="Thermal printout preview"
    >
      {preview.lines.map((line, i) => {
        if (line.kind === "cut") {
          return (
            <div key={i} className="my-2 border-t border-dashed border-slate-400 text-center text-[10px] text-slate-400">
              cut
            </div>
          );
        }
        if (line.kind === "image") {
          return (
            <div key={i} className="flex" style={{ justifyContent: JUSTIFY[line.align] }}>
              <img
                alt=""
                src={`data:image/png;base64,${line.png}`}
                style={{ width: `${(line.width / paperDots) * 100}%`, imageRendering: "pixelated", display: "block" }}
              />
            </div>
          );
        }
        const tallest = Math.max(1, ...line.runs.map((r) => r.tall));
        return (
          <div
            key={i}
            style={{ textAlign: line.align, whiteSpace: "pre", height: `${LINE_HEIGHT * tallest}em`, overflow: "hidden" }}
          >
            {line.runs.length === 0
              ? " "
              : line.runs.map((run, j) => (
                  <span
                    key={j}
                    style={{
                      display: "inline-block",
                      fontWeight: run.bold ? 700 : 400,
                      fontSize: `${(run.small ? 0.75 : 1) * run.wide}em`,
                      transform: run.tall !== run.wide ? `scaleY(${run.tall / run.wide})` : undefined,
                      transformOrigin: "left top",
                    }}
                  >
                    {run.text}
                  </span>
                ))}
          </div>
        );
      })}
    </div>
  );
}
