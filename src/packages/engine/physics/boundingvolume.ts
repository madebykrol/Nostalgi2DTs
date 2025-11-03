import { Vertex2 } from "../math";

export type BoundingVolumeType = "polygon" | "circle";

export abstract class BoundingVolume {
	abstract getType(): BoundingVolumeType;
	// For polygon volumes returns world-space vertices in draw order (closed loop implied)
	// For circles, implementations may return an approximate polyline or leave unimplemented for now.
	abstract getWorldVertices(): Vertex2[];
}