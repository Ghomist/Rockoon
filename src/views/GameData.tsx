import { useState } from "react";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { message } from "@/utils/ui/feedback";
import ListViewPage from "@/views/components/ListViewPage";
import { useWaitForSelectedInstance } from "@/utils/ui/waitForInstance";
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

  const onUnlockAll = () => {
    mutateOptions(opts => {
      opts.levelLock.fill(true);
    });
    message.success(t("gameData.message.unlockAllSuccess"));
  };

  const onToggleLevelLock = (level: number) => {
    mutateOptions(opts => {
      opts.levelLock[level - 1] = !opts.levelLock[level - 1];
    });
  };

  const onEditHighscores = (level: number) => {
    setEditingLevel(level);
    setEditingHighscores(true);
  };

  return (
    <ListViewPage
      title={t("gameData.title")}
      actions={
        <Button variant="outline" size="sm" onClick={onUnlockAll}>
          {t("gameData.action.unlockAll")}
        </Button>
      }
    >
      {Array.from({ length: 12 }, (_, i) => i + 1).map(level => (
        <div
          key={level}
          className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
          onClick={() => onToggleLevelLock(level)}
        >
          <Switch
            checked={!!selectedInstanceData.options.levelLock[level - 1]}
            onCheckedChange={() => onToggleLevelLock(level)}
            onClick={e => e.stopPropagation()}
          />

          <div className="flex flex-1 items-baseline gap-2">
            <span className="whitespace-nowrap text-sm">
              {t("gameData.levelLabel", { i: level })}
            </span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {selectedInstanceData.options.highscores?.[level - 1]?.[0]
                ?.player ?? ""}{" "}
              {selectedInstanceData.options.highscores?.[level - 1]?.[0]
                ?.score ?? ""}
            </code>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={e => {
              e.stopPropagation();
              onEditHighscores(level);
            }}
          >
            {t("gameData.action.editHighscores")}
          </Button>
        </div>
      ))}

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
              {(selectedInstanceData.options.highscores[editingLevel - 1] ??
                []).map((row, idx) => (
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
                          opts.highscores[editingLevel - 1][idx].score =
                            Number(e.target.value);
                        })
                      }
                    />
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </ListViewPage>
  );
}
