import { useId, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/*
 * 和 Ballance 有关的几种背景。颜色都取 var(--primary)，跟着主题色走；
 * 透明度压得很低，只当氛围，不抢内容。动画都很慢，且尊重「减少动态效果」。
 */

/** 天空：几团很淡的主色光晕缓慢漂移（关卡里的天空盒） */
export function AuroraBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="bg-drift-a absolute -top-[30%] -left-[15%] size-[70vmax] rounded-full bg-primary opacity-[0.2] blur-[110px] dark:opacity-[0.22]" />
      <div
        className="bg-drift-b absolute -right-[20%] -bottom-[35%] size-[65vmax] rounded-full opacity-[0.17] blur-[120px] dark:opacity-[0.18]"
        style={{ background: "oklch(from var(--primary) l c calc(h + 55))" }}
      />
      <div
        className="bg-drift-c absolute top-[30%] left-[40%] size-[35vmax] rounded-full opacity-[0.12] blur-[90px] dark:opacity-[0.13]"
        style={{ background: "oklch(from var(--primary) l c calc(h - 40))" }}
      />
    </div>
  );
}

/** 路块：等距视角的方块阵列（启动器 logo 里那个箱子），整体极慢地斜向平移 */
export function IsometricBackground() {
  const id = useId().replace(/:/g, "");
  const a = 26; // 菱形边长
  const W = a * Math.sqrt(3);
  const H = 3 * a;

  const cube = (cx: number, cy: number) => {
    const top = `${cx},${cy - a}`;
    const ur = `${cx + W / 2},${cy - a / 2}`;
    const lr = `${cx + W / 2},${cy + a / 2}`;
    const bottom = `${cx},${cy + a}`;
    const ll = `${cx - W / 2},${cy + a / 2}`;
    const ul = `${cx - W / 2},${cy - a / 2}`;
    const c = `${cx},${cy}`;
    return (
      <g key={`${cx}-${cy}`}>
        {/* 顶面最亮，左侧面次之，右侧面留空 —— 有一点立体感 */}
        <polygon
          points={`${top} ${ur} ${c} ${ul}`}
          className="fill-primary/[0.06] dark:fill-primary/[0.07]"
        />
        <polygon
          points={`${ul} ${c} ${bottom} ${ll}`}
          className="fill-primary/[0.025] dark:fill-primary/[0.03]"
        />
        <polygon
          points={`${top} ${ur} ${lr} ${bottom} ${ll} ${ul}`}
          fill="none"
        />
        <polyline points={`${ul} ${c} ${ur}`} fill="none" />
        <line x1={cx} y1={cy} x2={cx} y2={cy + a} />
      </g>
    );
  };

  return (
    <svg
      className="absolute inset-0 size-full stroke-primary/[0.13] [mask-image:radial-gradient(ellipse_75%_70%_at_50%_45%,black,transparent)] dark:stroke-primary/[0.12]"
      strokeWidth={1}
    >
      <defs>
        <pattern id={id} width={W} height={H} patternUnits="userSpaceOnUse">
          {cube(W / 2, a)}
          {cube(0, 2.5 * a)}
          {cube(W, 2.5 * a)}
          {cube(0, -0.5 * a)}
          {cube(W, -0.5 * a)}
          {/* 平移刚好一个周期，循环无缝 */}
          <animateTransform
            attributeName="patternTransform"
            type="translate"
            from="0 0"
            to={`${W} ${H}`}
            dur="120s"
            repeatCount="indefinite"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} stroke="none" />
    </svg>
  );
}

const RAILS = [
  {
    d: "M -120 760 C 300 620, 520 920, 880 720 S 1380 500, 1720 660",
    dur: 34,
    begin: 0
  },
  {
    d: "M -120 250 C 260 380, 600 120, 940 260 S 1420 430, 1720 290",
    dur: 42,
    begin: -18
  }
];

