import backend from "@/backend";
import { askSkyTarget } from "@/services/sky";
import { useAppStore } from "@/stores/app";
import { useDownloadsStore } from "@/stores/downloads";
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

/** 一次 BRP 导入的结局：装好 / 失败 / 被取消 / 同一个任务已经在跑 */
export type BrpImportOutcome = "done" | "failed" | "cancelled" | "duplicate";

export interface BrpImportOptions {
  /** 任务标题（深链带来的资源名）；缺省时显示「开始下载资源…」 */
  title?: string;
  /** true = 这是被依赖的资源：失败多提示一句名字，成功不打扰 */
  isDependency?: boolean;
}

/** 占位任务 id：后端 id 要等 start 返回才拿到，先拿它登记任务（拿到后 update 替换） */
let taskSeq = 0;

/** Download a BRP from `url`, then validate + install.
 *  Non-blocking：把这次导入登记成「下载任务」（见 stores/downloads），进度与结果都写进
 *  任务里，只在开始/成功/失败时各弹一条 message —— 没有进度弹窗，切到别的页面也照样跑。
 *  `skyLetter` 只对 sky 包有意义（把 Sky_X_* 的占位符换成目标关卡字母）。 */
export async function importFromUrl(
  url: string,
  skyLetter?: SkyLetter,
  options: BrpImportOptions = {}
): Promise<BrpImportOutcome> {
  const instance = useAppStore.getState().selectedInstanceData;
  if (!instance) {
    message.error(t("brp.error.noInstance"));
    return "failed";
  }

  const title = options.title?.trim() ?? "";
  const { task, duplicate } = useDownloadsStore.getState().begin({
    id: `brp-${++taskSeq}`,
    key: `brp:${url}:${instance.path}`,
    kind: "brp",
    title,
    target: instance.path,
    cancellable: true,
    retry: () => void importFromUrl(url, skyLetter, options)
  });
  // 同一个资源已经在装了：不重复下载
  if (duplicate) return "duplicate";
  message.success(
    title ? t("downloads.started", { title }) : t("downloads.startedUnknown")
  );

  let id = task.id;
  const unlisten: (() => void)[] = [];

  try {
    unlisten.push(
      await listen<BrpImportProgressEvent>("brp-import:progress", event => {
        if (event.payload.id !== id) return;
        const downloads = useDownloadsStore.getState();
        downloads.progress(id, event.payload.downloaded, event.payload.total);
        if (event.payload.phase === "importing")
          downloads.update(id, { phase: "importing" });
      })
    );

    let settleComplete: (payload: BrpImportCompleteEvent) => void = () => {};
    const completed = new Promise<BrpImportCompleteEvent>(resolve => {
      settleComplete = resolve;
    });
    unlisten.push(
      await listen<BrpImportCompleteEvent>("brp-import:complete", event => {
        if (event.payload.id === id) settleComplete(event.payload);
      })
    );

    const backendId = await backend.startBrpImport(
      url,
      instance.path,
      skyLetter
    );
    // 任务 id 换成后端的，取消才能真的中断这次下载
    useDownloadsStore.getState().update(id, { id: backendId });
    id = backendId;

    const result = await completed;
    if (!result.success || !result.manifest) {
      const reason = result.error ?? t("brp.import.failedTitle");
      if (reason.includes("cancelled")) {
        useDownloadsStore.getState().markCancelled(id);
        return "cancelled";
      }
      useDownloadsStore.getState().fail(id, reason);
      message.error(
        options.isDependency
          ? t("brp.import.depFailed", { name: title })
          : t("brp.import.failed", { reason })
      );
      return "failed";
    }

    const m = result.manifest;
    const what = describeBrp(m.manifest);
    useDownloadsStore.getState().succeed(id, { title: what });
    useAppStore.getState().triggerRefresh();
    if (!options.isDependency) {
      const notice = modInstallNotice(m);
      message.success(
        `${t("brp.import.success", {
          what,
          count: m.installedPaths.length,
          target: m.targetDescription
        })}${notice ? `\n\n${notice}` : ""}`
      );
    }
    return "done";
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    useDownloadsStore.getState().fail(id, reason);
    message.error(t("brp.import.failed", { reason }));
    return "failed";
  } finally {
    unlisten.forEach(fn => fn());
  }
}
