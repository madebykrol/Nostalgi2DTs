import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AssetCategory, type AssetNode, type ResourceNode } from "../types/resource";

export type ResourceFileDescriptor = {
  name: string;
  path: string;
  sizeBytes: number;
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tga", ".svg"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav", ".flac"]);
const DATA_EXTENSIONS = new Set([".json", ".tmx", ".xml", ".txt", ".bytes", ".cbor", ".bin"]);

const spritePathHint = /sprite|spritesheet|atlas/i;
const actorPathHint = /actor|actors|prefab|entity/i;

const classifyAssetCategory = (relPath: string, extension?: string): AssetCategory => {
  if (!extension) {
    return "unknown";
  }

  const lowerExt = extension.toLowerCase();

  if (IMAGE_EXTENSIONS.has(lowerExt)) {
    return spritePathHint.test(relPath) ? "sprite" : "texture";
  }
  if (AUDIO_EXTENSIONS.has(lowerExt)) {
    return "audio";
  }
  if (lowerExt === ".n2asset") {
    return "container";
  }
  if (lowerExt === ".json" && actorPathHint.test(relPath)) {
    return "actor";
  }
  if (DATA_EXTENSIONS.has(lowerExt)) {
    return "data";
  }

  return "unknown";
};

const manifestEntryTypeToCategory = (value?: string): AssetCategory => {
  const normalized = value?.toLowerCase();
  switch (normalized) {
    case "texture":
    case "image":
      return "texture";
    case "sprite":
      return "sprite";
    case "actor":
      return "actor";
    case "audio":
    case "sound":
      return "audio";
    case "data":
    case "binary":
      return "data";
    default:
      return "unknown";
  }
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

const HEADER_SIZE = 64;
const MAGIC = "n2ar";
const textDecoder = new TextDecoder("utf-8");

type AssetManifestEntry = {
  id: string;
  name: string;
  type: string;
  contentType: string;
  offset: number;
  length: number;
  hash?: string;
  encoding?: "raw" | "gzip" | "br";
  metadata?: Record<string, unknown>;
};

type AssetManifest = {
  format: string;
  version: number;
  entries: AssetManifestEntry[];
};

const readAscii4 = (view: DataView, offset: number): string => {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
};

const getU64 = (view: DataView, offset: number): bigint => {
  return view.getBigUint64(offset, true);
};

const parseAssetHeader = (buffer: ArrayBuffer) => {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Error("Asset buffer smaller than header");
  }
  const view = new DataView(buffer);
  const magic = readAscii4(view, 0);
  if (magic !== MAGIC) {
    throw new Error(`Invalid asset magic ${magic}`);
  }
  return {
    manifestOffset: Number(getU64(view, 8)),
    manifestLength: Number(getU64(view, 16)),
  };
};

