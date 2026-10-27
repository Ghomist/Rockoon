import {
  ArrowDownToLine,
  BookOpen,
  Circle,
  Download,
  FileCog,
  Film,
  Gamepad2,
  Github,
  Image as ImageIcon,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Music,
  Palette,
  PenTool,
  Puzzle,
  Settings,
  SlidersHorizontal,
  Trophy,
  Wrench,
  type LucideIcon
} from "lucide-react";

/**
 * 菜单里用 kebab-case 的图标名（"gamepad-2"），这里换成 lucide 组件。
 *
 * 必须显式列出：`import * as LucideIcons from "lucide-react"` 会让 rollup 无法
 * tree-shake，整套 1600+ 图标全进 bundle（实测多出 ~600KB）。菜单/外链新增图标
 * 时记得在这里补一行，否则会退化成圆点。
 */
const ICONS: Record<string, LucideIcon> = {
  "arrow-down-to-line": ArrowDownToLine,
  "book-open": BookOpen,
  download: Download,
  "file-cog": FileCog,
  film: Film,
  "gamepad-2": Gamepad2,
  github: Github,
  image: ImageIcon,
  map: MapIcon,
  "map-pin": MapPin,
  "message-square": MessageSquare,
  music: Music,
  palette: Palette,
  "pen-tool": PenTool,
  puzzle: Puzzle,
  settings: Settings,
  "sliders-horizontal": SlidersHorizontal,
  trophy: Trophy,
  wrench: Wrench
};

export const resolveIcon = (name: string): LucideIcon => ICONS[name] ?? Circle;