/** 轨道：两条弯曲的铁轨（双轨 + 枕木），木球沿着轨道慢慢滚过去 */
export function RollingBackground() {
  return (
    <svg
      className="absolute inset-0 size-full"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
    >
      {RAILS.map((rail, i) => (
        <g key={i} fill="none">
          {/* 枕木 */}
          <path
            d={rail.d}
            className="stroke-primary/[0.1]"
            strokeWidth={26}
            strokeDasharray="3 24"
          />
          {/* 双轨：粗线上再盖一条背景色细线，中间空出来就是两根轨 */}
          <path
            d={rail.d}
            className="stroke-primary/[0.22] dark:stroke-primary/[0.24]"
            strokeWidth={16}
          />
          <path d={rail.d} stroke="var(--background)" strokeWidth={12} />
          <Ball path={rail.d} dur={rail.dur} begin={rail.begin} />
        </g>
      ))}
    </svg>
  );
}

function Ball({
  path,
  dur,
  begin
}: {
  path: string;
  dur: number;
  begin: number;
}) {
  return (
    <g className="opacity-75 dark:opacity-85">
      <animateMotion
        path={path}
        dur={`${dur}s`}
        begin={`${begin}s`}
        repeatCount="indefinite"
        rotate="auto"
      />
      {/* 投影 */}
      <ellipse cx={3} cy={4} rx={16} ry={15} className="fill-primary/10" />
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0"
          to="360"
          dur="2.6s"
          repeatCount="indefinite"
        />
        <circle
          r={15}
          fill="var(--background)"
          className="stroke-primary/60"
          strokeWidth={1.5}
        />
        {/* 木球的纹路 */}
        <path
          d="M -6 -13.5 Q 6 0 -6 13.5"
          className="stroke-primary/50"
          strokeWidth={1.2}
          fill="none"
        />
        <path
          d="M 4 -14.5 Q 14 0 4 14.5"
          className="stroke-primary/35"
          strokeWidth={1}
          fill="none"
        />
      </g>
    </g>
  );
}

/** 三球：纸球、木球、石球三颗大球的线稿，各自极慢地浮动、自转 */
export function BallsBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <BallSketch
        kind="wood"
        className="bg-float left-[6%] bottom-[8%] size-60"
        style={{ animationDuration: "46s" }}
      />
      <BallSketch
        kind="stone"
        className="bg-float -top-[6%] right-[4%] size-80"
        style={{ animationDuration: "58s", animationDelay: "-20s" }}
      />
      <BallSketch
        kind="paper"
        className="bg-float right-[22%] -bottom-[6%] size-44"
        style={{ animationDuration: "40s", animationDelay: "-8s" }}
      />
    </div>
  );
}

function BallSketch({
  kind,
  className,
  style
}: {
  kind: "wood" | "stone" | "paper";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="-100 -100 200 200"
      className={cn(
        "absolute fill-none stroke-primary/[0.14] dark:stroke-primary/[0.16]",
        className
      )}
      style={style}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle r={96} className="fill-primary/[0.03]" />
      {kind === "wood" && (
        <>
          <path d="M -40 -87 Q 30 0 -40 87" />
          <path d="M 5 -96 Q 75 0 5 96" />
          <path d="M -78 -56 Q -22 0 -78 56" />
          <path d="M 48 -84 Q 98 0 48 84" opacity={0.6} />
        </>
      )}
      {kind === "stone" && (
        <>
          {/* 石球：斑驳的坑点 + 两道浅浅的裂纹 */}
          <circle cx={-34} cy={-42} r={7} />
          <circle cx={30} cy={-18} r={4} />
          <circle cx={-10} cy={22} r={5.5} />
          <circle cx={46} cy={44} r={8} />
          <circle cx={-52} cy={36} r={3.5} />
          <circle cx={12} cy={-66} r={3} />
          <path d="M -78 -10 Q -52 -22 -38 2 T -6 -6" />
          <path d="M 8 56 Q 22 70 44 72" />
          <path d="M -88 30 Q -70 70 -30 88" opacity={0.6} />
        </>
      )}
      {kind === "paper" && (
        <>
          {/* 纸球：揉皱的折痕 */}
          <path d="M -86 -32 L -38 -20 L -12 -62 L 30 -38 L 68 -62" />
          <path d="M -38 -20 L -22 24 L -74 48" />
          <path d="M -22 24 L 26 14 L 30 -38" />
          <path d="M 26 14 L 62 42 L 90 18" />
          <path d="M 26 14 L 8 58 L -14 92" />
          <path d="M 62 42 L 44 82" opacity={0.7} />
          <path d="M -12 -62 L -30 -94" opacity={0.7} />
        </>
      )}
    </svg>
  );
}
