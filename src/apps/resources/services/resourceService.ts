import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ResourceNode } from "../types/resource";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contentRoot = path.resolve(__dirname, "../content");

export const resourceService = {
  async listTree(): Promise<ResourceNode> {
    return this.buildNode("", contentRoot);
  },

  async getFile(relPath: string): Promise<string> {
    let normalized = relPath.replace(/^\/+/, "");
    if (normalized.startsWith("content/")) {
      normalized = normalized.substring("content/".length);
    }
    const fullPath = path.join(contentRoot, normalized);
    return fs.readFile(fullPath, "utf-8");
  },

  async saveFile(relPath: string, content: string): Promise<void> {
    let normalized = relPath.replace(/^\/+/, "");
    if (normalized.startsWith("content/")) {
      normalized = normalized.substring("content/".length);
    }
    const fullPath = path.join(contentRoot, normalized);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
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
};