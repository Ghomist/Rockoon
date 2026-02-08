import { fetch } from "@tauri-apps/plugin-http";

const ENDPOINTS = {
  download: "https://dl.bcrc.site"
};

export type EndpointType = keyof typeof ENDPOINTS;

export const request = (
  endpoint: EndpointType,
  url: string,
  option?: RequestInit
) => {
  return fetch(ENDPOINTS[endpoint] + url, option);
};

export const getJson = async <T>(endpoint: EndpointType, url: string) => {
  const response = await request(endpoint, url);
  return (await response.json()) as T;
};
