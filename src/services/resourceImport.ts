import { join, sep } from "@tauri-apps/api/path";
import { open as browseFile } from "@tauri-apps/plugin-dialog";
import backend from "@/backend";
import { importFromFile } from "@/services/brp";

/** Extensions that go through the BRP pipeline instead of being copied as-is. */
const PACKAGE_EXTENSIONS = ["brp", "zip"];

const extensionOf = (path: string) =>
  (path.split(".").pop() ?? "").toLowerCase();

interface ImportOptions {
  /** File picker title. */
  title: string;
  /** Formats this page owns: they are copied straight into `targetDir`.
   *  Everything else (brp/zip) is handed to the BRP installer. */
  native: string[];
  /** Directory the native files are copied into. */
  targetDir: string;
}

/**
 * The single import entry point of every resource page. One button handles both
 * the page's own formats and .brp/.zip packages (a package may carry maps, mods,
 * sounds, skyboxes or textures). Packages report + refresh themselves through
 * the BRP service, so callers only need to react to `copied`.
 */
export async function importResources({
  title,
  native,
  targetDir
}: ImportOptions): Promise<{ copied: number; packages: number }> {
  const extensions = [...new Set([...native, ...PACKAGE_EXTENSIONS])];
  const selected = (await browseFile({
    title,
    multiple: true,
    filters: [{ name: title, extensions }]
  })) as string[] | null;
  if (!selected?.length) return { copied: 0, packages: 0 };

  let copied = 0;
  let packages = 0;
  for (const source of selected) {
    const ext = extensionOf(source);
    if (PACKAGE_EXTENSIONS.includes(ext) && !native.includes(ext)) {
      if (await importFromFile(source)) packages++;
    } else {
      const target = await join(targetDir, source.split(sep()).pop()!);
      await backend.copy(source, target);
      copied++;
    }
  }
  return { copied, packages };
}
