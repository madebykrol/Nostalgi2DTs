import { Matrix3, Vector2 } from "../math";
import { Frustum } from "./frustum";

export abstract class Camera {
    abstract getPosition(): Vector2;
    abstract getZoom(): number;
    abstract setPosition(position: Vector2): void;
    abstract setZoom(zoom: number): void;
    abstract getViewMatrix(): Matrix3;
    abstract getProjectionMatrix(aspectRatio: number): Matrix3;
    abstract getViewProjectionMatrix(aspectRatio: number): Matrix3;
    abstract update(deltaTime: number): void;
    abstract screenToWorld(screenPos: Vector2, canvasWidth: number, canvasHeight: number): Vector2;
    abstract worldToScreen(worldPos: Vector2, canvasWidth: number, canvasHeight: number): Vector2;
    abstract getBounds(canvasWidth: number, canvasHeight: number): { min: Vector2, max: Vector2 };
    abstract getFrustum(): Frustum;
    abstract clone(): Camera;
    abstract copyFrom(other: Camera): void;
    abstract lerpTo(target: Camera, t: number): void;
    abstract equals(other: Camera): boolean;
    abstract toString(): string;
}