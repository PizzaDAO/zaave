// A pie that fills slice by slice. `slices` may be fractional (0-8); the next slice fills partially.

const R = 90;
const C = 100;

function wedge(i: number) {
  const a0 = (i / 8) * 2 * Math.PI - Math.PI / 2;
  const a1 = ((i + 1) / 8) * 2 * Math.PI - Math.PI / 2;
  const x0 = C + R * Math.cos(a0);
  const y0 = C + R * Math.sin(a0);
  const x1 = C + R * Math.cos(a1);
  const y1 = C + R * Math.sin(a1);
  return `M${C},${C} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

function pepperoni(i: number) {
  const a = ((i + 0.5) / 8) * 2 * Math.PI - Math.PI / 2;
  return { cx: C + 52 * Math.cos(a), cy: C + 52 * Math.sin(a) };
}

export function PizzaPie({ slices, size = 220 }: { slices: number; size?: number }) {
  const clamped = Math.max(0, Math.min(8, slices));
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`Pizza meter: ${clamped.toFixed(1)} of 8 slices`}
      className="max-w-full"
    >
      <circle cx={C} cy={C} r={R + 8} fill="var(--crust)" />
      {Array.from({ length: 8 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, clamped - i));
        const p = pepperoni(i);
        return (
          <g key={i}>
            <path d={wedge(i)} fill="var(--border)" stroke="var(--background)" strokeWidth="2" />
            <path d={wedge(i)} fill="var(--cheese)" opacity={fill} stroke="var(--background)" strokeWidth="2" />
            <circle cx={p.cx} cy={p.cy} r="9" fill="var(--tomato)" opacity={fill >= 1 ? 1 : 0} />
          </g>
        );
      })}
    </svg>
  );
}
