import backend from "@/backend";
import { askSkyTarget } from "@/services/sky";
import { useAppStore } from "@/stores/app";
import { dialog, message } from "@/utils/ui/feedback";
import { t } from "@/i18n";
import { listen } from "@tauri-apps/api/event";

const CATEGORY_LABEL_KEY: Record<BrpManifest["category"], string> = {
  map: "brp.category.map",
  mod: "brp.category.mod",
  bmod: "brp.category.bmod",
  bmodp: "brp.category.bmodp",
  sound: "brp.category.sound",
  sky: "brp.category.sky",
  texture: "brp.category.texture",
  "x-patch": "brp.category.xpatch"
};

/** 加载器与产物的显示名（BML / BML+ 是产品名，不翻译） */
const LOADER_NAME: Record<string, string> = { bml: "BML", bmlp: "BML+", none: "" };
const FORMAT_NAME: Record<string, string> = { bmod: "BML", bmodp: "BML+" };

/**
 * mod 装完后的补充说明：一个 mod 包里可能带 BML 与 BML+ 两份产物，
 * 实际装了哪份取决于实例里装的加载器 —— 两种情况下要说一句，否则用户会莫名其妙。
 */
export const modInstallNotice = (r: BrpImportResult): string => {
  if (r.manifest.category !== "mod") return "";
  if (r.modLoader === "none") return t("brp.modNotice.noLoader");
  if (r.modVariantMismatch) {
    const installed = r.installedModFormats
      .map(f => FORMAT_NAME[f] ?? f)
      .join(" / ");
    return t("brp.modNotice.mismatch", {
      loader: LOADER_NAME[r.modLoader] ?? r.modLoader,
      installed
    });
  }
  return "";
};

/** Render a short description of what the manifest contains, for notifications. */
export const describeBrp = (m: BrpManifest): string => {
  const cat = t(CATEGORY_LABEL_KEY[m.category]);
  const name = m.name ?? "";
  const authors = (m.authors ?? (m.author ? [m.author] : [])).join(", ");
  const parts = [cat, name].filter(Boolean);
  let head = parts.join(" · ");
  if (authors) head += ` (${authors})`;
  return head;
};

/** Import a BRP file from a local path. */
export async function importFromFile(
  filePath: string
): Promise<BrpImportResult | null> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) {
    dialog.error({
      title: t("brp.import.failedTitle"),
      content: t("brp.error.noInstance"),
      positiveText: t("common.dialog.confirm")
    });
    return null;
  }
  // 天空盒包的文件名里 X 是占位符：先校验拿到类别，是 sky 就先问装到哪一关
  let skyLetter: SkyLetter | undefined;
  try {
    const info = await backend.validateBrp(filePath, instance.path);
    if (info.manifest.category === "sky") {
      const chosen = await askSkyTarget();
      if (chosen === null) return null; // 用户取消了安装
      skyLetter = chosen;
    }
  } catch (e) {
    dialog.error({
      title: t("brp.import.failedTitle"),
      content: t("brp.import.failed", { reason: String(e) }),
      positiveText: t("common.dialog.confirm")
    });
    return null;
  }

  const loading = message.loading(t("brp.importing"), { duration: 0 });
  try {
    const result = await backend.importBrp(filePath, instance.path, skyLetter);
    loading.destroy();
    const notice = modInstallNotice(result);
    dialog.success({
      title: t("brp.import.successTitle"),
      content: `${t("brp.import.success", {
        what: describeBrp(result.manifest),
        count: result.installedPaths.length,
        target: result.targetDescription
      })}${notice ? `\n\n${notice}` : ""}`,
      positiveText: t("common.dialog.confirm")
    });
    useAppStore.getState().triggerRefresh();
    return result;
  } catch (e) {
    loading.destroy();
    dialog.error({
      title: t("brp.import.failedTitle"),
      content: t("brp.import.failed", { reason: String(e) }),
      positiveText: t("common.dialog.confirm")
    });
    return null;
  }
}

/** Download a BRP from `url`, then validate + install.
 *  Non-blocking: fires `startBrpImport` on backend, listens for completion
 *  via Tauri events, shows loading/success/error toast.
 *  `skyLetter` 只对 sky 包有意义（把 Sky_X_* 的占位符换成目标关卡字母）。 */
export async function importFromUrl(
  url: string,
  skyLetter?: SkyLetter
): Promise<string | null> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) {
    dialog.error({
      title: t("brp.import.failedTitle"),
      content: t("brp.error.noInstance"),
      positiveText: t("common.dialog.confirm")
    });
    return null;
  }
  const loading = message.loading(t("brp.downloading"), { duration: 0 });
  try {
    const id = await backend.startBrpImport(url, instance.path, skyLetter);

    // Listen for completion — fire-and-forget, toast will update on result
    const unlisten = await listen<BrpImportCompleteEvent>(
      "brp-import:complete",
      event => {
        if (event.payload.id !== id) return;
        unlisten();
        loading.destroy();
        if (event.payload.success && event.payload.manifest) {
          const m = event.payload.manifest;
          dialog.success({
            title: t("brp.import.successTitle"),
            content: t("brp.import.success", {
              what: describeBrp(m.manifest),
              count: m.installedPaths.length,
              target: m.targetDescription
            }),
            positiveText: t("common.dialog.confirm")
          });
          useAppStore.getState().triggerRefresh();
        } else {
          dialog.error({
            title: t("brp.import.failedTitle"),
            content: t("brp.import.failed", {
              reason: event.payload.error ?? ""
            }),
            positiveText: t("common.dialog.confirm")
          });
        }
      }
    );
    return id;
  } catch (e) {
    loading.destroy();
    dialog.error({
      title: t("brp.import.failedTitle"),
      content: t("brp.import.failed", { reason: String(e) }),
      positiveText: t("common.dialog.confirm")
    });
    return null;
  }
}
