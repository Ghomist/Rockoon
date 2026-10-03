import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { t } from "@/i18n";

/**
 * 原版关卡 → 天空盒编号（Ballance 中文 wiki「背景」页）。
 * 顺序是打乱的（不是按关卡顺序完工的），第 4 关与第 13 关共用 F。
 */
export const LEVEL_SKY_LETTER: Record<number, SkyLetter> = {
  1: "L",
  2: "E",
  3: "A",
  4: "F",
  5: "C",
  6: "H",
  7: "D",
  8: "G",
  9: "K",
  10: "B",
  11: "J",
  12: "I",
  13: "F"
};

const LEVELS = Object.keys(LEVEL_SKY_LETTER).map(Number);

/**
 * 天空盒包的「装到哪一关」选择器。
 *
 * 包里的文件是 `Sky_X_<方位>.bmp`（X 是占位符），选中某一关后由后端把 X 换成那一关的
 * 字母，从而只替换那一关的天空；选「保留 X」则不动原版关卡（自制地图槽位）。
 */
export default function SkyTargetPicker({
  onChange
}: {
  onChange: (letter: SkyLetter) => void;
}) {
  const [value, setValue] = useState<string>("X");

  const handleChange = (next: string) => {
    setValue(next);
    onChange(
      (next === "X" ? "X" : LEVEL_SKY_LETTER[Number(next)]) as SkyLetter
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("brp.skyTarget.hint")}</p>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="X">{t("brp.skyTarget.keepX")}</SelectItem>
          {LEVELS.map(level => {
            const letter = LEVEL_SKY_LETTER[level];
            const shared = level === 13;
            return (
              <SelectItem key={level} value={String(level)}>
                {t("brp.skyTarget.level", { level, letter })}
                {shared ? t("brp.skyTarget.sharedWith4") : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t("brp.skyTarget.note")}</p>
    </div>
  );
}
