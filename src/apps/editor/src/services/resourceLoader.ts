type ResourceEncoding = "utf-8" | "base64";

const DEFAULT_RESOURCE_BASE = "http://localhost:4000";

type ResourceRequestOptions = {
  baseUrl?: string;
  encoding?: ResourceEncoding;
};

export type SpriteSheetResource = {
  name: string;
  path: string;
  sizeBytes: number;
};

export type AssetCategory = "directory" | "texture" | "sprite" | "actor" | "audio" | "data" | "container" | "unknown";

export type AssetNode = {
  name: string;
  path: string;
  kind: "directory" | "file" | "entry";
  assetType: AssetCategory;
  sizeBytes?: number;
  extension?: string;
  children?: AssetNode[];
  contentType?: string;
  metadata?: Record<string, unknown>;
  entryId?: string;
  containerPath?: string;
};

export async function loadResourceContent(path: string, options?: ResourceRequestOptions): Promise<string> {
  const baseUrl = options?.baseUrl ?? DEFAULT_RESOURCE_BASE;
  const encoding = options?.encoding ?? "utf-8";
  const url = new URL(`${baseUrl}/api/resources/content`);
  url.searchParams.set("path", path);
  if (encoding !== "utf-8") {
    url.searchParams.set("encoding", encoding);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to load resource ${path}: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

export async function saveResourceContent(path: string, content: string, options?: ResourceRequestOptions): Promise<void> {
  const baseUrl = options?.baseUrl ?? DEFAULT_RESOURCE_BASE;
  const encoding = options?.encoding ?? "utf-8";
  const url = `${baseUrl}/api/resources/content?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content, encoding }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save resource ${path}: ${res.status} ${res.statusText}`);
  }
}

export const DEFAULT_LEVEL_PATH = "levels/grasslands.json";

export async function loadResourceLevel(path: string, baseUrl: string = DEFAULT_RESOURCE_BASE): Promise<string> {
  return loadResourceContent(path, { baseUrl, encoding: "utf-8" });
}

export async function saveResourceLevel(path: string, content: string, baseUrl: string = DEFAULT_RESOURCE_BASE): Promise<void> {
  await saveResourceContent(path, content, { baseUrl, encoding: "utf-8" });
}

export async function saveBinaryResource(path: string, base64Content: string, baseUrl: string = DEFAULT_RESOURCE_BASE): Promise<void> {
  await saveResourceContent(path, base64Content, { baseUrl, encoding: "base64" });
}

export async function loadBinaryResource(path: string, baseUrl: string = DEFAULT_RESOURCE_BASE): Promise<string> {
  return loadResourceContent(path, { baseUrl, encoding: "base64" });
}

export async function fetchSpriteSheets(baseUrl: string = DEFAULT_RESOURCE_BASE): Promise<SpriteSheetResource[]> {
  const res = await fetch(`${baseUrl}/api/resources/spritesheets`);
  if (!res.ok) {
    throw new Error(`Failed to load sprite sheet list: ${res.status} ${res.statusText}`);
  }
  const payload = await res.json();
  return payload?.data ?? [];
}

export async function fetchAssetTree(baseUrl: string = DEFAULT_RESOURCE_BASE): Promise<AssetNode> {
  const res = await fetch(`${baseUrl}/api/resources/assets`);
  if (!res.ok) {
    throw new Error(`Failed to load asset tree: ${res.status} ${res.statusText}`);
  }
  const payload = await res.json();
  if (!payload?.data) {
    throw new Error("Asset tree response missing data payload");
  }
  return payload.data as AssetNode;
}