import { Camera } from "../camera";
import { Vector2 } from "../math";
import { Actor } from "../world";
import { MeshComponent } from "./meshComponent";
import { Mesh } from "./mesh";
import { Quad } from "./quad";
import type { Material } from "./material";

function ensurePostProcessMaterial(material: Material): void {
    if (material.getRenderPass() !== "postprocess") {
        throw new Error("PostProcessingVolumeActor requires a material that renders in the post-process pass.");
    }
}

export class PostProcessingVolumeActor extends Actor {
    private extent: Vector2 = new Vector2(20, 20);
    private meshComponent: MeshComponent | null = null;
    private readonly quad: Mesh = new Quad();

    constructor(material?: Material) {
        super();
        if (material) {
            this.setMaterial(material);
        }
        this.shouldTick = false;
    }

    public override initialize(): void {
        const material = this.getMaterial();
        if (!material || this.meshComponent) {
            return;
        }
        this.meshComponent = this.addComponent(new MeshComponent(this.quad, material));
    }

    public setMaterial(material: Material): void {
        ensurePostProcessMaterial(material);
        if (this.meshComponent) {
            this.meshComponent.setMaterial(material);
            return;
        }
        this.meshComponent = this.addComponent(new MeshComponent(this.quad, material));
    }

    public getMaterial(): Material | null {
        return this.meshComponent?.getMaterial() ?? null;
    }

    public setExtent(extent: Vector2): void {
        this.extent = extent.clone();
    }

    public getExtent(): Vector2 {
        return this.extent.clone();
    }

    public containsCamera(camera: Camera): boolean {
        const center = this.getPosition();
        const halfWidth = this.extent.x * 0.5;
        const halfHeight = this.extent.y * 0.5;
        const cameraPos = camera.getPosition();
        return (
            cameraPos.x >= center.x - halfWidth &&
            cameraPos.x <= center.x + halfWidth &&
            cameraPos.y >= center.y - halfHeight &&
            cameraPos.y <= center.y + halfHeight
        );
    }
}
