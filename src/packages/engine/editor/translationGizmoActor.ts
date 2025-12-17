import { Vector2 } from "../math";
import { Mesh, MeshComponent} from "../rendering";
import { GizmoActor } from "./gizmoActor";
import { TranslationGizmoHandle, TranslationGizmoMaterial } from "./TranslationGizmoMaterial";


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

export class TranslationGizmoActor extends GizmoActor {
    private readonly meshComponent: MeshComponent;
    private readonly material: TranslationGizmoMaterial;

    private readonly AXIS_CLICK_THICKNESS_MULTIPLIER = 1.4;
    private readonly PIVOT_CLICK_EXPANSION = 1.15;

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

    public hitTest(worldPoint: Vector2, cameraZoom: number): TranslationGizmoHandle | null {
        const { axisLength, arrowWidth, pivotHalfSize } = this.material.computeTranslationGizmoDimensions(cameraZoom);
        const gizmoOrigin = this.getPosition();
        const localX = worldPoint.x - gizmoOrigin.x;
        const localY = worldPoint.y - gizmoOrigin.y;

        const pivotExtent = pivotHalfSize * this.PIVOT_CLICK_EXPANSION;
        if (Math.abs(localX) <= pivotExtent && Math.abs(localY) <= pivotExtent) {
            return "pivot";
        }
        
        const axisThickness = Math.max(arrowWidth * this.AXIS_CLICK_THICKNESS_MULTIPLIER, 0.05);
        const minDistanceFromOrigin = Math.max(pivotHalfSize * 1.25, 0.02);

        if (localX >= minDistanceFromOrigin && localX <= axisLength && Math.abs(localY) <= axisThickness) {
            return "x";
        }

        if (localY >= minDistanceFromOrigin && localY <= axisLength && Math.abs(localX) <= axisThickness) {
            return "y";
        }

        return null;
    }

    
}

