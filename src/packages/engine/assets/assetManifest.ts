export const MAGIC = "n2ar";
export const HEADER_SIZE = 64;

export class UnpackedAsset {
    public header: AssetHeader | null = null;
    public manifest: AssetManifest | null = null;
    public entries: AssetPayloadPackedEntry[]  = [];

    findEntryById = (id?: string | null): AssetPayloadPackedEntry|null => {
        if (!id) {
            return null;
        }
        const index = this.entries.findIndex((entry) => entry.id === id) ?? -1;
        return index >= 0 ? this.entries[index] ?? null : null;
    };

    public getRootEntry(): AssetPayloadPackedEntry | null {
        const rootId = this.manifest?.rootEntryId;
        if(!rootId) {
            return this.entries[0] || null;
        }
        return this.findEntryById(rootId);
    }
}

export class AssetHeader {
  public magic: string = MAGIC;
  public version: number = 1;
  public flags: number = 0;
  public manifestOffset: bigint = 0n;
  public manifestLength: bigint = 0n;
  public payloadOffset: bigint = 0n;
  public payloadLength: bigint = 0n;
  public fileLength: bigint = 0n;
}

export class AssetManifest {
    public format: string = "";
    public entries: AssetManifestEntry[] = [];
    public version: number = 1;
    public createdAt: number = Date.now();
    public updatedAt: number = Date.now();
    public createdBy: string = "";
    public updatedBy: string = "";
    /** Optional id of the entry that represents the primary asset in the container. */
    public rootEntryId?: string;
}

export class AssetManifestEntry {
    public id: string = "";
    public name: string = "";
    public type: string = "";
    public contentType: string = "";
    public offset: number = 0;
    public length: number = 0;
    public hash: string = "";
    public encoding: "raw" | "gzip" | "br" = "raw";
    public metadata: any = {}
}

export class AssetPayloadPackedEntry {
    public id: string = ""
    public name?: string = "";
    public type: string = "";
    public contentType: string = "";
    public bytes: Uint8Array = new Uint8Array(); // payload bytes (e.g. raw PNG bytes)
    public hash?: string;
    public encoding?: "raw" | "gzip" | "br";
    public metadata?: any;

}
