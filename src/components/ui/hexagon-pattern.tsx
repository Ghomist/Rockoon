import { useEffect, useId, useState } from "react"

import { cn } from "@/lib/utils"

interface HexagonPatternProps extends React.SVGProps<SVGSVGElement> {
  radius?: number
  gap?: number
  x?: number
  y?: number
  direction?: "horizontal" | "vertical"
  strokeDasharray?: string
  hexagons?: Array<[col: number, row: number]>
  /** 启用动态填充：随机蜂巢定时闪烁开关，类似 FlickeringGrid。
   *  传入 flickerCols + flickerRows 即启用。 */
  flickerCols?: number
  flickerRows?: number
  /** 填充密度 0–1，默认 0.08 */
  flickerDensity?: number
  /** 更新间隔 ms，默认 700 */
  flickerInterval?: number
  /** 填充蜂巢颜色（CSS color 字符串），默认跟随前景色 */
  fillColor?: string
  /** 填充蜂巢透明度 0–1，默认 0.07 */
  fillOpacity?: number
  className?: string
}

type HexPoint = readonly [number, number]

function hexVertexList(
  cx: number,
  cy: number,
  r: number,
  direction: "horizontal" | "vertical"
): HexPoint[] {
  const startAngle = direction === "horizontal" ? 0 : 30
  return Array.from({ length: 6 }, (_, i) => {
    const angle = ((startAngle + i * 60) * Math.PI) / 180
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const
  })
}

function hexPoints(
  cx: number,
  cy: number,
  r: number,
  direction: "horizontal" | "vertical"
): string {
  return hexVertexList(cx, cy, r, direction)
    .map(([px, py]) => `${px},${py}`)
    .join(" ")
}

function edgeLexKey(a: HexPoint, b: HexPoint): string {
  const [p, q] =
    a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a]
  return `${p[0].toFixed(6)},${p[1].toFixed(6)}|${q[0].toFixed(6)},${q[1].toFixed(6)}`
}

function collectUniqueHexEdges(
  centers: [number, number][],
  r: number,
  direction: "horizontal" | "vertical"
): [HexPoint, HexPoint][] {
  const seen = new Set<string>()
  const edges: [HexPoint, HexPoint][] = []
  for (const [cx, cy] of centers) {
    const verts = hexVertexList(cx, cy, r, direction)
    for (let i = 0; i < 6; i++) {
      const a = verts[i]
      const b = verts[(i + 1) % 6]
      const key = edgeLexKey(a, b)
      if (!seen.has(key)) {
        seen.add(key)
        edges.push([a, b])
      }
    }
  }
  return edges
}

function isSolidStrokeDasharray(strokeDasharray: string): boolean {
  const t = strokeDasharray.trim()
  return t === "" || t === "none" || t === "0"
}

function getHexSpacing(
  r: number,
  direction: "horizontal" | "vertical",
  gap: number
): {
  colStep: number
  rowStep: number
  tileW: number
  tileH: number
} {
  const sqrt3 = Math.sqrt(3)

  if (direction === "horizontal") {
    const colStep = (3 * r) / 2 + (sqrt3 * gap) / 2
    const rowStep = sqrt3 * r + gap

    return {
      colStep,
      rowStep,
      tileW: colStep * 2,
      tileH: rowStep
    }
  }

  const colStep = sqrt3 * r + gap
  const rowStep = (3 * r) / 2 + (sqrt3 * gap) / 2

  return {
    colStep,
    rowStep,
    tileW: colStep,
    tileH: rowStep * 2
  }
}

function getTileGeometry(
  r: number,
  direction: "horizontal" | "vertical",
  gap: number
): {
  tileW: number
  tileH: number
  centers: [number, number][]
} {
  if (direction === "horizontal") {
    const { colStep, rowStep, tileW, tileH } = getHexSpacing(r, direction, gap)

    const canonical: [number, number][] = [
      [colStep / 2, rowStep / 2],
      [(colStep * 3) / 2, rowStep]
    ]

    const centers: [number, number][] = []
    for (const [cx, cy] of canonical) {
      centers.push([cx, cy])
      if (cy - r < 0) centers.push([cx, cy + tileH])
      if (cy + r > tileH) centers.push([cx, cy - tileH])
      if (cx - r < 0) centers.push([cx + tileW, cy])
      if (cx + r > tileW) centers.push([cx - tileW, cy])
      if (cy - r < 0 && cx - r < 0) centers.push([cx + tileW, cy + tileH])
      if (cy - r < 0 && cx + r > tileW) centers.push([cx - tileW, cy + tileH])
      if (cy + r > tileH && cx - r < 0) centers.push([cx + tileW, cy - tileH])
      if (cy + r > tileH && cx + r > tileW)
        centers.push([cx - tileW, cy - tileH])
    }

    return { tileW, tileH, centers }
  } else {
    const { colStep, rowStep, tileW, tileH } = getHexSpacing(r, direction, gap)

    const canonical: [number, number][] = [
      [colStep / 2, rowStep / 2],
      [colStep, (rowStep * 3) / 2]
    ]

    const centers: [number, number][] = []
    for (const [cx, cy] of canonical) {
      centers.push([cx, cy])
      if (cy - r < 0) centers.push([cx, cy + tileH])
      if (cy + r > tileH) centers.push([cx, cy - tileH])
      if (cx - r < 0) centers.push([cx + tileW, cy])
      if (cx + r > tileW) centers.push([cx - tileW, cy])
      if (cy - r < 0 && cx - r < 0) centers.push([cx + tileW, cy + tileH])
      if (cy - r < 0 && cx + r > tileW) centers.push([cx - tileW, cy + tileH])
      if (cy + r > tileH && cx - r < 0) centers.push([cx + tileW, cy - tileH])
      if (cy + r > tileH && cx + r > tileW)
        centers.push([cx - tileW, cy - tileH])
    }

    return { tileW, tileH, centers }
  }
}

