import backend from "@/backend";
import { join } from "@tauri-apps/api/path";

type ChecklistDesc = {
  name: string;
  validator?: (file: { size: number }) => boolean;
};
/** 检查清单 */
const checklists: {
  [key: string]: (string | string[] | ChecklistDesc | ChecklistDesc[])[];
} = {
  ballance: [
    "Bin/Player.exe",
    "BuildingBlocks/",
    "3D Entities/",
    "base.cmo",
    "Database.tdb"
  ],
  bml: [
    ["BuildingBlocks/BML.dll", "BuildingBlocks/BML.dll.disable"],
    "ModLoader/"
  ],
  bmlp: [
    ["BuildingBlocks/BMLPlus.dll", "BuildingBlocks/BMLPlus.dll.disable"],
    "ModLoader/"
  ],
  newPlayer: [
    {
      name: "Bin/Player.exe",
      validator: ({ size }) => {
        // Ballance 原版 Player 大小，新版 Player 大小必小于此值
        return size !== 155648;
      }
    }
  ]
};
type ChecklistType = keyof typeof checklists;

/** 检查清单上的所有文件是否存在 */
const checkFiles = async (
  baseFolder: string,
  checklist: ChecklistType
): Promise<Set<string> | null> => {
  const fileSet = new Set<string>();

  // 校验函数
  const check = async (target: string | ChecklistDesc) => {
    let valid = true;
    // 如果是字符串，统一转换为对象
    if (typeof target === "string") target = { name: target };
    // 检查文件是否存在
    const file = await join(baseFolder, target.name);
    valid = await backend.exists(file);
    // 如果有校验器，执行校验
    if (valid && target.validator) {
      const size = await backend.size(file);
      valid = target.validator({ size });
    }
    // 校验成功，添加到文件集合
    if (valid) fileSet.add(target.name);
    return valid;
  };

  // 执行校验
  for (const target of checklists[checklist]) {
    // 如果是数组，表示多个文件
    if (Array.isArray(target)) {
      // 检查多个文件，只要有一个存在即可
      const results = await Promise.all(target.map(item => check(item)));
      if (!results.some(x => x)) {
        return null;
      }
    } else {
      // 检查单个文件
      if (!(await check(target))) {
        return null;
      }
    }
  }

  return fileSet;
};

const defaultOptions = (): BallanceOptions => ({
  volume: 1,
  syncToScreen: false,
  keyForward: 68,
  keyBackward: 69,
  keyLeft: 70,
  keyRight: 71,
  keyRotateCam: 39,
  keyLiftCam: 53,
  invertCamRotation: false,
  cloudLayer: true,
  lastPlayer: "Mr. Default",
  levelLock: Array.from({ length: 12 }, (_, level) => level === 0),
  highscores: Array.from({ length: 13 }, () =>
    Array.from({ length: 10 }, () => ({ player: "Mr. Default", score: 0 }))
  )
});

/** 检查 Ballance 文件夹并返回实例的详细信息 */
const getInstanceData = async (
  baseFolder: string
): Promise<InstanceData | null> => {
  const ballanceFiles = await checkFiles(baseFolder, "ballance");
  if (!ballanceFiles) return null;

  const instance = { path: baseFolder } as InstanceData;

  const tdbPath = await join(baseFolder, "Database.tdb");

  try {
    instance.options = await backend.readOptions(tdbPath);
  } catch {
    // 写入默认配置
    console.warn("Failed to read options, writing default options");
    instance.options = defaultOptions();
    backend.saveOptions(tdbPath, instance.options);
  }

  const bml = await checkFiles(baseFolder, "bml");
  const bmlp = await checkFiles(baseFolder, "bmlp");
  instance.modLoaderType = bml ? "bml" : bmlp ? "bmlp" : "none";
  instance.modLoaderEnabled =
    bml?.has("BuildingBlocks/BML.dll") ??
    bmlp?.has("BuildingBlocks/BMLPlus.dll") ??
    false;

  const newPlayer = await checkFiles(baseFolder, "newPlayer");
  instance.playerType = newPlayer ? "new" : "original";

  return instance;
};

/** 扫描可能的 Ballance 实例，返回实例列表 */
const scanPossibleInstances = async (): Promise<InstanceData[]> => {
  const newInstanceList: InstanceData[] = [];

  const scanInstances = async (dir: string, depth: number) => {
    if (depth) {
      try {
        const dirs = await backend.listDirs(dir);
        for (const dir of dirs) {
          const instance = await getInstanceData(dir);
          if (instance) {
            newInstanceList.push(instance);
          } else {
            await scanInstances(dir, depth - 1);
          }
        }
      } catch {} // ignore error
    }
  };

  const dirs = await backend.getCommonDirs();
  for (const dir of dirs) {
    await scanInstances(dir, 2);
  }

  return newInstanceList;
};

/** 获取实例的文件列表 */
async function getInstanceFiles(
  path: string,
  folderType: "map" | "mod" | "modCfg" | "bb"
) {
  return await backend
    .list(
      await {
        map: join(path, "ModLoader", "Maps"),
        mod: join(path, "ModLoader", "Mods"),
        modCfg: join(path, "ModLoader", "Configs"),
        bb: join(path, "BuildingBlocks")
      }[folderType],
      {
        map: ["nmo"],
        mod: ["bmod", "bmodp", "zip"],
        modCfg: ["cfg"],
        bb: ["dll"]
      }[folderType]
    )
    .catch(() => [] as ManagedFile[]);
}

async function installRockoonMod(instance: InstanceData) {
  const modPath = await join(
    instance.path,
    "ModLoader",
    "Mods",
    "RockoonIO.bmodp"
  );
  await backend.installRockoonMod(modPath);
}

export const instanceBackend = {
  getInstanceData,
  getInstanceFiles,
  scanPossibleInstances,
  installRockoonMod
};
