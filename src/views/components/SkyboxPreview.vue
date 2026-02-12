<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

type SkyboxDirection = "Front" | "Back" | "Left" | "Right" | "Down";

type SkyboxLevel = {
  level: number;
  letter: string;
  files: {
    [K in SkyboxDirection]?: string;
  };
};

const props = defineProps<{
  level: SkyboxLevel;
  skysPath: string;
  getImageUrl: (filename: string) => string;
}>();

const initialRotationX = 25;
const initialRotationY = 30;
const initialScale = 1;
const minScale = 0.5;
const maxScale = 5;

// 旋转角度和缩放
const rotationX = ref(initialRotationX);
const rotationY = ref(initialRotationY);
const scale = ref(initialScale);
const isDragging = ref(false);
const lastMouseX = ref(0);
const lastMouseY = ref(0);

// 鼠标按下开始拖拽
const onMouseDown = (e: MouseEvent) => {
  isDragging.value = true;
  lastMouseX.value = e.clientX;
  lastMouseY.value = e.clientY;
};

// 鼠标移动更新旋转
const onMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;

  const deltaX = e.clientX - lastMouseX.value;
  const deltaY = e.clientY - lastMouseY.value;

  // 更新旋转角度（灵敏度0.5）
  rotationY.value += deltaX * 0.5;
  rotationX.value += deltaY * 0.5;

  // 限制X轴旋转角度在-90到90度之间，避免翻转
  rotationX.value = Math.max(-90, Math.min(90, rotationX.value));

  lastMouseX.value = e.clientX;
  lastMouseY.value = e.clientY;
};

// 鼠标松开停止拖拽
const onMouseUp = () => {
  isDragging.value = false;
};

// 滚轮缩放
const onWheel = (e: WheelEvent) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  scale.value = Math.max(minScale, Math.min(maxScale, scale.value + delta));
};

// 重置旋转和缩放
const resetRotation = () => {
  rotationX.value = initialRotationX;
  rotationY.value = initialRotationY;
  scale.value = initialScale;
};

// 获取立方体面的样式
const getFaceStyle = (direction: SkyboxDirection) => {
  const imageUrl = props.getImageUrl(props.level.files[direction] || "");
  const size = 300;
  const offset = 1;

  let transform = "";
  switch (direction) {
    case "Front":
      // 前面，向外推 half size
      transform = `translateZ(-${size / 2 - offset}px)`;
      break;
    case "Back":
      // 后面，向内推 half size，并旋转180度
      transform = `translateZ(${size / 2 - offset}px) rotateY(180deg)`;
      break;
    case "Left":
      // 左面，向左推 half size，旋转-90度
      transform = `translateX(-${size / 2 - offset}px) rotateY(90deg)`;
      break;
    case "Right":
      // 右面，向右推 half size，旋转90度
      transform = `translateX(${size / 2 - offset}px) rotateY(-90deg)`;
      break;
    case "Down":
      // 底面，向下推 half size，旋转X轴-90度
      transform = `translateY(${size / 2 - offset}px) rotateX(90deg)`;
      break;
  }

  return {
    width: `${size}px`,
    height: `${size}px`,
    backgroundImage: imageUrl ? `url(${imageUrl})` : "none",
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    position: "absolute" as const,
    transform,
    border: "none"
  };
};

// 添加全局事件监听
onMounted(() => {
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
});

onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
});
</script>

<template>
  <div
    ref="containerRef"
    class="skybox-preview-container"
    @mousedown="onMouseDown"
    @wheel="onWheel"
  >
    <div
      class="skybox-cube"
      :style="{
        transform: `rotateX(${-rotationX}deg) rotateY(${rotationY}deg) scale3d(${scale}, ${scale}, ${scale})`
      }"
    >
      <!-- Front 面 -->
      <div
        v-if="level.files.Front"
        class="skybox-face skybox-face-front"
        :style="getFaceStyle('Front')"
      />

      <!-- Back 面 -->
      <div
        v-if="level.files.Back"
        class="skybox-face skybox-face-back"
        :style="getFaceStyle('Back')"
      />

      <!-- Left 面 -->
      <div
        v-if="level.files.Left"
        class="skybox-face skybox-face-left"
        :style="getFaceStyle('Left')"
      />

      <!-- Right 面 -->
      <div
        v-if="level.files.Right"
        class="skybox-face skybox-face-right"
        :style="getFaceStyle('Right')"
      />

      <!-- Down 面 (立方体底部，向下看) -->
      <div
        v-if="level.files.Down"
        class="skybox-face skybox-face-down"
        :style="getFaceStyle('Down')"
      />
    </div>

    <!-- 操作提示 -->
    <div class="skybox-controls">
      <span class="control-hint">🖱️ {{ t("skys.dragToRotate") }}</span>
      <span class="control-hint">🔍 {{ t("skys.scrollToZoom") }}</span>
      <span class="zoom-value">{{ Math.round(scale * 100) }}%</span>
      <button class="reset-button" @click="resetRotation">
        {{ t("skys.resetView") }}
      </button>
    </div>

    <!-- 缺失的图片提示 -->
    <div v-if="Object.keys(level.files).length < 5" class="skybox-missing-hint">
      {{ t("skys.missingFiles") }}: {{ 5 - Object.keys(level.files).length }} /
      5
    </div>
  </div>
</template>

<style scoped>
.skybox-preview-container {
  width: 100%;
  height: 75vh;
  perspective: 800px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  user-select: none;
  cursor: grab;
  position: relative;
  overflow: hidden;
}

.skybox-preview-container:active {
  cursor: grabbing;
}

.skybox-cube {
  width: 300px;
  height: 300px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.05s linear;
}

.skybox-face {
  backface-visibility: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  left: 0;
  top: 0;
  margin: -1px; /* 消除接缝 */
  padding: 0;
}

.skybox-face-front {
  left: 0;
  top: 0;
}

.skybox-face-back {
  left: 0;
  top: 0;
}

.skybox-face-left {
  left: 0;
  top: 0;
}

.skybox-face-right {
  left: 0;
  top: 0;
}

.skybox-face-down {
  left: 0;
  top: 0;
}

.skybox-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.7);
  padding: 12px 20px;
  border-radius: 8px;
  color: white;
  pointer-events: none;
  z-index: 10;
}

.control-hint {
  font-size: 14px;
  pointer-events: none;
  /* 禁用换行 */
  white-space: nowrap;
}

.zoom-value {
  font-size: 14px;
  font-weight: bold;
  min-width: 45px;
  text-align: center;
  pointer-events: none;
}

.reset-button {
  padding: 6px 16px;
  width: max-content;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
  pointer-events: auto;
}

.reset-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.skybox-missing-hint {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 100, 100, 0.9);
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 10;
}
</style>
