import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { dialog, message } from "@/utils/ui/feedback";
import { t } from "@/i18n";
import { listen } from "@tauri-apps/api/event";

const CATEGORY_LABEL_KEY: Record<BrpManifest["category"], string> = {
  map: "brp.category.map",
  bmod: "brp.category.bmod",
  bmodp: "brp.category.bmodp",
  sound: "brp.category.sound",
  sky: "brp.category.sky",
  texture: "brp.category.texture",
  "x-patch": "brp.category.xpatch"
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
  const loading = message.loading(t("brp.importing"), { duration: 0 });
  try {
    const result = await backend.importBrp(filePath, instance.path);
    loading.destroy();
    dialog.success({
      title: t("brp.import.successTitle"),
      content: t("brp.import.success", {
        what: describeBrp(result.manifest),
        count: result.installedPaths.length,
        target: result.targetDescription
      }),
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
 *  via Tauri events, shows loading/success/error toast. */
export async function importFromUrl(url: string): Promise<string | null> {
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
    const id = await backend.startBrpImport(url, instance.path);

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
