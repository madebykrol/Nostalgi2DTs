import { Vector2 } from "../math";
import { GizmoActor } from "./gizmoActor";
import { GizmoHandle } from "./gizmoHandle";

export class ScalingGizmoActor extends GizmoActor {
    /**
     *
     */
    constructor() {
        super();
        this.setName("ScalingGizmo");
    }

    public getHandle(_worldPoint: Vector2, _cameraZoom: number): GizmoHandle | null {
        return null;
    }
}
