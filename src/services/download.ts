import { defineService, withCache } from "@/utils/common";
import { getJson } from "@/utils/http";

const CACHE_EXPIRE_MS = 1000 * 60 * 60; // 1 hour

export const useDownloadService = defineService(() => {
  const getMapIndexes = withCache(
    () => getJson<BallanceMapsResponse>("download", "/map/index.json"),
    CACHE_EXPIRE_MS
  );

  return { getMapIndexes };
});
