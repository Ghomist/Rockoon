<script setup lang="ts">
import BasicBlock from "@/components/BasicBlock.vue";
import BasicNavItem from "@/components/BasicNavItem.vue";
// import BasicSplit from '@/components/BasicSplit.vue'
// import BasicIcon from '@/components/BasicIcon.vue'
import MapOrMod from "./components/MapOrMod.vue";
import { onMounted, ref } from "vue";
import { YsMap, YsMod, fetcher, toYsMap, toYsMod } from "@/utils/fetcher";

const select = ref("maps");
const navSchema = [
  {
    key: "maps",
    label: "自制地图"
  },
  {
    key: "mods",
    label: "模组"
  }
];

const allMaps = ref<YsMap[]>([]);
const allMods = ref<YsMod[]>([]);

onMounted(() => {
  [
    { category: "原版地图", name: "原版地图" },
    { category: "Ballance自制地图【HOT】", name: "热门地图" },
    { category: "Ballance自制地图【CLASSIC】", name: "经典地图" },
    { category: "Ballance自制地图【NEW】", name: "最新地图" },
    { category: "Ballance自制地图①", name: "旧地图①" },
    { category: "Ballance自制地图②", name: "旧地图②" },
    { category: "Ballance自制地图③", name: "旧地图③" },
    { category: "Ballance自制地图④", name: "旧地图④" },
    { category: "Ballance自制地图⑤", name: "旧地图⑤" },
    { category: "Ballance自制地图⑥", name: "旧地图⑥" },
    { category: "Ballance其它制图作品", name: "其它地图" },
    { category: "英雄榜竞速地图", name: "英雄榜竞速" },
    { category: "专业竞速第三季", name: "专业竞速第三季" },
    { category: "专业竞速系列", name: "专业竞速" },
    { category: "镜像地图", name: "镜像地图" },
    { category: "半盲打地图", name: "半盲打地图" },
    { category: "反方向地图", name: "反方向地图" },
    { category: "45", name: "45°地图" }
  ].map(async target => {
    const index = (await fetcher.searchIndexes(target.category))[0];
    fetcher.getFileList(index, target.name).then(files => {
      files.map(f => toYsMap(f)).forEach(x => allMaps.value.push(x));
    });
  });

  fetcher.searchIndexes("Ballance自制模组").then(res => {
    fetcher.getFileList(res[0]).then(files => {
      files.map(f => toYsMod(f)).forEach(x => allMods.value.push(x));
    });
  });
});
</script>

<template>
  <div style="display: flex; width: 100%; height: 100%">
    <BasicBlock style="width: 200px; min-width: 200px">
      <BasicNavItem
        v-for="item in navSchema"
        :name="item.key"
        :selected="select === item.key"
        @clicked="select = item.key"
      >
        <p
          style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
        >
          {{ item.label }}
        </p>
      </BasicNavItem>
      <!--  <BasicSplit v-if="state.instanceList.length > 0" />
      <BasicNavItemF
        name=""
        :selected="false"
        style="border: none; color: var(--color-text-light)"
        @clicked="onAdd"
      >
        <BasicIcon icon="add-circle-line" /> 添加
      </BasicNavItemF> -->
    </BasicBlock>
    <Transition name="fade" mode="out-in">
      <MapOrMod v-if="select === 'maps'" :list="allMaps" />
      <MapOrMod v-else-if="select === 'mods'" :list="allMods" />
    </Transition>
  </div>
</template>
