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