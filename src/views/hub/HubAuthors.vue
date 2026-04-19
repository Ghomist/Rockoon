<script setup lang="ts">
import { useHubStore } from "@/stores/hub";
import {
  fetchAuthorsWithCount,
  addAuthor,
  deleteAuthor,
  updateAuthor
} from "@/services/hub";
import { dialog, message } from "@/utils/ui/feedback";
import {
  NButton,
  NFlex,
  NInput,
  NListItem,
  NTag,
  NText
} from "naive-ui";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import ListViewPage from "../components/ListViewPage.vue";

const { t } = useI18n();
const router = useRouter();
const hub = useHubStore();

const authors = ref<HubAuthorWithCount[]>([]);
const loading = ref(true);
const newName = ref("");
const adding = ref(false);

// Edit state
const editingId = ref<number | null>(null);
const editName = ref("");
const editAliases = ref<string[]>([]);
const editAliasInput = ref("");
const saving = ref(false);

const reload = async () => {
  try {
    authors.value = await fetchAuthorsWithCount();
  } catch (e: unknown) {
    message.error(
      e instanceof Error ? e.message : t("common.message.error")
    );
  }
};

const browseAuthor = (a: HubAuthorWithCount) => {
  router.push({
    path: "/hub/hub-maps",
    query: { author: [a.name, ...a.aliases].join(" ") }
  });
};

const handleAdd = async () => {
  if (!newName.value.trim() || adding.value) return;
  adding.value = true;
  try {
    await addAuthor(newName.value.trim());
    await reload();
    newName.value = "";
    message.success(t("hub.authors.addSuccess"));
  } catch (e: unknown) {
    message.error(
      e instanceof Error ? e.message : t("common.message.error")
    );
  } finally {
    adding.value = false;
  }
};

const handleDelete = (id: number, name: string) => {
  dialog.warning({
    title: t("common.message.warning"),
    content: t("hub.authors.deleteConfirm", { name }),
    positiveText: t("common.dialog.confirm"),
    negativeText: t("common.dialog.cancel"),
    onPositiveClick: async () => {
      try {
        await deleteAuthor(id);
        await reload();
        message.success(t("hub.authors.deleteSuccess"));
      } catch (e: unknown) {
        message.error(
          e instanceof Error ? e.message : t("common.message.error")
        );
      }
    }
  });
};

const startEdit = (a: HubAuthorWithCount) => {
  editingId.value = a.id;
  editName.value = a.name;
  editAliases.value = [...a.aliases];
  editAliasInput.value = "";
};

const cancelEdit = () => {
  editingId.value = null;
};

const removeAlias = (alias: string) => {
  const idx = editAliases.value.indexOf(alias);
  if (idx >= 0) editAliases.value.splice(idx, 1);
};

const addAlias = () => {
  const val = editAliasInput.value.trim();
  if (!val || editAliases.value.includes(val)) return;
  editAliases.value.push(val);
  editAliasInput.value = "";
};

const saveEdit = async (id: number, original: HubAuthorWithCount) => {
  if (saving.value) return;
  saving.value = true;
  try {
    const data: { name?: string; aliases?: string[] } = {};
    if (editName.value.trim() !== original.name)
      data.name = editName.value.trim();
    if (
      JSON.stringify(editAliases.value) !==
      JSON.stringify(original.aliases)
    )
      data.aliases = editAliases.value;
    if (Object.keys(data).length > 0) {
      await updateAuthor(id, data);
      await reload();
    }
    editingId.value = null;
    message.success(t("hub.authors.editSuccess"));
  } catch (e: unknown) {
    message.error(
      e instanceof Error ? e.message : t("common.message.error")
    );
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  await reload();
  loading.value = false;
});
</script>

<template>
  <list-view-page>
    <template #title>
      {{ t("hub.authors.title", { cnt: authors.length }, authors.length) }}
    </template>

    <template #actions>
      <n-button @click="reload">
        {{ t("common.action.refresh") }}
      </n-button>
    </template>

    <!-- Add author (admin only) -->
    <n-flex
      v-if="hub.isAuthenticated"
      :size="8"
      style="padding: 4px 16px"
    >
      <n-input
        v-model:value="newName"
        :placeholder="t('hub.authors.newName')"
        style="width: 200px"
        @keyup.enter="handleAdd"
      />
      <n-button type="primary" :loading="adding" @click="handleAdd">
        {{ t("hub.authors.add") }}
      </n-button>
    </n-flex>

    <n-spin :show="loading" style="min-height: 200px">
      <n-list-item
        v-for="author in authors"
        :key="author.id"
      >
        <!-- Edit mode -->
        <template v-if="editingId === author.id">
          <n-flex vertical :size="8" style="flex: 1">
            <n-input v-model:value="editName" size="small" />
            <n-flex :size="6" :wrap="true">
              <n-tag
                v-for="a in editAliases"
                :key="a"
                closable
                size="small"
                @close="removeAlias(a)"
              >
                {{ a }}
              </n-tag>
            </n-flex>
            <n-flex :size="8">
              <n-input
                v-model:value="editAliasInput"
                :placeholder="t('hub.authors.aliasPlaceholder')"
                size="small"
                style="width: 200px"
                @keyup.enter="addAlias"
              />
              <n-button size="small" @click="addAlias">
                {{ t("hub.authors.addAlias") }}
              </n-button>
            </n-flex>
          </n-flex>
        </template>

        <!-- View mode -->
        <template v-else>
          <n-flex
            vertical
            :size="4"
            style="flex: 1; min-width: 0; cursor: pointer"
            @click="browseAuthor(author)"
          >
            <n-text style="font-weight: 500">
              {{ author.name }}
              <template v-if="author.aliases.length">
                <n-text depth="3">
                  / {{ author.aliases.join(" / ") }}
                </n-text>
              </template>
            </n-text>
            <n-text depth="3" style="font-size: 12px">
              {{ t("hub.authors.mapCount", { cnt: author.map_count }) }}
            </n-text>
          </n-flex>
        </template>

        <template #suffix>
          <n-flex
            v-if="hub.isAuthenticated"
            :wrap="false"
            :size="6"
            @click.stop
          >
            <template v-if="editingId === author.id">
              <n-button
                size="small"
                type="primary"
                :loading="saving"
                @click="saveEdit(author.id, author)"
              >
                {{ t("common.dialog.confirm") }}
              </n-button>
              <n-button size="small" @click="cancelEdit">
                {{ t("common.dialog.cancel") }}
              </n-button>
            </template>
            <template v-else>
              <n-button
                size="small"
                secondary
                @click.stop="startEdit(author)"
              >
                {{ t("hub.authors.edit") }}
              </n-button>
              <n-button
                size="small"
                secondary
                type="error"
                @click.stop="handleDelete(author.id, author.name)"
              >
                {{ t("hub.authors.delete") }}
              </n-button>
            </template>
          </n-flex>
        </template>
      </n-list-item>
    </n-spin>
  </list-view-page>
</template>
