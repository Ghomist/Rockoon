import { usePrefStore } from "@/stores/pref";
import { fetch } from "@tauri-apps/plugin-http";
import storage from "./storage";

const STORAGE_KEY = "ys-storage";

const homeLink = "http://ballancemaps.ysepan.com/";
const indexLink = `{baseUrl}/f_ht/ajcx/ml.aspx?cz=ml_dq&_dlmc={username}&_dlmm=`;
const fileListLink = `{baseUrl}/f_ht/ajcx/wj.aspx?cz=dq&jsq=0&mlbh={index}&wjpx=1&_dlmc={username}&_dlmm=`;

const folderFilters = ["Ballance", "地图", "专业竞速"];

const escape = (s: string) =>
  Array.from(
    s,
    c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
  ).join("");

const getYsHtml = async (url: string, meta: any) => {
  url = url.replace("{baseUrl}", meta.ccym).replace("{username}", meta.dlmc);
  let responseString = await fetch(url, {
    method: "GET",
    referrer: `${meta.ccym}/f_ht/ajcx/000ht.html?bbh=${meta.bbh}`, // set for capacity
    headers: {
      referer: `${meta.ccym}/f_ht/ajcx/000ht.html?bbh=${meta.bbh}` // use unsafe-header
    }
  })
    .then(response => response.text())
    .then(text => text.substring(text.indexOf("]") + 1))
    .then(text => decodeURIComponent(escape(window.atob(text))))
    .then(text => text.replace(/&amp;/g, "&"))
    .then(text => text.replace(/&#183;/g, "·"))
    .then(text => text.replace(/&#176;/g, "°"))
    .catch(error => {
      console.error("Error: ", error);
    });
  return responseString ?? "";
};

const parseYsDate = (date: string) => {
  const result = new Date();
  result.setHours(0, 0, 0, 0);

  if (date.includes("昨日")) {
    result.setDate(result.getDate() - 1);
    return result;
  }

  let match = date.match(/(\d+)月(\d+)日/);
  if (match) result.setMonth(parseInt(match[1]) - 1, parseInt(match[2]));

  match = date.match(/(\d+)号/);
  if (match) result.setDate(parseInt(match[1]));

  match = date.match(/(\d+)年/);
  if (match) result.setFullYear(parseInt(match[1]));

  return result;
};

/**
 * 获取地图站的文件
 * @param refresh 强制刷新缓存
 */
export const fetchFiles = async (refresh = false) => {
  const cache = storage.getWithDefault<YsCache>(STORAGE_KEY, {
    meta: {},
    folders: [],
    files: {}
  });

  if (
    !refresh &&
    cache.lastUpdate &&
    cache.lastUpdate.getTime() + usePrefStore().expireMs > Date.now()
  ) {
    console.info(`Using cached files, last update: ${cache.lastUpdate}`);
    return cache;
  }

  console.info("Fetching files...");

  const homeHtml = await fetch(homeLink).then(response => response.text());
  const match = homeHtml.match(/_kj\s*=\s*(\{[^}]+\})/);
  if (match) {
    const jsonText = match[1]
      .replace(/([\w]+):(?!\/\/)/g, '"$1":')
      .replace(/'/g, '"');
    cache.meta = JSON.parse(jsonText);
  }

  if (!cache.meta) throw Error("Cannot read meta");

  // fetch folders
  const folderHtml = await getYsHtml(indexLink, cache.meta);
  cache.folders = Array.from(
    folderHtml.matchAll(
      /<li[^<>]+id="ml_([0-9]+)"[^<>]*>.*?<a [^<>]*>([^<>]+)<\/a><label>([^<>]+)?<\/label>.*?<\/li>/g
    )
  )
    .map(matches => ({
      id: matches[1],
      name: matches[2],
      notes: matches[3] ?? ""
    }))
    .filter(folder =>
      folderFilters.some(filter => folder.name.includes(filter))
    );

  // fetch files
  for (const index of cache.folders) {
    console.info(`Fetching files for ${index.name}...`);
    const htmlString = await getYsHtml(
      fileListLink.replace("{index}", index.id),
      cache.meta
    );
    cache.files[index.id] = Array.from(
      htmlString.matchAll(
        /<li\b[^>]*>.*?<a\b[^>]*?href="([^"]*)"[^>]*?title="([^"]*)"[^>]*?>([\s\S]*?)<\/a>\s*<i>([\s\S]*?)<\/i>\s*<b>([\s\S]*?)<\/b>\s*<span>[\s\S]*?<\/span>/gis
      )
    ).map<YsFile>(matches => ({
      category: index.name,
      filename: matches[3],
      url: matches[1],
      size: matches[4],
      notes: matches[5] ?? "",
      uploadTime: parseYsDate(matches[2])
    }));
  }

  // update time
  cache.lastUpdate = new Date();

  // save cache
  storage.set(STORAGE_KEY, cache);

  console.info("Fetch complete");

  return cache;
};
