import { Vector2 } from "../math";

export type CollisionShapeKind = "circle" | "polygon";

interface CollisionShapeDescriptorBase {
    type: CollisionShapeKind;
    density: number;
    friction: number;
    restitution: number;
    isSensor: boolean;
    offset: Vector2;
}

export interface CircleCollisionShapeDescriptor extends CollisionShapeDescriptorBase {
    type: "circle";
    radius: number;
}

export interface PolygonCollisionShapeDescriptor extends CollisionShapeDescriptorBase {
    type: "polygon";
    vertices: Vector2[];
}

export type CollisionShapeDescriptor = CircleCollisionShapeDescriptor | PolygonCollisionShapeDescriptor;
