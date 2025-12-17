import { Vector2 } from "../math";
import { Mesh, MeshComponent} from "../rendering";
import { Actor } from "../world";
import { GizmoActor } from "./gizmoActor";
import { GizmoHandle } from "./gizmoHandle";
import { TranslationGizmoMaterial } from "./TranslationGizmoMaterial";


class TranslationGizmoMesh extends Mesh {
    constructor() {
        super();
        this.vertices = new Float32Array(0);
        this.indices = new Uint16Array(0);
        this.uvs = new Float32Array(0);
    }

    rotate(_angle: number): void {}
    scale(_sx: number, _sy: number): void {}
    translate(_tx: number, _ty: number): void {}

    clone(): Mesh {
        return new TranslationGizmoMesh();
    }

    getVertexCount(): number {
        return 0;
    }
}

export abstract class TranslationHandle extends GizmoHandle {

    protected translateActors(offset: Vector2): void {
        const targetActors = Array.from(this.gizmo.getTargetActors());
        for (const actor of targetActors) {
            
            const startWorld = actor.getPosition();
            const newWorld = new Vector2(startWorld.x + offset.x, startWorld.y + offset.y);

            let newLocalPosition = newWorld;

            const parent = actor.getParent(); // Why the fuck is it translating the parent.. Copilot you silly-goose

            
            if (parent instanceof Actor) {
                const parentWorld = parent.getPosition();
                newLocalPosition = new Vector2(newWorld.x - parentWorld.x, newWorld.y - parentWorld.y);
            }
            actor.setPosition(newLocalPosition);
        }
    }
}

export class TranslationXHandle extends TranslationHandle {
    readonly cursor = "ew-resize";
    constructor(gizmo: GizmoActor) {
        super(gizmo);
    }

    handleDrag(position: Vector2, delta: Vector2): void {
        // Handle X axis translation manipulation logic here

        const offset = new Vector2(delta.x, 0);
        this.translateActors(offset);
    }
}

export class TranslationYHandle extends TranslationHandle {
    readonly cursor = "ns-resize";
    constructor(gizmo: GizmoActor) {
        super(gizmo);
    }

    handleDrag(position: Vector2, delta: Vector2): void {
        
        const offset = new Vector2(0, delta.y);
        this.translateActors(offset);
    }

}

class TranslationPivotHandle extends TranslationHandle {
    readonly cursor = "move";
    
    constructor(gizmo: GizmoActor) {
        super(gizmo);
    }

    handleDrag(position: Vector2, delta: Vector2): void {
        const offset = new Vector2(delta.x, delta.y);
        this.translateActors(offset);
    }


}

export class TranslationGizmoActor extends GizmoActor {
    private readonly meshComponent: MeshComponent;
    private readonly material: TranslationGizmoMaterial;

    private readonly AXIS_CLICK_THICKNESS_MULTIPLIER = 1.4;
    private readonly PIVOT_CLICK_EXPANSION = 1.15;

    private pivotHandle: TranslationPivotHandle = new TranslationPivotHandle(this); 
    private xHandle: TranslationXHandle = new TranslationXHandle(this);
    private yHandle: TranslationYHandle = new TranslationYHandle(this);

    constructor() {
        super();
        this.setName("TranslationGizmo");
        this.layer = Number.MAX_SAFE_INTEGER;

        this.material = new TranslationGizmoMaterial();
        const mesh = new TranslationGizmoMesh();
        this.meshComponent = this.addComponent(new MeshComponent(mesh, this.material));
    }

    public getMaterial(): TranslationGizmoMaterial {
        return this.material;
    }

    public getMeshComponent(): MeshComponent {
        return this.meshComponent;
    }

    public getHandle(worldPoint: Vector2, cameraZoom: number): GizmoHandle | null {
        const { axisLength, arrowWidth, pivotHalfSize } = this.material.computeTranslationGizmoDimensions(cameraZoom);
        const gizmoOrigin = this.getPosition();
        const localX = worldPoint.x - gizmoOrigin.x;
        const localY = worldPoint.y - gizmoOrigin.y;

        const pivotExtent = pivotHalfSize * this.PIVOT_CLICK_EXPANSION;
        if (Math.abs(localX) <= pivotExtent && Math.abs(localY) <= pivotExtent) {
            return this.pivotHandle;
        }
        
        const axisThickness = Math.max(arrowWidth * this.AXIS_CLICK_THICKNESS_MULTIPLIER, 0.05);
        const minDistanceFromOrigin = Math.max(pivotHalfSize * 1.25, 0.02);

        if (localX >= minDistanceFromOrigin && localX <= axisLength && Math.abs(localY) <= axisThickness) {
            return this.xHandle;
        }

        if (localY >= minDistanceFromOrigin && localY <= axisLength && Math.abs(localX) <= axisThickness) {
            return this.yHandle;
        }

        return null;
    }

}