function hexCenter(
  col: number,
  row: number,
  r: number,
  direction: "horizontal" | "vertical",
  gap: number
): [number, number] {
  const { colStep, rowStep } = getHexSpacing(r, direction, gap)
  if (direction === "horizontal") {
    return [
      col * colStep + colStep / 2,
      row * rowStep + rowStep / 2 + (col % 2 !== 0 ? rowStep / 2 : 0)
    ]
  }
  return [
    col * colStep + colStep / 2 + (row % 2 !== 0 ? colStep / 2 : 0),
    row * rowStep + rowStep / 2
  ]
}

/** 随机生成填充蜂巢坐标键集合。 */
function seedFlicker(
  cols: number,
  rows: number,
  density: number
): Set<string> {
  const target = Math.max(1, Math.floor(cols * rows * density))
  const s = new Set<string>()
  while (s.size < target) {
    s.add(`${Math.floor(Math.random() * cols)},${Math.floor(Math.random() * rows)}`)
  }
  return s
}

// Adapted from magicui HexagonPattern
// (https://magicui.design/docs/components/hexagon-pattern)
export function HexagonPattern({
  radius = 40,
  gap = 0,
  x = -1,
  y = -1,
  strokeDasharray = "0",
  direction = "horizontal",
  hexagons,
  flickerCols,
  flickerRows,
  flickerDensity = 0.08,
  flickerInterval = 700,
  fillColor = "var(--foreground)",
  fillOpacity = 0.07,
  className,
  ...props
}: HexagonPatternProps) {
  const id = useId()

  const flickerOn = flickerCols != null && flickerRows != null
  const [flickerCells, setFlickerCells] = useState<Set<string>>(
    () =>
      flickerOn
        ? seedFlicker(flickerCols!, flickerRows!, flickerDensity)
        : new Set<string>()
  )

  useEffect(() => {
    if (!flickerOn) return
    const cols = flickerCols!
    const rows = flickerRows!
    setFlickerCells(seedFlicker(cols, rows, flickerDensity))
    const target = Math.max(1, Math.floor(cols * rows * flickerDensity))
    const randKey = () =>
      `${Math.floor(Math.random() * cols)},${Math.floor(Math.random() * rows)}`
    const timer = setInterval(() => {
      setFlickerCells(prev => {
        const next = new Set(prev)
        // 翻转约 20% 目标数量，维持总量
        const flips = Math.max(1, Math.floor(target * 0.2))
        for (let i = 0; i < flips; i++) {
          const k = randKey()
          if (next.has(k)) next.delete(k)
          else next.add(k)
        }
        while (next.size > target) {
          const arr = [...next]
          next.delete(arr[Math.floor(Math.random() * arr.length)])
        }
        while (next.size < target) next.add(randKey())
        return next
      })
    }, flickerInterval)
    return () => clearInterval(timer)
  }, [
    flickerOn,
    flickerCols,
    flickerRows,
    flickerDensity,
    flickerInterval
  ])

  const { tileW, tileH, centers } = getTileGeometry(radius, direction, gap)
  const solidStroke = isSolidStrokeDasharray(strokeDasharray)
  const dashedEdges = solidStroke
    ? null
    : collectUniqueHexEdges(centers, radius, direction)

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full fill-none stroke-foreground/[0.07]",
        className
      )}
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={tileW}
          height={tileH}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          {solidStroke
            ? centers.map(([cx, cy]) => (
                <polygon
                  key={`${cx}-${cy}`}
                  points={hexPoints(cx, cy, radius, direction)}
                  strokeDasharray={strokeDasharray}
                />
              ))
            : dashedEdges?.map(([a, b]) => (
                <line
                  key={edgeLexKey(a, b)}
                  x1={a[0]}
                  x2={b[0]}
                  y1={a[1]}
                  y2={b[1]}
                  strokeDasharray={strokeDasharray}
                />
              ))}
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill={`url(#${id})`} stroke="none" />

      {flickerOn ? (
        <svg aria-hidden="true" className="overflow-visible" x={x} y={y}>
          {Array.from(
            { length: flickerRows! * flickerCols! },
            (_, i) => {
              const col = i % flickerCols!
              const row = Math.floor(i / flickerCols!)
              const [cx, cy] = hexCenter(col, row, radius, direction, gap)
              return (
                <polygon
                  key={`${col}-${row}`}
                  points={hexPoints(cx, cy, radius - 1, direction)}
                  strokeWidth="0"
                  fill={fillColor}
                  fillOpacity={fillOpacity}
                  style={{
                    opacity: flickerCells.has(`${col},${row}`) ? 1 : 0,
                    transition: `opacity ${flickerInterval}ms ease-out`
                  }}
                />
              )
            }
          )}
        </svg>
      ) : (
        hexagons &&
        hexagons.length > 0 && (
          <svg aria-hidden="true" className="overflow-visible" x={x} y={y}>
            {hexagons.map(([col, row]) => {
              const [cx, cy] = hexCenter(col, row, radius, direction, gap)
              return (
                <polygon
                  key={`${col}-${row}`}
                  points={hexPoints(cx, cy, radius - 1, direction)}
                  strokeWidth="0"
                  fill={fillColor}
                  fillOpacity={fillOpacity}
                />
              )
            })}
          </svg>
        )
      )}
    </svg>
  )
}
