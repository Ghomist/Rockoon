import { Particles } from "@/components/ui/particles";
import { Meteors } from "@/components/ui/meteors";
import { HexagonPattern } from "@/components/ui/hexagon-pattern";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import {
  AuroraBackground,
  BallsBackground,
  IsometricBackground,
  RollingBackground
} from "@/components/backgrounds/BallanceBackgrounds";
import { usePrefStore } from "@/stores/pref";
import { usePrimaryRgb } from "@/utils/theme";

/**
 * 主窗口内容区后面的背景动效（pref.backgroundType）。
 * 全部用主题色上色；换主题色 / 明暗时跟着变。
 */
export default function AppBackground() {
  const type = usePrefStore(s => s.backgroundType);
  // 按类型换 key：切背景、刚启动时都慢慢淡进来，而不是一帧冒出来
  return (
    <div
      key={type}
      className="absolute inset-0 animate-in duration-1000 ease-out fade-in-0"
    >
      <Background type={type} />
    </div>
  );
}

function Background({ type }: { type: string }) {
  const particleColor = usePrimaryRgb();

  switch (type) {
    case "none":
      return null;
    case "aurora":
      return <AuroraBackground />;
    case "isometric":
      return <IsometricBackground />;
    case "rolling":
      return <RollingBackground />;
    case "balls":
      return <BallsBackground />;
    case "particles":
      return (
        <Particles
          className="absolute inset-0"
          quantity={120}
          color={particleColor}
          ease={80}
          refresh={false}
        />
      );
    case "meteors":
      return <Meteors number={16} />;
    case "hexagon":
      return (
        <HexagonPattern
          radius={36}
          gap={6}
          flickerCols={24}
          flickerRows={16}
          flickerDensity={0.08}
          flickerInterval={1200}
          fillColor="var(--primary)"
          fillOpacity={0.07}
          className="inset-y-[-10%] h-[120%] w-full skew-y-6 stroke-primary/[0.09] [mask-image:radial-gradient(900px_circle_at_center,white,transparent)]"
        />
      );
    default:
      return (
        <AnimatedGridPattern
          numSquares={40}
          maxOpacity={0.1}
          duration={3}
          repeatDelay={1}
          className="absolute inset-y-[-30%] h-[160%] w-full skew-y-12 fill-primary/20 stroke-primary/15 text-primary [mask-image:radial-gradient(500px_circle_at_center,white,transparent)]"
        />
      );
  }
}
