import { Vector2 } from "../math";
import { Mesh, MeshComponent } from "../rendering";
import { GizmoActor } from "./gizmoActor";
import { RotationGizmoHandle, RotationGizmoMaterial } from "./rotationGizmoMaterial";

class RotationGizmoMesh extends Mesh {
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
		return new RotationGizmoMesh();
	}

	getVertexCount(): number {
		return 0;
	}
}

export class RotationGizmoActor extends GizmoActor {
	private readonly meshComponent: MeshComponent;
	private readonly material: RotationGizmoMaterial;

	constructor() {
		super();
		this.setName("RotationGizmo");
		this.layer = Number.MAX_SAFE_INTEGER;

		this.material = new RotationGizmoMaterial();
		const mesh = new RotationGizmoMesh();
		this.meshComponent = this.addComponent(new MeshComponent(mesh, this.material));
	}

	public getMaterial(): RotationGizmoMaterial {
		return this.material;
	}

	public getMeshComponent(): MeshComponent {
		return this.meshComponent;
	}

	public hitTest(worldPoint: Vector2, cameraZoom: number): RotationGizmoHandle | null {
		const origin = this.getPosition();
		const localX = worldPoint.x - origin.x;
		const localY = worldPoint.y - origin.y;

		return this.material.hitTest(localX, localY, cameraZoom);
	}
}