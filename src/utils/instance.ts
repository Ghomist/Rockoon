import ballance from "@/api/ballance";
import fs from "@/api/fs";
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
    valid = await fs.exists(file);
    // 如果有校验器，执行校验
    if (valid && target.validator) {
      const size = await fs.size(file);
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

/** 检查 Ballance 文件夹并返回实例的详细信息 */
export const checkBallanceFolder = async (
  baseFolder: string
): Promise<BallanceInstance | null> => {
  const ballanceFiles = await checkFiles(baseFolder, "ballance");
  if (!ballanceFiles) return null;

  const instance = { path: baseFolder } as BallanceInstance;

  const tdbPath = await join(baseFolder, "Database.tdb");

  instance.options = await ballance.readOptions(tdbPath);

  const bml = await checkFiles(baseFolder, "bml");
  if (bml) {
    instance.bmlInstalled = true;
    instance.bmlEnabled = bml.has("BuildingBlocks/BML.dll");
  } else {
    instance.bmlInstalled = instance.bmlEnabled = false;
  }

  const bmlp = await checkFiles(baseFolder, "bmlp");
  if (bmlp) {
    instance.bmlpInstalled = true;
    instance.bmlpEnabled = bmlp.has("BuildingBlocks/BMLPlus.dll");
  } else {
    instance.bmlpInstalled = instance.bmlpEnabled = false;
  }

  const newPlayer = await checkFiles(baseFolder, "newPlayer");
  if (newPlayer) {
    instance.newPlayer = true;
  } else {
    instance.newPlayer = false;
  }

  return instance;
};
