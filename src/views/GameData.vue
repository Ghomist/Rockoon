<script setup lang="ts">
import { useAppStore } from "@/stores/app";
import { waitForSelectedInstance } from "@/utils/ui/router";
import ListViewPage from "@/views/components/ListViewPage.vue";
import { onMounted, ref } from "vue";
import { message } from "@/utils/ui/feedback";
import { useI18n } from "vue-i18n";
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

const app = useAppStore();
const { t } = useI18n();

const editingLevel = ref(0);
const editingHighscores = ref(false);

const onUnlockAll = () => {
  app.selectedInstanceData!.options.levelLock.fill(true);
  message.success(t("gameData.message.unlockAllSuccess"));
};
const onToggleLevelLock = (level: number) => {
  app.selectedInstanceData!.options.levelLock[level - 1] =
    !app.selectedInstanceData!.options.levelLock[level - 1];
};

const onEditHighscores = (level: number) => {
  editingLevel.value = level;
  editingHighscores.value = true;
};

const highscoreRows = (level: number) =>
  app.selectedInstanceData!.options.highscores[level - 1];

onMounted(async () => {
  await waitForSelectedInstance();
});
</script>

<template>
  <ListViewPage v-if="app.selectedInstanceData">
    <template #title>
      {{ $t("gameData.title") }}
    </template>

    <template #actions>
      <Button variant="outline" size="sm" @click="onUnlockAll">
        {{ $t("gameData.action.unlockAll") }}
      </Button>
    </template>

    <div
      v-for="i in 12"
      :key="i"
      class="flex items-center gap-3 px-4 py-2.5"
      @click="onToggleLevelLock(i)"
    >
      <Switch
        :model-value="app.selectedInstanceData!.options.levelLock[i - 1]"
        @update:model-value="onToggleLevelLock(i)"
        @click.stop
      />

      <div class="flex flex-1 items-baseline gap-2">
        <span class="whitespace-nowrap text-sm">
          {{ $t("gameData.levelLabel", { i }) }}
        </span>
        <code
          class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          {{
            app.selectedInstanceData!.options.highscores[i - 1][0].player
          }}
          {{
            app.selectedInstanceData!.options.highscores[i - 1][0].score
          }}
        </code>
      </div>

      <Button
        variant="secondary"
        size="sm"
        @click.stop="onEditHighscores(i)"
      >
        {{ $t("gameData.action.editHighscores") }}
      </Button>
    </div>

    <Dialog v-model:open="editingHighscores">
      <DialogContent class="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {{
              $t("gameData.action.editHighscores") +
              " - " +
              $t("gameData.levelLabel", { i: editingLevel })
            }}
          </DialogTitle>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-16 text-center">
                {{ $t("gameData.highscores.rank") }}
              </TableHead>
              <TableHead>
                {{ $t("gameData.highscores.player") }}
              </TableHead>
              <TableHead>
                {{ $t("gameData.highscores.score") }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="(row, idx) in highscoreRows(editingLevel)"
              :key="idx"
            >
              <TableCell class="text-center tabular-nums">
                {{ idx + 1 }}
              </TableCell>
              <TableCell>
                <Input
                  v-model="row.player"
                  size="sm"
                />
              </TableCell>
              <TableCell>
                <Input
                  :model-value="String(row.score)"
                  type="number"
                  size="sm"
                  @update:model-value="v => (row.score = Number(v))"
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  </ListViewPage>
</template>
