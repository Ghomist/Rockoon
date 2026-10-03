import SkyTargetPicker from "@/components/SkyTargetPicker";
import { t } from "@/i18n";
import { dialog } from "@/utils/ui/feedback";

/**
 * 问用户：这个天空盒装到哪一关？
 *
 * 返回要替换成的关卡字母（`"X"` = 保留占位符、不动原版关卡；用户取消返回 `null`）。
 */
export function askSkyTarget(): Promise<SkyLetter | null> {
  return new Promise(resolve => {
    // 用闭包记录当前选择（对话框回调里读）；Promise 只认第一次 resolve
    let letter: SkyLetter = "X";
    dialog.create({
      title: t("brp.skyTarget.title"),
      className: "sm:max-w-lg",
      content: () => (
        <SkyTargetPicker
          onChange={next => {
            letter = next;
          }}
        />
      ),
      positiveText: t("brp.skyTarget.confirm"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: () => resolve(letter),
      onClose: () => resolve(null)
    });
  });
}
