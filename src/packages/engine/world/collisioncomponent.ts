import { Vector2 } from "../math";
import type { CollisionShapeDescriptor } from "../physics";
import { Actor } from "./actor";
import { Component } from "./component";

export abstract class CollisionComponent extends Component {

    private density: number = 1;
    private friction: number = 0.5;
    private restitution: number = 0.2;
    private sensor: boolean = false;
    private offset: Vector2 = new Vector2(0, 0);
    private dirty: boolean = true;
    private filterBits: number = 0xFFFF;
    private filterMask: number = 0xFFFF;

    abstract getBounds(): { min: { x: number; y: number }; max: { x: number; y: number } };
    abstract createShapeDescriptor(): CollisionShapeDescriptor;

    getFilterBits(): number {
        return this.filterBits;
    }

    getFilterMask(): number {
        return this.filterMask;
    }

    getGroupIndex(): number {
        return 0;
    }

    getDensity(): number {
        return this.density;
    }

    setDensity(value: number): void {
        if (value <= 0 || !Number.isFinite(value)) {
            throw new Error("Density must be a positive finite number");
        }
        if (this.density !== value) {
            this.density = value;
            this.markDirty();
        }
    }

    getFriction(): number {
        return this.friction;
    }

    setFriction(value: number): void {
        if (value < 0 || !Number.isFinite(value)) {
            throw new Error("Friction must be a non-negative finite number");
        }
        if (this.friction !== value) {
            this.friction = value;
            this.markDirty();
        }
    }

    getRestitution(): number {
        return this.restitution;
    }

    setRestitution(value: number): void {
        if (value < 0 || !Number.isFinite(value)) {
            throw new Error("Restitution must be a non-negative finite number");
        }
        if (this.restitution !== value) {
            this.restitution = value;
            this.markDirty();
        }
    }

    isSensor(): boolean {
        return this.sensor;
    }

    setSensor(value: boolean): void {
        if (this.sensor !== value) {
            this.sensor = value;
            this.markDirty();
        }
    }

    getOffset(): Vector2 {
        return this.offset.clone();
    }

    setOffset(offset: Vector2): void {
        if (!this.offset.equals(offset)) {
            this.offset.copy(offset);
            this.markDirty();
        }
    }

    isDirty(): boolean {
        return this.dirty;
    }

    clearDirty(): void {
        this.dirty = false;
    }

    protected markDirty(): void {
        this.dirty = true;
    }

    tick(_deltaTime: number, _engineNetworkMode: "client" | "server" | "singleplayer"): void {
        
    }

    onColliding(_other: CollisionComponent): void {
        
    }

    onCollided(_other: CollisionComponent): void {

    }
}