import { ResourceManager, StringUtils, isBrowser, isServer } from "@repo/engine";

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

    async loadResource(path: string, noCache?: boolean): Promise<string> {
        if (isServer()) {
            return await this.readFileFromDisk(path);
        }

        if (isBrowser()) {
            const base = resolveResourceBase().replace(/\/$/, "");
            const isHttp = /^https?:/i.test(base);
            const cacheBust = noCache ? `&_=${Date.now()}` : "";

            if (isHttp) {
                const url = `${base}/api/resources/content?path=${encodeURIComponent(path)}${cacheBust}`;
                return await this.fetchText(url);
            }

            const url = `${base}/${path}`.replace(/\\+/g, "/");
            return await this.fetchText(url);
        }

        return "";
    }

    private async fetchText(target: string): Promise<string> {
        const response = await fetch(target);
        if (!response.ok) {
            throw new Error(`Failed to fetch resource from ${target}: ${response.status} ${response.statusText}`);
        }
        return response.text();
    }

    private async readFileFromDisk(target: string): Promise<string> {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const absolutePath = path.join(process.cwd(), target);
        return fs.readFile(absolutePath, "utf-8");
    }
}
