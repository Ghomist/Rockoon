import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { ref } from "vue";
import backend from "@/backend";
import { getJson } from "@/utils/http";
import { defineService, withCache } from "@/utils/common";

// 使用 Rust 后端保存文件
const saveFile = async (path: string, data: Uint8Array): Promise<void> => {
  // 分块转换为字符串，避免栈溢出
  const CHUNK_SIZE = 16384; // 16KB chunks
  let str = "";
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    str += String.fromCharCode.apply(null, Array.from(chunk) as number[]);
  }

  // 整体进行 base64 编码，保持 padding 正确
  const base64 = btoa(str);

  // 使用 Tauri invoke 调用后端保存
  await invoke("write_file", { path, data: base64 });
};

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

  // 带进度的文件下载
  const downloadFileWithProgress = async (
    url: string,
    savePath: string,
    onProgress: (percent: number) => void
  ): Promise<void> => {
    // 获取文件大小
    const headResponse = await fetch(url, { method: "HEAD" });
    const contentLength = headResponse.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    // 开始下载
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    // 获取响应体
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get response reader");
    }

    // 读取数据并计算进度
    let downloadedBytes = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      if (value) {
        chunks.push(value);
        downloadedBytes += value.length;

        // 计算并上报进度
        if (totalBytes > 0) {
          const percent = Math.min(
            100,
            Math.round((downloadedBytes / totalBytes) * 100)
          );
          onProgress(percent);
        }
      }
    }

    // 合并所有 chunk 并写入文件
    const blob = new Uint8Array(downloadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      blob.set(chunk, offset);
      offset += chunk.length;
    }

    // 使用自定义函数保存文件
    await saveFile(savePath, blob);
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
