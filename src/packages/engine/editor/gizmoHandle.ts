import { Vector2 } from "../math";
import { GizmoActor } from "./gizmoActor";

export abstract class GizmoHandle {
    constructor(public gizmo: GizmoActor) {}

    beginDrag(_cursor: Vector2): void {}

    abstract handleDrag(cursor: Vector2, delta: Vector2): void;

    endDrag(_cursor: Vector2): void {}

    abstract readonly cursor: string;
}