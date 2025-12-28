import type { ComponentAsset, MeshComponentAssetPayload } from "@repo/engine";

export type MeshMetadataVertex = { x: number; y: number };

export type MeshMetadata = {
  vertices: MeshMetadataVertex[];
};

export const DEFAULT_MESH_VERTICES: MeshMetadataVertex[] = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: 0.5 },
  { x: -0.5, y: 0.5 },
];

export const cloneMeshVertices = (vertices: MeshMetadataVertex[]): MeshMetadataVertex[] =>
  vertices.map((v) => ({ x: v.x, y: v.y }));

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const normalizeMeshMetadataPayload = (metadata: unknown): MeshMetadata => {
  if (!metadata || typeof metadata !== "object") {
    return { vertices: cloneMeshVertices(DEFAULT_MESH_VERTICES) };
  }

  const obj = metadata as Record<string, unknown>;
  if (!Array.isArray(obj.vertices)) {
    return { vertices: cloneMeshVertices(DEFAULT_MESH_VERTICES) };
  }

  const vertices: MeshMetadataVertex[] = [];
  for (const entry of obj.vertices) {
    if (!entry || typeof entry !== "object") continue;
    const vObj = entry as Record<string, unknown>;
    const x = vObj.x;
    const y = vObj.y;
    if (isFiniteNumber(x) && isFiniteNumber(y)) {
      vertices.push({ x, y });
    }
  }

  if (vertices.length < 3) {
    return { vertices: cloneMeshVertices(DEFAULT_MESH_VERTICES) };
  }

  return { vertices };
};

export const cloneComponentAsset = (asset: ComponentAsset): ComponentAsset => ({
  ...asset,
  payload: asset.payload ? structuredClone(asset.payload) : undefined,
});

export const hashStringToColor = (value: string): [number, number, number, number] => {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  const hue = Math.abs(h % 360);
  return [hue / 360, 0.7, 0.8, 1.0];
};
