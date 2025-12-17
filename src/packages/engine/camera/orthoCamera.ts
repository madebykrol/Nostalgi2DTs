import { Vector2, Matrix3, MathUtils } from "../math";
import { Camera } from "./Camera";
import { Frustum } from "./frustum";


export class OrthoCamera extends Camera {
    protected position: Vector2;
    protected zoom: number;
    protected unitsPerScreenHeight: number; // Define how many world units fit in screen height
    private referenceViewportHeight: number | null = null;
    private currentViewportHeight: number | null = null;
    private pixelScale: number = 1;

    private viewMatrix: Matrix3 = new Matrix3();
    private projectionMatrix: Matrix3 = new Matrix3();
    private viewProjectionMatrix: Matrix3 = new Matrix3();
    private needsUpdate: boolean = true;
    private lastAspectRatio: number = 0;
    private frustum: Frustum | undefined;

    constructor(position: Vector2 = new Vector2(0, 0), zoom: number = 1, unitsPerScreenHeight: number = 10) {
        super();
        this.position = position.clone();
        this.zoom = MathUtils.clamp(zoom, 0.5, 10);
        this.unitsPerScreenHeight = unitsPerScreenHeight;
    }

    getPosition(): Vector2 {
        return this.position.clone();
    }

    getZoom(): number {
        return this.zoom;
    }

    setViewportSize(_width: number, height: number): void {
        if (height <= 0) {
            return;
        }

        if (this.referenceViewportHeight === null) {
            this.referenceViewportHeight = height;
        }

        if (this.currentViewportHeight !== height) {
            this.currentViewportHeight = height;
            const reference = this.referenceViewportHeight || height;
            this.pixelScale = reference === 0 ? 1 : height / reference;
            this.needsUpdate = true;
            this.frustum = undefined;
        }
    }

    setPosition(position: Vector2): void {
        if (!this.position.equals(position)) {
            this.position.copy(position);
            this.needsUpdate = true;
            this.frustum = undefined;
        }
    }

    setZoom(zoom: number): void {
        const clampedZoom = MathUtils.clamp(zoom, 0.5, 10);
        if (this.zoom !== clampedZoom) {
            this.zoom = clampedZoom;
            this.needsUpdate = true;
            this.frustum = undefined;
        }
    }

    getViewMatrix(): Matrix3 {
        if (this.needsUpdate) {
            this.updateMatrices(this.lastAspectRatio);
        }
        return this.viewMatrix;
    }

    getProjectionMatrix(aspectRatio: number): Matrix3 {
        if (this.needsUpdate || this.lastAspectRatio !== aspectRatio) {
            this.updateMatrices(aspectRatio);
        }
        return this.projectionMatrix;
    }

    getViewProjectionMatrix(aspectRatio: number): Matrix3 {
        if (this.needsUpdate || this.lastAspectRatio !== aspectRatio) {
            this.updateMatrices(aspectRatio);
        }
        return this.viewProjectionMatrix;
    }

    update(_deltaTime: number): void {
        // This method can be used for camera animations if needed
    }

    public getFrustum(): Frustum {

        if (!this.frustum) {
            const aspectRatio = this.lastAspectRatio;
            const worldHeight = this.getScaledUnitsPerScreenHeight() / this.zoom;
            const worldWidth = worldHeight * aspectRatio;

            const halfWidth = worldWidth / 2;
            const halfHeight = worldHeight / 2;
            this.frustum = new Frustum(
                0,
                1000,
                this.position.x - halfWidth,
                this.position.x + halfWidth,
                this.position.y + halfHeight,
                this.position.y - halfHeight
            );
        } else {
            const aspectRatio = this.lastAspectRatio;
            const worldHeight = this.getScaledUnitsPerScreenHeight() / this.zoom;
            const worldWidth = worldHeight * aspectRatio;
            const halfWidth = worldWidth / 2;
            const halfHeight = worldHeight / 2;
            this.frustum.left = this.position.x - halfWidth;
            this.frustum.right = this.position.x + halfWidth;
            this.frustum.top = this.position.y + halfHeight;
            this.frustum.bottom = this.position.y - halfHeight;
        }


        return this.frustum;
    }