const readAssetManifest = (buffer: ArrayBuffer): AssetManifest => {
  const header = parseAssetHeader(buffer);
  const { manifestOffset, manifestLength } = header;
  if (manifestOffset + manifestLength > buffer.byteLength) {
    throw new Error("Manifest range exceeds buffer");
  }
  const bytes = new Uint8Array(buffer, manifestOffset, manifestLength);
  const json = textDecoder.decode(bytes);
  const manifest = JSON.parse(json) as AssetManifest;
  if (manifest.format !== "n2ar" || manifest.version !== 1) {
    throw new Error("Unsupported asset manifest format");
  }
  return manifest;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contentRoot = path.resolve(__dirname, "../content");

export const resourceService = {
  async listTree(): Promise<ResourceNode> {
    return this.buildNode("", contentRoot);
  },

  async listAssetTree(): Promise<AssetNode> {
    return this.buildAssetNode("", contentRoot);
  },

  async getFile(relPath: string, encoding: BufferEncoding | "base64" = "utf-8"): Promise<string> {
    let normalized = relPath.replace(/^\/+/, "");
    if (normalized.startsWith("content/")) {
      normalized = normalized.substring("content/".length);
    }
    const fullPath = path.join(contentRoot, normalized);
    if (encoding === "base64") {
      const buffer = await fs.readFile(fullPath);
      return buffer.toString("base64");
    }
    return fs.readFile(fullPath, encoding);
  },

  async saveFile(relPath: string, content: string, encoding: BufferEncoding | "base64" = "utf-8"): Promise<void> {
    let normalized = relPath.replace(/^\/+/, "");
    if (normalized.startsWith("content/")) {
      normalized = normalized.substring("content/".length);
    }
    const fullPath = path.join(contentRoot, normalized);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    if (encoding === "base64") {
      await fs.writeFile(fullPath, Buffer.from(content, "base64"));
      return;
    }
    await fs.writeFile(fullPath, content, encoding);
  },

  async listFilesWithExtension(extension: string): Promise<ResourceFileDescriptor[]> {
    const normalizedExt = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
    const results: ResourceFileDescriptor[] = [];
    await this.walkAndCollect("", normalizedExt, results);
    return results;
  },

  async buildNode(relPath: string, absoluteBase: string): Promise<ResourceNode> {
    const fullPath = path.join(absoluteBase, relPath);
    const stat = await fs.stat(fullPath);
    const name = relPath === "" ? "content" : path.basename(fullPath);

    if (stat.isDirectory()) {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const children: ResourceNode[] = [];
      for (const entry of entries) {
        const childRel = path.join(relPath, entry.name);
        const childNode = await this.buildNode(childRel, absoluteBase);
        children.push(childNode);
      }
      return {
        name,
        path: relPath,
        kind: "directory",
        children,
      };
    }

    const extension = path.extname(name) || undefined;
    return {
      name,
      path: relPath,
      kind: "file",
      sizeBytes: stat.size,
      extension,
    };
  },

  async buildAssetNode(relPath: string, absoluteBase: string): Promise<AssetNode> {
    const fullPath = path.join(absoluteBase, relPath);
    const stat = await fs.stat(fullPath);
    const name = relPath === "" ? "content" : path.basename(fullPath);

    if (stat.isDirectory()) {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const children: AssetNode[] = [];
      for (const entry of entries) {
        const childRel = path.join(relPath, entry.name);
        const childNode = await this.buildAssetNode(childRel, absoluteBase);
        children.push(childNode);
      }
      return {
        name,
        path: relPath,
        kind: "directory",
        assetType: "directory",
        children,
      };
    }

    const rawExtension = path.extname(name);
    const extension = rawExtension ? rawExtension.toLowerCase() : undefined;
    const assetType = classifyAssetCategory(relPath, extension);
    const node: AssetNode = {
      name,
      path: relPath,
      kind: "file",
      assetType,
      sizeBytes: stat.size,
      extension,
    };

    if (extension === ".n2asset") {
      const entries = await this.readContainerEntries(relPath, absoluteBase);
      if (entries.length > 0) {
        node.children = entries;
      }
    }

    return node;
  },

  async readContainerEntries(relPath: string, absoluteBase: string): Promise<AssetNode[]> {
    const fullPath = path.join(absoluteBase, relPath);
    try {
      const fileBytes = await fs.readFile(fullPath);
      const manifest = readAssetManifest(toArrayBuffer(fileBytes));
      if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
        return [];
      }
      return manifest.entries.map((entry) => {
        const entryId = entry.id || `${relPath}-${entry.offset}`;
        return {
          name: entry.name || entryId,
          path: `${relPath}#${entryId}`,
          kind: "entry",
          assetType: manifestEntryTypeToCategory(entry.type),
          sizeBytes: entry.length,
          contentType: entry.contentType,
          metadata: entry.metadata ?? {},
          entryId,
          containerPath: relPath,
        };
      });
    } catch (error) {
      console.warn(`Failed to parse asset container ${relPath}`, error);
      return [];
    }
  },

  async walkAndCollect(relPath: string, extension: string, results: ResourceFileDescriptor[]): Promise<void> {
    const fullPath = path.join(contentRoot, relPath);
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        const childRel = path.join(relPath, entry.name);
        await this.walkAndCollect(childRel, extension, results);
      }
      return;
    }

    const name = path.basename(fullPath);
    if (path.extname(name).toLowerCase() !== extension) {
      return;
    }

    results.push({
      name,
      path: relPath,
      sizeBytes: stat.size,
    });
  },
};