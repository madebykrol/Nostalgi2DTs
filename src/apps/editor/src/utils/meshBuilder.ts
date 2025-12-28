import { Mesh } from "@repo/engine";
import type { MeshMetadata, MeshMetadataVertex } from "./assetHelpers";
import { DEFAULT_MESH_VERTICES, normalizeMeshMetadataPayload } from "./assetHelpers";

export const computePolygonIndices = (vertexCount: number): Uint16Array => {
  if (vertexCount < 3) {
    return new Uint16Array(0);
  }
  const triangleCount = vertexCount - 2;
  const indices = new Uint16Array(triangleCount * 3);
  for (let i = 0; i < triangleCount; i++) {
    indices[i * 3 + 0] = 0;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = i + 2;
  }
  return indices;
};

export const computePolygonUvs = (vertices: MeshMetadataVertex[]): Float32Array => {
  const count = vertices.length;
  const uvs = new Float32Array(count * 2);
  if (count === 0) {
    return uvs;
  }

  let minX = vertices[0].x;
  let maxX = vertices[0].x;
  let minY = vertices[0].y;
  let maxY = vertices[0].y;

  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  for (let i = 0; i < count; i++) {
    const v = vertices[i];
    uvs[i * 2 + 0] = (v.x - minX) / rangeX;
    uvs[i * 2 + 1] = (v.y - minY) / rangeY;
  }

  return uvs;
};

export class EditorPolygonMesh extends Mesh {
  constructor(vertices: MeshMetadataVertex[]) {
    super();
    const count = vertices.length;
    const positions = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      positions[i * 2 + 0] = vertices[i].x;
      positions[i * 2 + 1] = vertices[i].y;
    }

    const indices = computePolygonIndices(count);
    const uvs = computePolygonUvs(vertices);

    this.vertices = positions;
    this.indices = indices;
    this.uvs = uvs;
  }

  rotate(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let index = 0; index < this.vertices.length; index += 2) {
      const x = this.vertices[index];
      const y = this.vertices[index + 1];
      this.vertices[index] = x * cos - y * sin;
      this.vertices[index + 1] = x * sin + y * cos;
    }
  }

  scale(sx: number, sy: number): void {
    for (let index = 0; index < this.vertices.length; index += 2) {
      this.vertices[index] *= sx;
      this.vertices[index + 1] *= sy;
    }
  }

  translate(tx: number, ty: number): void {
    for (let index = 0; index < this.vertices.length; index += 2) {
      this.vertices[index] += tx;
      this.vertices[index + 1] += ty;
    }
  }

  clone(): Mesh {
    const vertices: MeshMetadataVertex[] = [];
    for (let i = 0; i < this.vertices.length; i += 2) {
      vertices.push({ x: this.vertices[i], y: this.vertices[i + 1] });
    }
    return new EditorPolygonMesh(vertices);
  }

  getVertexCount(): number {
    return this.vertices.length / 2;
  }
}

export const buildMeshFromMetadata = (metadata: unknown): { mesh: Mesh; metadata: MeshMetadata } => {
  const normalized = normalizeMeshMetadataPayload(metadata);

  if (normalized.vertices.length === 4) {
    const [v0, v1, v2, v3] = normalized.vertices;
    const isAxisAligned =
      v0.x === v3.x &&
      v1.x === v2.x &&
      v0.y === v1.y &&
      v2.y === v3.y &&
      Math.abs(v1.x - v0.x) > 1e-6 &&
      Math.abs(v2.y - v0.y) > 1e-6;

    if (isAxisAligned) {
      const w = Math.abs(v1.x - v0.x);
      const h = Math.abs(v2.y - v0.y);
      const cx = (v0.x + v1.x) * 0.5;
      const cy = (v0.y + v2.y) * 0.5;
      
      // Create as polygon mesh for now
      const mesh = new EditorPolygonMesh(normalized.vertices);
      return { mesh, metadata: normalized };
    }
  }

  const mesh = new EditorPolygonMesh(normalized.vertices);
  return { mesh, metadata: normalized };
};
