export const MAGIC = "n2ar";
export const HEADER_SIZE = 64;

export class AssetHeader {
  magic: string = MAGIC;
  version: number = 1;
  flags: number = 0;
  manifestOffset: bigint = 0n;
  manifestLength: bigint = 0n;
  payloadOffset: bigint = 0n;
  payloadLength: bigint = 0n;
  fileLength: bigint = 0n;
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
    name?: string = "";
    type: string = "";
    contentType: string = "";
    bytes: Uint8Array = new Uint8Array(); // payload bytes (e.g. raw PNG bytes)
    hash?: string;
    encoding?: "raw" | "gzip" | "br";
    metadata?: any;

}
