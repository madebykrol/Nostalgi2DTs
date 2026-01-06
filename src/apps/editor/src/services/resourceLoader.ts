import { AssetService, type AssetPayloadPackedEntry } from "@repo/engine";

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
  manifestType?: string;
  rootEntryId?: string;
  sizeBytes?: number;
  extension?: string;
  children?: AssetNode[];
  contentType?: string;
  metadata?: Record<string, unknown>;
  entryId?: string;
  containerPath?: string;
  isContainer?: boolean;
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

export const DEFAULT_LEVEL_PATH = "levels/grasslands.n2asset";

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const findEntryById = <T extends { id?: string }>(entries: T[], id?: string | null): { entry?: T; index: number } => {
  if (!id) {
    return { entry: undefined, index: -1 };
  }
  const index = entries.findIndex((entry) => entry.id === id);
  return index >= 0 ? { entry: entries[index], index } : { entry: undefined, index: -1 };
};

const pickLevelEntry = (entries: { type?: string; contentType?: string }[]): number => {
  if (!entries || entries.length === 0) {
    return -1;
  }
  const byType = entries.findIndex((entry) => (entry.type ?? "").toLowerCase() === "level");
  if (byType >= 0) {
    return byType;
  }
  const byContent = entries.findIndex((entry) => (entry.contentType ?? "").toLowerCase().includes("json"));
  if (byContent >= 0) {
    return byContent;
  }
  return 0;
};

export async function loadResourceLevel(path: string, baseUrl: string = DEFAULT_RESOURCE_BASE): Promise<string> {
  if (path.toLowerCase().endsWith(".n2asset")) {
    const res = await fetch(`${baseUrl}/api/resources/content?path=${encodeURIComponent(path)}&encoding=base64`);
    if (!res.ok) {
      throw new Error(`Failed to load asset container ${path}: ${res.status} ${res.statusText}`);
    }
    const base64 = await res.text();
    const buffer = base64ToArrayBuffer(base64);
    const service = new AssetService();
    const header = service.parseHeader(buffer);
    const manifest = service.readManifest(buffer);
    const entries = manifest.entries ?? [];
    const { entry: rootById, index: rootIndex } = findEntryById(entries, manifest.rootEntryId);
    const fallbackIndex = pickLevelEntry(entries);
    const resolvedEntry = rootById ?? (fallbackIndex >= 0 ? entries[fallbackIndex] : undefined);
    const entryIndex = rootById ? rootIndex : fallbackIndex;
    if (!resolvedEntry || entryIndex === -1) {
      throw new Error(`No usable entries found in asset container ${path}`);
    }
    const entry = resolvedEntry;
    const payloadBytes = service.getEntryPayloadBytes(buffer, entry, header);
    const text = new TextDecoder("utf-8").decode(payloadBytes);
    return text;
  }

  return loadResourceContent(path, { baseUrl, encoding: "utf-8" });
}

export async function saveResourceLevel(path: string, content: string, baseUrl: string = DEFAULT_RESOURCE_BASE): Promise<void> {
  if (path.toLowerCase().endsWith(".n2asset")) {
    // Load existing container, replace level entry bytes, repack
    const res = await fetch(`${baseUrl}/api/resources/content?path=${encodeURIComponent(path)}&encoding=base64`);
    if (!res.ok) {
      throw new Error(`Failed to load asset container ${path}: ${res.status} ${res.statusText}`);
    }
    const base64 = await res.text();
    const buffer = base64ToArrayBuffer(base64);
    const service = new AssetService();
    const header = service.parseHeader(buffer);
    const manifest = service.readManifest(buffer);
    const entries = manifest.entries ?? [];
    const { entry: rootById, index: rootIndex } = findEntryById(entries, manifest.rootEntryId);
    const fallbackIndex = pickLevelEntry(entries);
    const entryIndex = rootById ? rootIndex : fallbackIndex;
    if (entryIndex === -1) {
      throw new Error(`No entries available to save in asset container ${path}`);
    }
    const encoder = new TextEncoder();
    const updatedBytes = encoder.encode(content);

    const packedEntries: AssetPayloadPackedEntry[] = entries.map((entry, idx) => {
      const bytes = service.getEntryPayloadBytes(buffer, entry, header);
      const payload = idx === entryIndex ? updatedBytes : bytes;
      return {
        id: entry.id,
        name: entry.name,
        type: entry.type,
        contentType: entry.contentType,
        bytes: payload,
        hash: entry.hash,
        encoding: entry.encoding,
        metadata: entry.metadata ?? {},
      };
    });

    manifest.entries[entryIndex].length = updatedBytes.byteLength;
    manifest.updatedAt = Date.now();
    manifest.rootEntryId = manifest.rootEntryId ?? entries[entryIndex].id;

    const repacked = await service.packAsset(manifest, packedEntries);
    const repackedBase64 = arrayBufferToBase64(repacked);
    await saveResourceContent(path, repackedBase64, { baseUrl, encoding: "base64" });
    return;
  }

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