#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(appRoot, "resource-manifest.json");
const publicRoot = path.join(appRoot, "public", "assets");

const readManifest = async () => {
  const raw = await fs.readFile(manifestPath, "utf-8");
  return JSON.parse(raw);
};

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const decodeBase64 = (data) => Buffer.from(data, "base64");

const main = async () => {
  const manifest = await readManifest();
  const baseUrl = (process.env.RESOURCE_SERVER_URL || manifest.baseUrl || "http://localhost:4000").replace(/\/$/, "");

  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    console.warn("No assets listed in resource-manifest.json; skipping fetch.");
    return;
  }

  await ensureDir(publicRoot);

  for (const entry of manifest.assets) {
    const assetPath = entry?.path;
    if (typeof assetPath !== "string" || assetPath.trim().length === 0) {
      continue;
    }
    const version = entry?.version ? `&v=${encodeURIComponent(entry.version)}` : "";
    const url = `${baseUrl}/api/resources/content?path=${encodeURIComponent(assetPath)}&encoding=base64${version}`;
    console.log(`Downloading ${assetPath} from ${url}`);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${assetPath}: ${res.status} ${res.statusText}`);
    }
    const base64 = await res.text();
    const buffer = decodeBase64(base64);

    const targetPath = path.join(publicRoot, assetPath);
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, buffer);
    console.log(`Saved ${assetPath} -> ${path.relative(appRoot, targetPath)}`);
  }
};

main().catch((err) => {
  console.error("fetch-assets failed", err);
  process.exitCode = 1;
});
