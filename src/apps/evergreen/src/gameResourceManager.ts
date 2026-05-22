import { ResourceManager, StringUtils, isBrowser, isServer } from "@nostalgi2d/engine";

const DEFAULT_RESOURCE_BASE = "http://localhost:4000";

const resolveResourceBase = (): string => {
    // In production (built game), use bundled assets under /assets.
    if (typeof import.meta !== "undefined" && (import.meta as any).env?.PROD) {
        return "/assets";
    }

    const maybeImportMeta: any = typeof import.meta !== "undefined" ? (import.meta as any) : undefined;
    const viteEnv = maybeImportMeta?.env?.VITE_RESOURCE_BASE;
    if (viteEnv && typeof viteEnv === "string" && viteEnv.trim().length > 0) {
        return viteEnv.trim();
    }

    if (typeof process !== "undefined" && process.env?.VITE_RESOURCE_BASE) {
        return process.env.VITE_RESOURCE_BASE.trim();
    }

    return DEFAULT_RESOURCE_BASE;
};

export class GameResourceManager extends ResourceManager {
    async loadAsset(path: string, baseUrl: string = resolveResourceBase(), noCache?: boolean): Promise<ArrayBuffer> {
        const trimmedBase = baseUrl.replace(/\/$/, "");
        const isHttp = /^https?:/i.test(trimmedBase);
        const cacheBust = noCache ? `&_=${Date.now()}` : "";

        const url = isHttp
            ? `${trimmedBase}/api/resources/content?path=${encodeURIComponent(path)}&encoding=base64${cacheBust}`
            : `${trimmedBase}/${path}`;

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to load asset container ${path}: ${res.status} ${res.statusText}`);
        }

        if (isHttp) {
            return StringUtils.base64ToArrayBuffer(await res.text());
        }

        return res.arrayBuffer();
    }

    async loadResource(path: string, noCache?: boolean, encode?: boolean): Promise<string> {
        if (isServer()) {
            return await this.readFileFromDisk(path, encode);
        }

        if (isBrowser()) {
            const base = resolveResourceBase().replace(/\/$/, "");
            const isHttp = /^https?:/i.test(base);
            const cacheBust = noCache ? `&_=${Date.now()}` : "";

            if (isHttp) {
                const url = `${base}/api/resources/content?path=${encodeURIComponent(path)}${encode ? "&encoding=base64" : ""}${cacheBust}`;
                return await this.fetchText(url);
            }

            const url = `${base}/${path}`.replace(/\\+/g, "/");
            return await this.fetchText(url, encode);
        }

        return "";
    }

    private async fetchText(target: string, encode?: boolean): Promise<string> {
        const response = await fetch(target);
        if (!response.ok) {
            throw new Error(`Failed to fetch resource from ${target}: ${response.status} ${response.statusText}`);
        }

        if (encode) {
            const buffer = await response.arrayBuffer();
            return StringUtils.arrayBufferToBase64(buffer);
        }

        return response.text();
    }

    private async readFileFromDisk(target: string, encode?: boolean): Promise<string> {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const absolutePath = path.join(process.cwd(), target);

        if (encode) {
            const data = await fs.readFile(absolutePath);
            return data.toString("base64");
        }

        return fs.readFile(absolutePath, "utf-8");
    }
}
