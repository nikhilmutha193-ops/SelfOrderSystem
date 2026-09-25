import type { SVGProps } from "react";

type DoodleProps = SVGProps<SVGSVGElement>;

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 100 100",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function CoffeeCupDoodle(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M32 38 Q29 62 33 72 Q40 82 55 82 Q70 82 76 72 Q80 62 77 38 Z" />
      <ellipse cx="54.5" cy="38" rx="22.5" ry="5" />
      <path d="M22 55 Q34 60 24 68" />
      <path d="M40 30 Q37 20 41 12" />
      <path d="M55 30 Q52 18 58 8" />
      <path d="M69 30 Q66 20 71 13" />
    </svg>
  );
}

export function DosaSwirlDoodle(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M50 50 Q68 32 55 20 Q35 8 20 25 Q6 42 22 60 Q40 80 65 68 Q84 58 78 38" />
      <path d="M50 50 Q40 45 42 38" />
    </svg>
  );
}

export function ChiliDoodle(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M38 16 Q30 10 34 20" />
      <path d="M36 18 Q18 26 16 44 Q14 64 30 76 Q48 88 66 74 Q78 64 70 50 Q62 38 48 44 Q34 50 36 18 Z" />
    </svg>
  );
}

export function LeafDoodle(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M50 8 Q82 28 74 58 Q66 88 50 94 Q34 88 26 58 Q18 28 50 8 Z" />
      <path d="M50 14 Q48 55 50 90" />
    </svg>
  );
}

export function SteamDoodle(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M30 90 Q25 70 34 58 Q42 46 32 30" />
      <path d="M55 90 Q50 66 60 52 Q68 40 56 20" />
      <path d="M78 90 Q73 72 80 60 Q86 50 76 36" />
    </svg>
  );
}

export function IdliDoodle(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="50" cy="80" rx="40" ry="6" />
      <path d="M20 79 Q17 66 28 61 Q50 53 72 61 Q83 66 80 79" />
      <path d="M27 61 Q25 50 34 45 Q50 38 66 45 Q75 50 73 61" />
      <path d="M35 45 Q33 36 40 32 Q50 27 60 32 Q67 36 65 45" />
    </svg>
  );
}

export function VadaDoodle(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M50 14 Q76 12 83 34 Q90 58 72 74 Q54 90 30 80 Q10 71 12 48 Q14 24 38 16 Q44 14 50 14 Z" />
      <path d="M50 38 Q60 37 62 48 Q64 60 52 62 Q40 64 38 52 Q36 40 50 38 Z" />
    </svg>
  );
}

export function CurryBowlDoodle(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M16 46 Q13 72 36 80 Q50 85 64 80 Q87 72 84 46 Z" />
      <ellipse cx="50" cy="46" rx="34" ry="7" />
      <path d="M33 28 Q30 18 35 10" />
      <path d="M50 26 Q47 16 52 6" />
      <path d="M67 28 Q64 18 69 10" />
    </svg>
  );
}

export function CoconutDoodle(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 46 Q15 76 50 84 Q85 76 80 46 Q76 14 50 14 Q24 14 20 46 Z" />
      <path d="M28 32 Q50 42 72 32" />
      <path d="M23 48 Q50 60 77 48" />
      <path d="M28 64 Q50 73 72 64" />
    </svg>
  );
}
