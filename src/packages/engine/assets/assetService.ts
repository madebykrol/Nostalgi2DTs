import { inject, injectable, ResourceManager, StringUtils } from "..";
import { UnpackedAsset, AssetHeader, AssetManifest, AssetManifestEntry, AssetPayloadPackedEntry as AssetPayloadPackEntry, HEADER_SIZE, MAGIC } from "./assetManifest";

@injectable()
export class AssetService {

    public parseHeader(buffer: ArrayBuffer): AssetHeader
    {
        if (buffer.byteLength < HEADER_SIZE) throw new Error("Buffer too small for header");

        const view = new DataView(buffer);
        const magic = this.readAscii4(view, 0);
        if (magic !== MAGIC) throw new Error(`Invalid magic: ${magic}`);

        const version = view.getUint16(4, true);
        const flags = view.getUint16(6, true);

        const manifestOffset = this.getU64(view, 8);
        const manifestLength = this.getU64(view, 16);
        const payloadOffset = this.getU64(view, 24);
        const payloadLength = this.getU64(view, 32);
        const fileLength = this.getU64(view, 40);
        
        return {
            magic: MAGIC,
            version,
            flags,
            manifestOffset,
            manifestLength,
            payloadOffset,
            payloadLength,
            fileLength,
        };
    }

    public readManifest(buffer: ArrayBuffer): AssetManifest {
        const header = this.parseHeader(buffer);

        const manifestOffset = Number(header.manifestOffset);
        const manifestLength = Number(header.manifestLength);

        if (manifestOffset + manifestLength > buffer.byteLength) throw new Error("Manifest range out of bounds");

        const bytes = new Uint8Array(buffer, manifestOffset, manifestLength);
        const json = StringUtils.DecodeUtf(bytes);
        const manifest = JSON.parse(json) as AssetManifest;

        if (manifest.format !== "n2ar" || manifest.version !== 1) {
            throw new Error("Unsupported manifest format/version");
        }
        return manifest;
    }

    public getEntryPayloadBytes(
        buffer: ArrayBuffer,
        entry: Pick<AssetManifestEntry, "offset" | "length">,
        header?: AssetHeader
    ): Uint8Array {
        const parsedHeader = header ?? this.parseHeader(buffer);
        const base = Number(parsedHeader.payloadOffset);
        const start = base + entry.offset;
        const end = start + entry.length;

        if (start < 0 || end > buffer.byteLength) throw new Error("Payload range out of bounds");
        return new Uint8Array(buffer, start, entry.length);
    }

    public findEntryById(manifest: AssetManifest, id: string): AssetManifestEntry | undefined {
        return manifest.entries.find(e => e.id === id);
    }

    public unPackAsset(buffer: ArrayBuffer): UnpackedAsset {
        const asset = new UnpackedAsset();

        const header = this.parseHeader(buffer);
        asset.header = header;
        const manifest = this.readManifest(buffer);
        asset.manifest = manifest;
        const entries = manifest.entries ?? [];
        for (const entry of entries) {
            const payloadBytes = this.getEntryPayloadBytes(buffer, entry, header);
            asset.entries.push({
                id: entry.id,
                name: entry.name,
                type: entry.type,
                contentType: entry.contentType,
                bytes: payloadBytes,
                hash: entry.hash,
                encoding: entry.encoding ?? "raw",
                metadata: entry.metadata
            });
        }

        return asset;
    }

