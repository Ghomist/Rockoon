import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { open as browse } from "@tauri-apps/plugin-dialog";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import {
  BookOpen,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  Settings2,
  TriangleAlert
} from "lucide-react";
import { useT } from "@/i18n";
import {
  BBP_MANUAL_URL,
  BBP_REPO_URL,
  BLENDER_DOWNLOAD_URL,
  bbpOf,
  configureBbp,
  gameTexturesDir,
  installBbpAsTask,
  latestBbpRelease,
  legacyBbpOf,
  useMappingStore
} from "@/services/mapping";
import { useDownloadsStore } from "@/stores/downloads";
import { usePrefStore } from "@/stores/pref";
import { useAppStore } from "@/stores/app";
import { isMac } from "@/utils/platform";
import ListViewPage from "@/views/components/ListViewPage";
import { IconAction } from "@/views/components/ResourceToolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

/** "v4.4" / "4.4.0" → [4, 4, 0]，比较时补零 */
const parseVersion = (v: string) =>
  v
    .replace(/^v/i, "")
    .split(".")
    .map(n => parseInt(n, 10) || 0);
const sameVersion = (a: string, b: string) => {
  const x = parseVersion(a);
  const y = parseVersion(b);
  return Array.from({ length: Math.max(x.length, y.length) }).every(
    (_, i) => (x[i] ?? 0) === (y[i] ?? 0)
  );
};
/** Windows 路径不分大小写、分隔符可能不同，比较前统一一下 */
const samePath = (a: string, b: string) => {
  const norm = (p: string) =>
    p
      .replace(/[\\/]+/g, "/")
      .replace(/\/$/, "")
      .toLowerCase();
  return norm(a) === norm(b);
};

function Section({
  title,
  badges,
  children
}: {
  title: string;
  badges?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
        {badges}
      </div>
      {children}
    </div>
  );
}

export default function Mapping() {
  const t = useT();
  const navigate = useNavigate();
  const { candidates, blender, probe, probing, error, refresh, select } =
    useMappingStore();
  const customPath = usePrefStore(s => s.blenderPath);
  const instancePath = useAppStore(s => s.selectedInstanceData?.path);
  const installing = useDownloadsStore(s =>
    s.tasks.some(x => x.key === "bbp:install" && x.status === "running")
  );
  const [latest, setLatest] = useState<string | null>(null);
  const [textures, setTextures] = useState("");

  useEffect(() => {
    void refresh();
    latestBbpRelease()
      .then(r => setLatest(r.tag))
      .catch(e => console.warn("BBP release check failed:", e));
  }, [refresh]);

  useEffect(() => {
    void gameTexturesDir().then(setTextures);
  }, [instancePath]);

  const bbp = bbpOf(probe);
  const legacy = legacyBbpOf(probe);
  const upToDate = Boolean(bbp && latest && sameVersion(bbp.version, latest));
  const textureMismatch = Boolean(
    bbp?.enabled && textures && !samePath(bbp.textureFolder, textures)
  );

  const pickBlender = async () => {
    const picked = await browse({
      multiple: false,
      directory: false,
      filters: isMac ? [] : [{ name: "Blender", extensions: ["exe"] }]
    });
    if (typeof picked === "string") await select(picked);
  };

  // 下拉选项：自动找到的 + 用户手选的（不在列表里时补进去）
  const options =
    blender && !candidates.includes(blender)
      ? [...candidates, blender]
      : candidates;

  return (
    <ListViewPage
      title={t("menu.mapping")}
      actions={
        <IconAction
          label={t("mapping.refresh")}
          disabled={probing}
          onClick={() => void refresh()}
        >
          <RefreshCw />
        </IconAction>
      }
    >
      <Section
        title="Blender"
        badges={
          probing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : probe ? (
            <Badge variant="secondary" className="tabular-nums">
              {probe.version}
            </Badge>
          ) : (
            <Badge variant="outline">{t("mapping.blender.notFound")}</Badge>
          )
        }
      >
        <p className="text-xs text-muted-foreground">
          {blender ? t("mapping.blender.subtitle") : t("mapping.blender.hint")}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {options.length > 0 && (
          <Select
            value={blender ?? undefined}
            onValueChange={v => void select(v)}
            disabled={probing}
          >
            <SelectTrigger className="w-full font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map(p => (
                <SelectItem key={p} value={p} className="font-mono text-xs">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={blender ? "outline" : "default"}
            onClick={() => void openUrl(BLENDER_DOWNLOAD_URL)}
          >
            <ExternalLink />
            {t("mapping.blender.download")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void pickBlender()}
          >
            <FolderOpen />
            {t("mapping.blender.pick")}
          </Button>
          {customPath && (
            <Button size="sm" variant="ghost" onClick={() => void select(null)}>
              {t("mapping.blender.auto")}
            </Button>
          )}
        </div>
      </Section>

      <Section
        title="Ballance Blender Plugin (BBP)"
        badges={
          <>
            {latest && (
              <Badge variant="outline" className="tabular-nums">
                {t("mapping.bbp.latest", { version: latest })}
              </Badge>
            )}
            {probe &&
              (bbp ? (
                <Badge variant="secondary">
                  {t("mapping.bbp.installedVersion", { version: bbp.version })}
                  {!bbp.enabled && ` · ${t("mapping.bbp.disabled")}`}
                </Badge>
              ) : (
                <Badge variant="outline">{t("mapping.bbp.notInstalled")}</Badge>
              ))}
          </>
        }
      >
        <p className="text-xs text-muted-foreground">
          {t("mapping.bbp.subtitle")}
        </p>

        {bbp?.enabled && (
          <p className="text-xs">
            <span className="text-muted-foreground">
              {t("mapping.bbp.textureFolder")}
            </span>{" "}
            <span className="font-mono">
              {bbp.textureFolder || t("mapping.bbp.textureUnset")}
            </span>
          </p>
        )}
        {textureMismatch && (
          <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-3.5 shrink-0" />
            {t("mapping.bbp.textureMismatch", { path: textures })}
          </p>
        )}
        {legacy.length > 0 && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <p>{t("mapping.bbp.legacy")}</p>
            <ul className="mt-1 font-mono">
              {legacy.map(m => (
                <li key={m.module} className="truncate">
                  {m.path}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!probe || probing || installing || upToDate}
            onClick={() => void installBbpAsTask()}
          >
            {installing ? <Loader2 className="animate-spin" /> : <Download />}
            {upToDate
              ? t("mapping.bbp.upToDate")
              : bbp
                ? t("mapping.bbp.update")
                : t("mapping.bbp.install")}
          </Button>
          {bbp && (
            <Button
              size="sm"
              variant="outline"
              disabled={probing || installing || !textures}
              onClick={() => void configureBbp()}
            >
              <Settings2 />
              {t("mapping.bbp.configure")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void openUrl(BBP_MANUAL_URL)}
          >
            <BookOpen />
            {t("mapping.bbp.manual")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void openUrl(BBP_REPO_URL)}
          >
            <ExternalLink />
            GitHub
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("mapping.bbp.closeHint")}
        </p>
      </Section>

      <Section title={t("mapping.edit.title")}>
        <p className="text-xs text-muted-foreground">
          {t("mapping.edit.subtitle")}
        </p>
        <div>
          <Button size="sm" variant="outline" onClick={() => navigate("/maps")}>
            <MapIcon />
            {t("mapping.edit.goMaps")}
          </Button>
        </div>
      </Section>
    </ListViewPage>
  );
}
