import { isServer,isBrowser, StringUtils } from ".";

const DEFAULT_RESOURCE_BASE = "http://localhost:4000";

const resolveResourceBase = (): string => {
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

export abstract class ResourceManager {
    /**
     * Load resources such as maps, images, etc.
     * Resources are loaded based on the environment (server or browser).
     * Each resource is identified by it's path relative to the resource-root.
     * I.E. "maps/map01.tmx" or "sprites/hero/sprite01.png"
     * @param resource
     */
    public abstract loadResource(resource: string, noCache?: boolean, encode?: boolean): Promise<string>;

	/**
	 * Load an asset container as an ArrayBuffer.
	 * @param path Path to the asset container.
	 * @param baseUrl Optional base URL to load the asset from (browser only).
	 * @param noCache Optional flag to bypass cache (browser only).
	 */
	public abstract loadAsset(path: string, baseUrl?: string, noCache?: boolean): Promise<ArrayBuffer>;
}


export class DefaultResourceManager extends ResourceManager {

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
		console.log(`Loading resource from path: ${path} (noCache: ${noCache})`);
        // Default implementation could be empty or throw an error
       if(isServer()) {
        console.log("Load from filesystem");
        return await this.readFileFromDisk(path);
       }

       if( isBrowser()) {
        return await this.fetchText(path, noCache, encode);
       }

       return "";
    }

    private async fetchText(path: string, noCache?: boolean, encode?: boolean): Promise<string> {
		const trimmedBase = resolveResourceBase().replace(/\/$/, "");
		const isHttp = /^https?:/i.test(trimmedBase);
		const cacheBust = noCache ? `&_=${Date.now()}` : "";

		const url = isHttp
			? `${trimmedBase}/api/resources/content?path=${encodeURIComponent(path)}${encode ? "&encoding=base64" : ""}${cacheBust}`
			: `${trimmedBase}/${path}`;

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch TMX map from ${path}: ${response.status} ${response.statusText}`);
		}
		return response.text();
	}

	// private async readFileFromUrl(fileUrl: string): Promise<string> {
	// 	const urlModule = await import("node:url");
	// 	const fs = await import("node:fs/promises");
	// 	const filePath = urlModule.fileURLToPath(fileUrl);
	// 	return fs.readFile(filePath, "utf-8");
	// }

	private async readFileFromDisk(target: string): Promise<string> {
		const fs = await import("node:fs/promises");
		const path = await import("node:path");
		
		const absolutePath = path.join(process.cwd(), target);

		return fs.readFile(absolutePath, "utf-8");
	}
}

/**
 * if (Url.isValidUrl(target)) {
			return this.fetchText(target);
		}

		if (target.startsWith("file://")) {
			return this.readFileFromUrl(target);
		}

		if (typeof window !== "undefined") {
			return this.fetchText(target);
		}

		return this.readFileFromDisk(target);
 */