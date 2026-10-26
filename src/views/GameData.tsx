import { useState } from "react";
import { Lock, LockOpen, Pencil, Trophy } from "lucide-react";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { message } from "@/utils/ui/feedback";
import ListViewPage from "@/views/components/ListViewPage";
import { useWaitForSelectedInstance } from "@/utils/ui/waitForInstance";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

// In-place mutate + replace options ref so the store subscription persists.
const mutateOptions = (mutator: (opts: BallanceOptions) => void): void => {
  const cur = useAppStore.getState().selectedInstanceData;
  if (!cur) return;
  mutator(cur.options);
  useAppStore.setState({
    selectedInstanceData: { ...cur, options: { ...cur.options } }
  });
};

export default function GameData() {
  const t = useT();
  const selectedInstanceData = useAppStore(s => s.selectedInstanceData);
  const [editingLevel, setEditingLevel] = useState(0);
  const [editingHighscores, setEditingHighscores] = useState(false);

  useWaitForSelectedInstance();

  if (!selectedInstanceData) return null;

  const levelLock = selectedInstanceData.options.levelLock;
  const unlocked = levelLock.filter(Boolean).length;
  const allUnlocked = levelLock.length > 0 && levelLock.every(Boolean);

  const onUnlockAll = () => {
    mutateOptions(opts => {
      opts.levelLock.fill(true);
    });
    message.success(t("gameData.message.unlockAllSuccess"));
  };

  const onToggleLevelLock = (level: number) => {
    const wasLocked = !!selectedInstanceData.options.levelLock[level - 1];
    mutateOptions(opts => {
      opts.levelLock[level - 1] = !wasLocked;
    });
    message.success(
      t(
        wasLocked
          ? "gameData.message.levelUnlocked"
          : "gameData.message.levelLocked",
        { level }
      )
    );
  };

  const onEditHighscores = (level: number) => {
    setEditingLevel(level);
    setEditingHighscores(true);
  };

  return (
    <ListViewPage
      title={
        <>
          {t("gameData.title")}
          <span className="mx-1.5 text-muted-foreground/50">·</span>
          {t("gameData.unlockedCount", { n: unlocked })}
        </>
      }
      actions={
        <Button size="sm" onClick={onUnlockAll} disabled={allUnlocked}>
          <LockOpen />
          {t("gameData.action.unlockAll")}
        </Button>
      }
    >
      <div className="stagger grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => i + 1).map(level => {
          const open = !!selectedInstanceData.options.levelLock[level - 1];
          const top = selectedInstanceData.options.highscores?.[level - 1]?.[0];
          return (
            <div
              key={level}
              className={cn(
                "group flex flex-col rounded-xl border bg-card shadow-xs transition-colors",
                !open && "bg-muted/40"
              )}
            >
              <div className="flex items-center gap-3 px-4 pt-3.5">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg font-mono text-sm font-semibold tabular-nums",
                    open
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {String(level).padStart(2, "0")}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">
                    {t("gameData.levelLabel", { i: level })}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      open ? "text-success" : "text-muted-foreground"
                    )}
                  >
                    {open ? (
                      <LockOpen className="size-3" />
                    ) : (
                      <Lock className="size-3" />
                    )}
                    {t(
                      open
                        ? "gameData.levelState.unlocked"
                        : "gameData.levelState.locked"
                    )}
                  </span>
                </div>
                <Switch
                  checked={open}
                  onCheckedChange={() => onToggleLevelLock(level)}
                />
              </div>

              <button
                type="button"
                onClick={() => onEditHighscores(level)}
                className="mx-2 mt-3 mb-2 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
              >
                <Trophy className="size-3.5 shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {top?.player || t("gameData.noScore")}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {top ? top.score : "–"}
                </span>
                <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </div>
          );
        })}
      </div>

      <Dialog open={editingHighscores} onOpenChange={setEditingHighscores}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              {t("gameData.action.editHighscores")} -{" "}
              {t("gameData.levelLabel", { i: editingLevel })}
            </DialogTitle>
          </DialogHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-center">
                  {t("gameData.highscores.rank")}
                </TableHead>
                <TableHead>{t("gameData.highscores.player")}</TableHead>
                <TableHead>{t("gameData.highscores.score")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                selectedInstanceData.options.highscores[editingLevel - 1] ?? []
              ).map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-center tabular-nums">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.player}
                      onChange={e =>
                        mutateOptions(opts => {
                          opts.highscores[editingLevel - 1] ??= [];
                          opts.highscores[editingLevel - 1][idx] ??= {
                            player: "",
                            score: 0
                          };
                          opts.highscores[editingLevel - 1][idx].player =
                            e.target.value;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={String(row.score)}
                      type="number"
                      onChange={e =>
                        mutateOptions(opts => {
                          opts.highscores[editingLevel - 1] ??= [];
                          opts.highscores[editingLevel - 1][idx] ??= {
                            player: "",
                            score: 0
                          };
                          opts.highscores[editingLevel - 1][idx].score = Number(
                            e.target.value
                          );
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </ListViewPage>
  );
}
