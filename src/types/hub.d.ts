type HubMapResponse = {
  id: number;
  name: string;
  author: string;
  description?: string;
  difficulty: number;
  quality: number;
  duration: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  preview_images: string[];
  current_version?: number;
};

type HubMapListResponse = {
  total: number;
  items: HubMapResponse[];
};

type HubTagCount = {
  name: string;
  count: number;
};

type HubDownloadUrlResponse = {
  download_url: string;
  expires_in: number;
};

type HubBatchRowResult = {
  row: number;
  name: string;
  ok: boolean;
  id?: number;
  previews: number;
  error?: string;
};

type HubBatchUploadResponse = {
  total: number;
  created: number;
  failed: number;
  results: HubBatchRowResult[];
};

type HubAuthorWithCount = {
  id: number;
  name: string;
  aliases: string[];
  map_count: number;
};
