/**
 * Decorative background textures.
 *
 * Both marks are pure vector and deliberately low-contrast: they are meant to
 * read as printed watermarking on paper, never as content.
 */

type DiffRow = { w: number; t?: "add" | "del" | "hl" };

const ROW_H = 26;

const DIFF_ROWS: DiffRow[] = [
  { w: 214 }, { w: 342 }, { w: 168, t: "add" }, { w: 288 },
  { w: 122 }, { w: 374, t: "del" }, { w: 252 }, { w: 304 },
  { w: 192, t: "add" }, { w: 332 }, { w: 146 }, { w: 266 },
  { w: 306, t: "hl" }, { w: 176 }, { w: 242 }, { w: 356 },
  { w: 206, t: "del" }, { w: 292 }, { w: 156 }, { w: 322 },
  { w: 228 }, { w: 274, t: "add" }, { w: 138 }, { w: 314 },
];

/** A column of code lines with a diff gutter — the thing this product changes. */
export function DiffTexture({ className }: { className?: string }) {
  const height = DIFF_ROWS.length * ROW_H + 16;

  return (
    <svg
      className={className}
      viewBox={`0 0 460 ${height}`}
      width="460"
      height={height}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="46" y1="0" x2="46" y2={height} stroke="#d7d2c6" strokeWidth="1" />
      {DIFF_ROWS.map((row, i) => {
        const y = 12 + i * ROW_H;
        const sign = row.t === "add" ? "+" : row.t === "del" ? "\u2212" : null;
        const color =
          row.t === "add" ? "#2c6e49"
          : row.t === "del" ? "#ab2b23"
          : row.t === "hl" ? "#0d6e66"
          : "#1b1a17";
        return (
          <g key={i}>
            <text
              x="34"
              y={y + 7.5}
              textAnchor="end"
              fontFamily="ui-monospace, SFMono-Regular, Consolas, monospace"
              fontSize="9.5"
              fill={sign ? color : "#8b857a"}
              opacity={sign ? 0.5 : 0.38}
            >
              {sign ?? i + 1}
            </text>
            <rect
              x="60"
              y={y}
              width={row.w}
              height="9"
              rx="4.5"
              fill={color}
              opacity={row.t ? 0.3 : 0.11}
            />
          </g>
        );
      })}
    </svg>
  );
}

const PIPE_X = 28;
const NODE_START = 40;
const NODE_GAP = 66;
const NODE_COUNT = 7;

const NODE_BARS: [number, number][] = [
  [150, 110], [120, 84], [164, 96], [132, 120],
  [156, 78], [140, 104], [118, 90],
];

/** The workflow itself: a linear pipeline with one change reverted. */
export function PipelineTexture({ className }: { className?: string }) {
  const lastY = NODE_START + (NODE_COUNT - 1) * NODE_GAP;
  const height = lastY + 34;

  return (
    <svg
      className={className}
      viewBox={`0 0 360 ${height}`}
      width="360"
      height={height}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <marker
          id="lcw-tex-arrow"
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 Z" fill="#0d6e66" />
        </marker>
      </defs>

      <line
        x1={PIPE_X}
        y1={NODE_START}
        x2={PIPE_X}
        y2={lastY}
        stroke="#d7d2c6"
        strokeWidth="1.5"
      />

      {Array.from({ length: NODE_COUNT }, (_, i) => {
        const cy = NODE_START + i * NODE_GAP;
        const highlighted = i === 0 || i === NODE_COUNT - 1;
        const regressed = i === 3;
        const stroke = regressed ? "#ab2b23" : highlighted ? "#0d6e66" : "#cfc9bd";
        const [w1, w2] = NODE_BARS[i];
        return (
          <g key={i}>
            <rect x="54" y={cy - 9} width={w1} height="6" rx="3" fill="#1b1a17" opacity="0.1" />
            <rect x="54" y={cy + 3} width={w2} height="6" rx="3" fill="#1b1a17" opacity="0.07" />
            <circle
              cx={PIPE_X}
              cy={cy}
              r="7"
              fill="#faf9f6"
              stroke={stroke}
              strokeWidth="1.5"
            />
          </g>
        );
      })}

      <path
        d={`M ${PIPE_X + 8} ${NODE_START + 4 * NODE_GAP} Q 176 ${NODE_START + 2.5 * NODE_GAP} ${PIPE_X + 8} ${NODE_START + NODE_GAP}`}
        stroke="#0d6e66"
        strokeWidth="1.5"
        strokeDasharray="5 4"
        strokeOpacity="0.5"
        markerEnd="url(#lcw-tex-arrow)"
      />
    </svg>
  );
}
