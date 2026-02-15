import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { ref } from "vue";

import backend from "@/backend";
import { defineService, withCache } from "@/utils/common";
import { getJson } from "@/utils/http";

const CACHE_EXPIRE_MS = 1000 * 60 * 60; // 1 hour

type DownloadTaskStatus = "downloading" | "extracting" | "completed" | "failed";

type DownloadTask = {
  mapId: string;
  mapName: string;
  status: DownloadTaskStatus;
  error?: string;
  startTime: number;
};

export const useDownloadService = defineService(() => {
  const activeDownloads = ref<DownloadTask[]>([]);

  const getMapIndexes = withCache(
    () => getJson<BallanceMapsResponse>("download", "/map/index.json"),
    CACHE_EXPIRE_MS
  );

  const isDownloading = (mapId: string): boolean => {
    return activeDownloads.value.some(
      (d: DownloadTask) => d.mapId === mapId && d.status === "downloading"
    );
  };

  const getActiveDownloads = (): DownloadTask[] => {
    return activeDownloads.value.filter(
      (d: DownloadTask) =>
        d.status === "downloading" || d.status === "extracting"
    );
  };

  // 带进度的文件下载（使用后端下载 + 事件上报）
  const downloadFileWithProgress = async (
    url: string,
    savePath: string,
    onProgress: (percent: number) => void
  ): Promise<void> => {
    // 监听下载进度事件
    const unlisten = await listen<{
      percent: number;
      downloaded: number;
      total: number;
    }>("download-progress", event => {
      onProgress(event.payload.percent);
    });

    try {
      // 调用后端下载命令
      await invoke("download_file", { url, savePath });
    } finally {
      // 清理事件监听
      unlisten();
    }
  };

  const downloadMap = async (
    map: BallanceMap,
    instancePath: string,
    onProgress?: (
      progress: number,
      status: DownloadTaskStatus,
      error?: string
    ) => void
  ): Promise<void> => {
    // 添加下载任务
    const task: DownloadTask = {
      mapId: map.id,
      mapName: map.name,
      status: "downloading",
      startTime: Date.now()
    };
    activeDownloads.value.push(task);

    try {
      onProgress?.(0, "downloading");

      // 构建下载 URL 和保存路径
      const downloadUrl = `https://dl.bcrc.site/map/${map.id}`;
      const mapPath = await join(instancePath, "ModLoader", "Maps", map.name);

      // 确保地图文件夹存在
      const mapsDir = await join(instancePath, "ModLoader", "Maps");
      await backend.mkdir(mapsDir);

      // 下载文件（带进度）
      await downloadFileWithProgress(downloadUrl, mapPath, percent => {
        if (percent === 0) {
          // 刚开始下载，发送 0% 状态
          onProgress?.(0, "downloading");
        } else {
          onProgress?.(percent, "downloading");
        }
      });

      // 如果是 ZIP 文件，解压它
      if (map.format === "zip") {
        task.status = "extracting";
        onProgress?.(100, "extracting");

        const extractDir = await join(mapsDir, map.name.replace(/\.zip$/i, ""));
        await backend.mkdir(extractDir);
        await backend.unzip(mapPath, extractDir);

        // 删除 ZIP 文件
        await backend.delete(mapPath);
      }

      // 标记为完成
      task.status = "completed";
      onProgress?.(100, "completed");

      // 延迟移除已完成的任务
      setTimeout(() => {
        const index = activeDownloads.value.findIndex(
          (d: DownloadTask) => d.mapId === map.id
        );
        if (index !== -1) {
          activeDownloads.value.splice(index, 1);
        }
      }, 1000);
    } catch (error) {
      console.error("Download error:", error);
      task.status = "failed";
      task.error = String(error);
      onProgress?.(0, "failed", String(error));

      // 延迟移除失败的任务
      setTimeout(() => {
        const index = activeDownloads.value.findIndex(
          (d: DownloadTask) => d.mapId === map.id
        );
        if (index !== -1) {
          activeDownloads.value.splice(index, 1);
        }
      }, 3000);
      throw error;
    }
  };

  return {
    getMapIndexes,
    downloadMap,
    isDownloading,
    getActiveDownloads
  };
});
