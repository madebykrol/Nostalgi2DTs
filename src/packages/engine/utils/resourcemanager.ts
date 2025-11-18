import { isServer,isBrowser } from ".";

export abstract class ResourceManager {
    /**
     * Load resources such as maps, images, etc.
     * Resources are loaded based on the environment (server or browser).
     * Each resource is identified by it's path relative to the resource-root.
     * I.E. "maps/map01.tmx" or "sprites/hero/sprite01.png"
     * @param resource
     */
    public abstract loadResource(resource: string, noCache?: boolean): Promise<string>;
}

export class DefaultResourceManager extends ResourceManager {

    

    async loadResource(path: string, noCache?: boolean): Promise<string> {
        // Default implementation could be empty or throw an error
       if(isServer()) {
        console.log("Load from filesystem");
        return await this.readFileFromDisk(path);
       }

       if( isBrowser()) {
        return await this.fetchText(path);
       }

       return "";
    }

    private async fetchText(target: string): Promise<string> {
		const response = await fetch(target);
		if (!response.ok) {
			throw new Error(`Failed to fetch TMX map from ${target}: ${response.status} ${response.statusText}`);
		}
		return response.text();
	}

	private async readFileFromUrl(fileUrl: string): Promise<string> {
		const urlModule = await import("node:url");
		const fs = await import("node:fs/promises");
		const filePath = urlModule.fileURLToPath(fileUrl);
		return fs.readFile(filePath, "utf-8");
	}

	private async readFileFromDisk(target: string): Promise<string> {
		const fs = await import("node:fs/promises");
		const path = await import("node:path");
		const absolutePath = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
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