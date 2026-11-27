import { ChevronDown, Check, Layers, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { useProfilesStore } from "@/stores/profiles";
import { dialog, message } from "@/utils/ui/feedback";

const promptName = (
  title: string,
  initial: string,
  onOk: (v: string) => void
) => {
  let value = initial;
  dialog.create({
    title,
    content: () => (
      <Input
        defaultValue={initial}
        placeholder={t("profile.namePlaceholder")}
        onChange={e => (value = e.target.value)}
      />
    ),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: () => {
      const name = value.trim();
      if (name) onOk(name);
    }
  });
};

/** 标题栏右侧的「当前配置」下拉：切换 / 新建 / 重命名 / 删除选项配置。 */
export default function ProfileSwitcher() {
  // Profile store data
  const profiles = useProfilesStore(s => s.index.profiles);
  const currentProfile = useProfilesStore(s => {
    const idx = s.index;
    return idx.profiles.find(p => p.id === idx.currentId);
  });

  const onSwitchProfile = async (id: string) => {
    if (id === currentProfile?.id) return;
    const loading = message.loading(t("profile.switching"));
    try {
      await useProfilesStore.getState().switchProfile(id);
      message.success(t("profile.switched"));
    } catch {
      message.error(t("profile.switchFailed"));
    } finally {
      loading.destroy();
    }
  };

  const onCreateProfile = () =>
    promptName(t("profile.create"), t("profile.defaultName"), async name => {
      await useProfilesStore.getState().createProfile(name);
      message.success(t("profile.created"));
    });

  const onRenameProfile = () => {
    if (!currentProfile) return;
    promptName(t("profile.rename"), currentProfile.name, async name => {
      await useProfilesStore.getState().renameProfile(currentProfile.id, name);
      message.success(t("profile.renamed"));
    });
  };

  const onDeleteProfile = () => {
    if (!currentProfile) return;
    dialog.warning({
      title: t("common.message.warning"),
      content: t("profile.deleteConfirm", { name: currentProfile.name }),
      positiveText: t("common.dialog.confirm"),
      negativeText: t("common.dialog.cancel"),
      onPositiveClick: async () => {
        await useProfilesStore.getState().deleteProfile(currentProfile.id);
        message.success(t("profile.deleted"));
      }
    });
  };

  const currentProfileName = currentProfile?.name ?? t("common.none");
  const deleteDisabled = profiles.length <= 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-full bg-background/60 pr-2 pl-2.5 font-normal"
        >
          <Layers className="size-3.5 text-primary" />
          <span className="text-muted-foreground">
            {t("profile.currentLabel")}
          </span>
          <span className="max-w-32 truncate font-medium">
            {currentProfileName}
          </span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("profile.currentLabel")}
        </DropdownMenuLabel>
        {profiles.map(p => (
          <DropdownMenuItem key={p.id} onClick={() => onSwitchProfile(p.id)}>
            {p.id === currentProfile?.id ? (
              <Check className="size-4 text-primary" />
            ) : (
              <span className="size-4" />
            )}
            <span className="truncate">{p.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreateProfile}>
          <Plus className="size-4" />
          {t("profile.create")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRenameProfile}>
          <Pencil className="size-4" />
          {t("profile.rename")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={deleteDisabled}
          onClick={onDeleteProfile}
        >
          <Trash2 className="size-4" />
          {t("profile.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