    private updateMatrices(aspectRatio: number): void {
        if (aspectRatio === 0) aspectRatio = 1; // safeguard
        const worldHeight = this.getScaledUnitsPerScreenHeight() / this.zoom;
        const worldWidth = worldHeight * aspectRatio;
        const halfWidth = worldWidth / 2;
        const halfHeight = worldHeight / 2;

        // View: translate by -position
        this.viewMatrix.identity();
        this.viewMatrix.translate(new Vector2(-this.position.x, -this.position.y));

        // Ortho projection (column-major)
        const left = -halfWidth;
        const right = halfWidth;
        const bottom = -halfHeight;
        const top = halfHeight;
        const e = this.projectionMatrix.elements;
        const lr = 1 / (right - left);
        const bt = 1 / (top - bottom);
        e[0] = 2 * lr; e[3] = 0; e[6] = -(right + left) * lr;
        e[1] = 0; e[4] = 2 * bt; e[7] = -(top + bottom) * bt;
        e[2] = 0; e[5] = 0; e[8] = 1;

        // VP = P * V
        this.viewProjectionMatrix = this.projectionMatrix.clone().multiply(this.viewMatrix);
        this.needsUpdate = false;
        this.lastAspectRatio = aspectRatio;
    }

    screenToWorld(screenPos: Vector2, canvasWidth: number, canvasHeight: number): Vector2 {
        const aspectRatio = canvasWidth / canvasHeight;

        // Convert screen coordinates to NDC [-1, 1]
        const ndcX = (screenPos.x / canvasWidth) * 2 - 1;
        const ndcY = 1 - (screenPos.y / canvasHeight) * 2; // Flip Y


        // Calculate world dimensions
        const worldHeight = this.getScaledUnitsPerScreenHeight() / this.zoom;
        const worldWidth = worldHeight * aspectRatio;

        // Convert NDC to world space relative to camera
        const relativeX = ndcX * (worldWidth / 2);
        const relativeY = ndcY * (worldHeight / 2);

        // Add camera position to get absolute world coordinates
        return new Vector2(
            this.position.x + relativeX,
            this.position.y + relativeY
        );
    }

    worldToScreen(worldPos: Vector2, canvasWidth: number, canvasHeight: number): Vector2 {
        const aspectRatio = canvasWidth / canvasHeight;

        // Calculate world dimensions
        const worldHeight = this.getScaledUnitsPerScreenHeight() / this.zoom;
        const worldWidth = worldHeight * aspectRatio;

        // Convert world position to relative position from camera
        const relativeX = worldPos.x - this.position.x;
        const relativeY = worldPos.y - this.position.y;

        // Convert to NDC [-1, 1]
        const ndcX = relativeX / (worldWidth / 2);
        const ndcY = relativeY / (worldHeight / 2);

        // Convert NDC to screen coordinates
        const screenX = ((ndcX + 1) / 2) * canvasWidth;
        const screenY = ((1 - ndcY) / 2) * canvasHeight; // Flip Y

        return new Vector2(screenX, screenY);
    }

    getBounds(canvasWidth: number, canvasHeight: number): { min: Vector2; max: Vector2; } {
        const aspectRatio = canvasWidth / canvasHeight;
        const worldHeight = this.getScaledUnitsPerScreenHeight() / this.zoom;
        const worldWidth = worldHeight * aspectRatio;

        const halfWidth = worldWidth / 2;
        const halfHeight = worldHeight / 2;

        return {
            min: new Vector2(this.position.x - halfWidth, this.position.y - halfHeight),
            max: new Vector2(this.position.x + halfWidth, this.position.y + halfHeight)
        };
    }

    clone(): Camera {
        const cloned = new OrthoCamera(this.position.clone(), this.zoom, this.unitsPerScreenHeight);
        cloned.referenceViewportHeight = this.referenceViewportHeight;
        cloned.currentViewportHeight = this.currentViewportHeight;
        cloned.pixelScale = this.pixelScale;
        return cloned;
    }

    copyFrom(other: Camera): void {
        this.setPosition(other.getPosition());
        this.setZoom(other.getZoom());
        if (other instanceof OrthoCamera) {
            this.unitsPerScreenHeight = other.unitsPerScreenHeight;
            this.referenceViewportHeight = other.referenceViewportHeight;
            this.currentViewportHeight = other.currentViewportHeight;
            this.pixelScale = other.pixelScale;
        }
    }

    lerpTo(target: Camera, t: number): void {
        const targetPos = target.getPosition();
        const targetZoom = target.getZoom();

        this.position.x += (targetPos.x - this.position.x) * t;
        this.position.y += (targetPos.y - this.position.y) * t;
        this.setZoom(this.zoom + (targetZoom - this.zoom) * t);
    }

    equals(other: Camera): boolean {
        return this.position.equals(other.getPosition()) && this.zoom === other.getZoom();
    }

    toString(): string {
        return `OrthoCamera(Position: ${this.position.toString()}, Zoom: ${this.zoom}, UnitsPerScreen: ${this.unitsPerScreenHeight})`;
    }

    private getScaledUnitsPerScreenHeight(): number {
        return this.unitsPerScreenHeight * this.pixelScale;
    }
}
