import { fetch } from "@tauri-apps/plugin-http";

import { useHubStore } from "@/stores/hub";
import { usePrefStore } from "@/stores/pref";

function getBaseUrl(): string {
  return usePrefStore().hubApiUrl || "http://127.0.0.1:8000";
}

function getAuthHeaders(): Record<string, string> {
  return useHubStore().authHeaders();
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${url}`, init);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function authRequest<T>(url: string, init?: RequestInit): Promise<T> {
  return request(url, {
    ...init,
    headers: { ...getAuthHeaders(), ...init?.headers }
  });
}

// ===== Maps =====

export async function fetchMaps(params: {
  author?: string;
  name?: string;
  tags?: string;
  min_difficulty?: number;
  max_difficulty?: number;
  min_quality?: number;
  max_quality?: number;
  min_duration?: number;
  max_duration?: number;
  skip?: number;
  limit?: number;
}): Promise<HubMapListResponse> {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  });
  return request(`/maps?${sp}`);
}

export async function fetchMap(id: number): Promise<HubMapResponse> {
  return request(`/maps/${id}`);
}

export async function fetchTags(): Promise<HubTagCount[]> {
  return request("/maps/tags");
}

export async function getDownloadUrl(
  mapId: number,
  version?: number
): Promise<HubDownloadUrlResponse> {
  const sp = version ? `?version=${version}` : "";
  return request(`/maps/${mapId}/download${sp}`);
}

export async function uploadMap(formData: FormData): Promise<HubMapResponse> {
  return authRequest("/maps", { method: "POST", body: formData });
}

export async function updateMap(
  id: number,
  data: Record<string, unknown>
): Promise<HubMapResponse> {
  return authRequest(`/maps/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function uploadVersion(
  mapId: number,
  formData: FormData
): Promise<HubMapResponse> {
  return authRequest(`/maps/${mapId}/version`, {
    method: "POST",
    body: formData
  });
}

export async function addPreview(
  mapId: number,
  formData: FormData
): Promise<HubMapResponse> {
  return authRequest(`/maps/${mapId}/preview`, {
    method: "POST",
    body: formData
  });
}

export async function deletePreview(
  mapId: number,
  filename: string
): Promise<void> {
  await authRequest(`/maps/${mapId}/preview/${encodeURIComponent(filename)}`, {
    method: "DELETE"
  });
}

export async function deleteMap(mapId: number): Promise<void> {
  await authRequest(`/maps/${mapId}`, { method: "DELETE" });
}

// ===== Authors =====

export async function fetchAuthorsWithCount(): Promise<HubAuthorWithCount[]> {
  return request("/authors/with-count");
}

export async function addAuthor(name: string): Promise<void> {
  await authRequest(`/authors?name=${encodeURIComponent(name)}`, {
    method: "POST"
  });
}

export async function deleteAuthor(authorId: number): Promise<void> {
  await authRequest(`/authors/${authorId}`, { method: "DELETE" });
}

export async function updateAuthor(
  id: number,
  data: { name?: string; aliases?: string[] }
): Promise<void> {
  await authRequest(`/authors/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

// ===== Auth =====

export async function login(password: string): Promise<string> {
  const res = await request<{ token: string }>(
    `/auth/login?password=${encodeURIComponent(password)}`,
    { method: "POST" }
  );
  return res.token;
}

export async function checkAuth(): Promise<boolean> {
  try {
    await authRequest("/auth/check");
    return true;
  } catch {
    return false;
  }
}

// ===== Batch Upload =====

export async function downloadBatchTemplate(): Promise<Blob> {
  const res = await fetch(`${getBaseUrl()}/batch/template`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.blob();
}

export async function batchUpload(
  formData: FormData
): Promise<HubBatchUploadResponse> {
  return authRequest("/batch/upload", { method: "POST", body: formData });
}
