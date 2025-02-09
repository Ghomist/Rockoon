import storage from "./storage";

const expireTime = 1000 * 60 * 90; // 90 min
const STORAGE_KEY = "ys-storage";
const username = "ballancemaps";
const indexLink = `http://c6.ysepan.com/f_ht/ajcx/ml.aspx?cz=ml_dq&_dlmc=${username}&_dlmm=`;
const fileListLink = `http://c6.ysepan.com/f_ht/ajcx/wj.aspx?cz=dq&jsq=0&mlbh={index}&wjpx=1&_dlmc=${username}&_dlmm=`;

const getYsHtml = async (url: string) => {
  let responseString = await fetch(url, {
    method: "GET",
    referrer: "http://cg.ys168.com/f_ht/ajcx/000ht.html?bbh=1183"
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

/**
 * 获取地图站的文件
 * @param refresh 强制刷新缓存
 */
export const fetchFiles = async (refresh = false) => {
  const cache = storage.getWithDefault<YsCache>(STORAGE_KEY, {
    folders: [],
    files: {}
  });

  if (
    !refresh &&
    cache.lastUpdate &&
    cache.lastUpdate.getTime() + expireTime > Date.now()
  ) {
    return cache;
  }

  // fetch folders
  const folderHtml = await getYsHtml(indexLink);
  cache.folders = Array.from(
    folderHtml.matchAll(
      /<li[^<>]+id="ml_([0-9]+)"[^<>]*>.*?<a [^<>]*>([^<>]+)<\/a><label>([^<>]+)?<\/label>.*?<\/li>/g
    )
  ).map(matches => ({
    id: matches[1],
    name: matches[2],
    notes: matches[3] ?? ""
  }));

  // fetch files
  for (const index of cache.folders) {
    const htmlString = await getYsHtml(
      fileListLink.replace("{index}", index.id)
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const list = [];
    for (const li of doc.querySelectorAll("li.xwj")) {
      const a = li.getElementsByTagName("a")[0];
      list.push({
        category: index.name,
        filename: a.text,
        url: a.href,
        size: li.getElementsByTagName("i")[0]?.innerText ?? "",
        notes: li.getElementsByTagName("b")[0]?.innerText ?? "",
        uploadTime: a.title
      } as YsFile);
    }
    cache.files[index.id] = list;
  }

  // update time
  cache.lastUpdate = new Date();

  // save cache
  storage.set(STORAGE_KEY, cache);

  return cache;
};
