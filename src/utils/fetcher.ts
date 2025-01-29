export type YsIndex = {
  id: string;
  name: string;
  notes: string;
};

export type YsMap = YsFile & {
  name: string;
  author: string;
  difficulty: string;
  remark: string;
};

export type YsMod = YsFile & {
  name: string;
  loader: string;
  author: string;
  remark: string;
};

export type YsFile = {
  category: string;
  filename: string;
  url: string;
  size: string;
  notes: string;
  uploadTime: string;
};

const username = "ballancemaps";
const indexLink = `http://c3.ysepan.com/f_ht/ajcx/ml.aspx?cz=ml_dq&_dlmc=${username}&_dlmm=`;
const fileListLink = `http://c3.ysepan.com/f_ht/ajcx/wj.aspx?cz=dq&jsq=0&mlbh={index}&wjpx=1&_dlmc=${username}&_dlmm=`;
let indexesCache: YsIndex[] = [];
let filesCache: { [key: string]: YsFile[] } = {};

const clearCache = () => {
  indexesCache = [];
  filesCache = {};
};

const searchIndexes = async (patternString: string) => {
  if (indexesCache.length == 0) {
    const htmlString = await getYsHtml(indexLink);
    indexesCache = Array.from(
      htmlString.matchAll(
        /<li[^<>]+id="ml_([0-9]+)"[^<>]*>.*?<a [^<>]*>([^<>]+)<\/a><label>([^<>]+)?<\/label>.*?<\/li>/g
      )
    ).map(matches => ({
      id: matches[1],
      name: matches[2],
      notes: matches[3] ?? ""
    }));
  }
  const groupPattern = new RegExp(patternString);
  const matchedIndexes: YsIndex[] = [];
  indexesCache.forEach(index => {
    if (groupPattern.test(index.name)) matchedIndexes.push(index);
  });
  return matchedIndexes;
};

const getFileList = async (index: YsIndex, categoryAlias?: string) => {
  if ((filesCache[index.id] ?? []).length == 0) {
    const htmlString = await getYsHtml(
      fileListLink.replace("{index}", index.id)
    );
    filesCache[index.id] = Array.from(
      htmlString.matchAll(
        /<li(?:[^<>]+)>.*?<a[^<>]+?href="([^">]+)"(?:[^<>]+)?>([^<>]+)<\/a><i>([^<]+)<\/i><b>([^<]+)<\/b><span(?:[^<>]+)>([^<>]+)<\/span>.*?<\/a><\/li>/g
      )
    ).map<YsFile>(matches => ({
      filename: matches[2],
      url: matches[1],
      size: matches[3],
      notes: matches[4] ?? "",
      uploadTime: matches[5],
      category: categoryAlias ?? index.name
    }));
  }
  return filesCache[index.id];
};

const getYsHtml = async (url: string) => {
  let responseString = await fetch(url, {
    method: "GET",
    referrer: "http://cg.ys168.com/f_ht/ajcx/000ht.html?bbh=1134"
  })
    .then(response => response.text())
    .then(text => text.substring(text.indexOf("]") + 1))
    .then(text => decodeURIComponent(escape(window.atob(text))))
    .then(text => text.replace(/&amp;/g, "&"))
    .then(text => text.replace(/&#183;/g, "·"))
    .catch(error => {
      console.error("Error: ", error);
    });
  return responseString ?? "";
};

export const toYsMap = (file: YsFile): YsMap => {
  const parts = file.notes.split("|");
  return {
    ...file,
    name: file.filename.replace(/.nmo/i, "").replace(/\.level/i, ""),
    author: parts[0] ?? "",
    difficulty: parts[1] ?? "",
    remark: parts[2] ?? ""
  };
};

export const toYsMod = (file: YsFile): YsMod => {
  const parts = file.notes.split("|");
  return {
    ...file,
    name: file.filename.replace(/.bmodp?/i, ""),
    author: parts[0] ?? "",
    loader: parts[1] ?? "",
    remark: parts[2] ?? ""
  };
};

export const fetcher = {
  searchIndexes,
  getFileList,
  clearCache
};