    public async packAsset(manifest: AssetManifest, entries: AssetPayloadPackEntry[]): Promise<ArrayBuffer> {
        const payloadAlignment = 8;

        // We build manifest after we know offsets/lengths.
        // Payload starts after header + manifest (unknown yet), so we first compute payload blob layout
        // with offsets relative to payload start.
        let rel = 0;
        const manifestEntries: AssetManifestEntry[] = await Promise.all(entries.map( async e => { 
            var entry = new AssetManifestEntry();
            const offset = rel;
            const length = e.bytes.byteLength;
            rel = this.alignUp(rel + length, payloadAlignment);

            entry.id = e.id;
            entry.name = e.name ?? "";
            entry.type = e.type;
            entry.contentType = e.contentType;
            entry.offset = offset;
            entry.length = length;
            entry.hash = e.hash ?? (await this.computeSha256Hex(e.bytes));
            entry.encoding = e.encoding ?? "raw";
            entry.metadata = e.metadata ?? {};
            return entry;
        }));

        manifest.entries = manifestEntries;

        const manifestJson = JSON.stringify(manifest);
        const manifestBytes = StringUtils.encodeUtf8(manifestJson);

        const manifestOffset = HEADER_SIZE;
        const manifestLength = manifestBytes.byteLength;

        // payloadOffset = alignUp(header+manifest, 8) to keep payload aligned too
        const payloadOffset = this.alignUp(manifestOffset + manifestLength, payloadAlignment);

        const payloadLength = rel;
        const fileLength = payloadOffset + payloadLength;

        const buffer = new ArrayBuffer(fileLength);
        const view = new DataView(buffer);

        // Header
        this.writeAscii4(view, 0, MAGIC);
        view.setUint16(4, 1, true);     // version
        view.setUint16(6, 0, true);     // flags
        this.setU64(view, 8, BigInt(manifestOffset));
        this.setU64(view, 16, BigInt(manifestLength));
        this.setU64(view, 24, BigInt(payloadOffset));
        this.setU64(view, 32, BigInt(payloadLength));
        this.setU64(view, 40, BigInt(fileLength));
        // reserved [48..63] left as 0

        // Manifest
        new Uint8Array(buffer, manifestOffset, manifestLength).set(manifestBytes);

        // Payload
        let cursor = payloadOffset;
        for (let i = 0; i < entries.length; i++) {
            const src = entries[i].bytes;
            new Uint8Array(buffer, cursor, src.byteLength).set(src);
            cursor = this.alignUp(cursor + src.byteLength, payloadAlignment);
        }

        return buffer;
        
    }

    protected alignUp(value: number, alignment: number): number {
        const r = value % alignment;
        return r === 0 ? value : value + (alignment - r);
    }

    protected readAscii4(view: DataView, offset: number): string {
        return String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2),
            view.getUint8(offset + 3),
        );
    }

    protected writeAscii4(view: DataView, offset: number, value: string): void {
        view.setUint8(offset, value.charCodeAt(0));
        view.setUint8(offset + 1, value.charCodeAt(1));
        view.setUint8(offset + 2, value.charCodeAt(2));
        view.setUint8(offset + 3, value.charCodeAt(3));
    }

    protected setU64(view: DataView, offset: number, value: bigint): void {
        view.setBigUint64(offset, value, true);
    }

    protected getU64(view: DataView, offset: number): bigint {
        return view.getBigUint64(offset, true);
    }

    public async computeSha256Hex(bytes: Uint8Array): Promise<string> {
        try {
            if (typeof globalThis.crypto?.subtle?.digest === "function") {
            const digest = await globalThis.crypto.subtle.digest("SHA-256", this.typedArrayToBuffer(bytes));
            const digestBytes = new Uint8Array(digest);
            return Array.from(digestBytes)
                .map((value) => value.toString(16).padStart(2, "0"))
                .join("");
            }
        } catch (error) {
            console.warn("Failed to compute SHA-256 hash", error);
        }

        let hash = 0;
        for (const value of bytes) {
            hash = (hash + value) % 0xffffffff;
        }
        return hash.toString(16).padStart(8, "0");
    };

    private typedArrayToBuffer(array: Uint8Array): ArrayBuffer {
        if (array.buffer instanceof ArrayBuffer) {
            return array.buffer.slice(array.byteOffset, array.byteLength + array.byteOffset);
        } else {
            // Handle SharedArrayBuffer by creating a new ArrayBuffer
            const buffer = new ArrayBuffer(array.byteLength);
            new Uint8Array(buffer).set(array);
            return buffer;
        }
    }
}

@injectable()
export class AssetLoader {
    constructor(
        @inject(ResourceManager) protected resourceManager: ResourceManager,
        @inject(AssetService) protected assetService: AssetService
    ) {}

    public async loadAsset(path: string): Promise<UnpackedAsset> {
        const assetBytes = await this.resourceManager.loadAsset(path);
        return this.assetService.unPackAsset(assetBytes);
    }
}