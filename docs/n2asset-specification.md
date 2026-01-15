# Specification of fileformat .n2asset.

n2assets contains the following segments
1. Header (64-bytes)
2. Manifest (Utf-8 JSON)
3. Payload (compiled assets, raw bytes)

All bytes are in little-endian

## Header
| Offet |  Size | Type | Description |
| --- | --- | --- | --- |
| 0 | 4 | char[4] | Magic: "n2as" |
| 4 | 2 | u16 | Version = 1| 
| 6 | 2 | u16 | Used for flagging the asset for handelling different encodings / encryption etc |
| 8 | 8 | u64 | Manifest Offset. Used to know where to begin to read manifest | 
| 16 | 8 | u64 | Manifest Length. Used to know where to stop reading the manifest. |
| 24 | 8 | u64 | Payload Offset. Used to know where to begin to read the blobs | 
| 32 | 8 | u64 | Payload Length. Used to know where to stop reading the manifest. |
| 40 | 8 | u64 | File Length. |
| 58 | 16 | bytes | Reserved | 

### Flags
current version of n2asset supports flag 0. which defines parsing of the manifest as
Unencrypted
UTF-8 
JSON

## Manifest
The manifest describes the asset and it's payload and where all of the payloads are located within the blob

Payload is a utf-8 encoded json (denoted by flag 0)

```json
{
    "format": "n2as",
    "rootEntryId": "1", // used to reference the entry that defines the asset
    "version": 1,
    "createdAt": "2026-01-01T09:00:00Z",
    "createdBy": "User1",
    "updatedAt": "2026-01-02T10:00:00Z",
    "updatedBy": "User2",
    "entries": [
        {
            "id": "1",
            "name": "Player texture",
            "type": "texture", // Used to filter and categorize entries 
            "contentType": "image/png",
            "offset": 0, // Relative to Payload Offset in header.
            "length": 12345,
            "hash": "...hex...", // used for verification, caching, deduping and referencing,
            "metadata": {

            }, // Used as system data. For example when designing a sprite, or audio. Meta data could be used to store the blueprint. See the  sprite-editor
            "encoding": "raw" | "gzip" | "br"
        }
    ]
}
```



## Payload

# Engine assets definitions

## Levels

### Entries
Single entry in.
Contains a json blob with level data.
Entry has type: level


## Textures
Multiple entries

## Tilemaps

## 
