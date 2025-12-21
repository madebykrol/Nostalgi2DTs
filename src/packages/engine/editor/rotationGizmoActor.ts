import { Vector2 } from "../math";
import { Mesh, MeshComponent } from "../rendering";
import { GizmoActor } from "./gizmoActor";
import { GizmoHandle } from "./gizmoHandle";
import { RotationGizmoHandle, RotationGizmoMaterial } from "./rotationGizmoMaterial";
import { Actor } from "../world";

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

abstract class BaseRotationHandle extends GizmoHandle {
	private readonly direction: 1 | -1;
	private lastAngle = 0;
	private accumulated = 0;
	private readonly startRotations = new Map<Actor, number>();

	protected constructor(gizmo: GizmoActor, direction: 1 | -1) {
		super(gizmo);
		this.direction = direction;
	}

	override beginDrag(cursor: Vector2): void {
		this.cacheStartRotations();
		const angle = this.computeAngle(cursor);
		this.lastAngle = angle ?? 0;
		this.accumulated = 0;
	}

	override handleDrag(cursor: Vector2, _delta: Vector2): void {
		const angle = this.computeAngle(cursor);
		if (angle === null) {
			return;
		}

		const delta = this.normalizeAngle(angle - this.lastAngle);
		if (delta === 0) {
			return;
		}

		this.accumulated += delta * this.direction;
		this.lastAngle = angle;

		for (const actor of this.gizmo.getTargetActors()) {
			const startRotation = this.startRotations.get(actor) ?? actor.getRotation();
			actor.setRotation(startRotation + this.accumulated);
		}
	}

	override endDrag(): void {
		this.startRotations.clear();
	}

	protected computeAngle(cursor: Vector2): number | null {
		const pivot = this.gizmo.getPosition();
		const offset = cursor.subtract(pivot);
		const magnitudeSq = offset.x * offset.x + offset.y * offset.y;
		if (magnitudeSq < 1e-6) {
			return null;
		}
		return Math.atan2(offset.y, offset.x);
	}

	protected normalizeAngle(angle: number): number {
		const twoPi = Math.PI * 2;
		let value = angle % twoPi;
		if (value > Math.PI) {
			value -= twoPi;
		} else if (value <= -Math.PI) {
			value += twoPi;
		}
		return value;
	}

	private cacheStartRotations(): void {
		this.startRotations.clear();
		for (const actor of this.gizmo.getTargetActors()) {
			this.startRotations.set(actor, actor.getRotation());
		}
	}
}

class ClockwiseRotationHandle extends BaseRotationHandle {
	override readonly cursor = "grab";

	constructor(gizmo: GizmoActor) {
		super(gizmo, -1);
	}
}

class CounterClockwiseRotationHandle extends BaseRotationHandle {
	override readonly cursor = "grab";

	constructor(gizmo: GizmoActor) {
		super(gizmo, 1);
	}
}

export class RotationGizmoActor extends GizmoActor {
	private readonly meshComponent: MeshComponent;
	private readonly material: RotationGizmoMaterial;
	private readonly clockwiseHandle: ClockwiseRotationHandle;
	private readonly counterClockwiseHandle: CounterClockwiseRotationHandle;

	constructor() {
		super();
		this.setName("RotationGizmo");
		this.layer = Number.MAX_SAFE_INTEGER;

		this.material = new RotationGizmoMaterial();
		const mesh = new RotationGizmoMesh();
		this.meshComponent = this.addComponent(new MeshComponent(mesh, this.material));
		this.clockwiseHandle = new ClockwiseRotationHandle(this);
		this.counterClockwiseHandle = new CounterClockwiseRotationHandle(this);
	}

	public getMaterial(): RotationGizmoMaterial {
		return this.material;
	}

	public getMeshComponent(): MeshComponent {
		return this.meshComponent;
	}

	public getHandle(worldPoint: Vector2, cameraZoom: number): GizmoHandle | null {
		const handle = this.detectHandle(worldPoint, cameraZoom);
		if (handle === "cw") {
			return this.clockwiseHandle;
		}
		if (handle === "ccw") {
			return this.counterClockwiseHandle;
		}
		return null;
	}

	private detectHandle(worldPoint: Vector2, cameraZoom: number): RotationGizmoHandle | null {
		const origin = this.getPosition();
		const localX = worldPoint.x - origin.x;
		const localY = worldPoint.y - origin.y;
		return this.material.hitTest(localX, localY, cameraZoom);
	}
}