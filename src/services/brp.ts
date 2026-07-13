import backend from "@/backend";
import { useAppStore } from "@/stores/app";
import { message } from "@/utils/ui/feedback";
import { t } from "@/i18n";

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
    message.error(t("brp.error.noInstance"));
    return null;
  }
  const loading = message.loading(t("brp.importing"), { duration: 0 });
  try {
    const result = await backend.importBrp(filePath, instance.path);
    loading.destroy();
    message.success(
      t("brp.import.success", {
        what: describeBrp(result.manifest),
        count: result.installedPaths.length,
        target: result.targetDescription
      }),
      { duration: 6000 }
    );
    return result;
  } catch (e) {
    loading.destroy();
    message.error(t("brp.import.failed", { reason: String(e) }), {
      duration: 8000
    });
    return null;
  }
}

/** Download a BRP from `url`, then validate + install. */
export async function importFromUrl(
  url: string
): Promise<BrpImportResult | null> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) {
    message.error(t("brp.error.noInstance"));
    return null;
  }
  const loading = message.loading(t("brp.downloading"), { duration: 0 });
  try {
    const result = await backend.importBrpFromUrl(url, instance.path);
    loading.destroy();
    message.success(
      t("brp.import.success", {
        what: describeBrp(result.manifest),
        count: result.installedPaths.length,
        target: result.targetDescription
      }),
      { duration: 6000 }
    );
    return result;
  } catch (e) {
    loading.destroy();
    message.error(t("brp.import.failed", { reason: String(e) }), {
      duration: 8000
    });
    return null;
  }
}
