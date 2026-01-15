export type ResourceKind =
  | ".level"
  | ".mesh"
  | ".texture"
  | ".audio"
  | ".script"
  | ".data";

export interface Resource {
  id: string;
  name: string;
  /** File/category indicator (extension-style) such as .level or .mesh */
  kind: ResourceKind;
  /** Optional canonical location (URL or path) */
  uri?: string;
  /** Optional size in bytes */
  sizeBytes?: number;
  /** Human-friendly description */
  description?: string;
  /** Optional tags for search/filter */
  tags?: string[];
  /** Extra metadata, schema-free */
  metadata?: Record<string, unknown>;
}

export type ResourceNode = {
  name: string;
  path: string; // relative to content root
  kind: "directory" | "file";
  sizeBytes?: number;
  extension?: string;
  children?: ResourceNode[];
};

export type AssetCategory = "directory" | "texture" | "sprite" | "actor" | "audio" | "data" | "container" | "unknown";

export type AssetNode = {
  name: string;
  path: string;
  kind: "directory" | "file" | "entry";
  assetType: AssetCategory;
  manifestType?: string;
  rootEntryId?: string;
  sizeBytes?: number;
  extension?: string;
  children?: AssetNode[];
  contentType?: string;
  metadata?: Record<string, unknown>;
  entryId?: string;
  containerPath?: string;
  /** True when this node represents a .n2asset container file. */
  isContainer?: boolean;
};