type Entry = {
  name?: string;
  dir?: boolean;
  md5?: string;
};

type Manifest = {
  [key: string]: Entry | Manifest;
};
