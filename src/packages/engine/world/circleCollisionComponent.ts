import { Vector2, Vertex2 } from "../math";
import type {
    CircleCollisionShapeDescriptor,
    PolygonCollisionShapeDescriptor
} from "../physics";
import { property } from "../utils";
import { CollisionComponent } from "./collisioncomponent";

export class CircleCollisionComponent extends CollisionComponent {
    private radius: number;

    constructor(radius: number) {
        super();
        this.assertRadius(radius);
        this.radius = radius;
    }

    getRadius(): number {
        return this.radius;
    }

    setRadius(value: number): void {
        this.assertRadius(value);
        if (this.radius !== value) {
            this.radius = value;
            this.markDirty();
        }
    }

    getBounds(): { min: { x: number; y: number }; max: { x: number; y: number } } {
        const center = this.getOffset();
        return {
            min: { x: center.x - this.radius, y: center.y - this.radius },
            max: { x: center.x + this.radius, y: center.y + this.radius }
        };
    }

    createShapeDescriptor(): CircleCollisionShapeDescriptor {
        return {
            type: "circle",
            radius: this.radius,
            density: this.getDensity(),
            friction: this.getFriction(),
            restitution: this.getRestitution(),
            isSensor: this.isSensor(),
            offset: this.getOffset()
        };
    }

    private assertRadius(value: number): void {
        if (value <= 0 || !Number.isFinite(value)) {
            throw new Error("Circle radius must be a positive finite number");
        }
    }
}

export class PolygonCollisionComponent extends CollisionComponent {
    private _points: Vertex2[] = [];

    constructor() {
        super();
    }

    get points(): Vertex2[] {
        return this._points;
    }

    @property()
    set points(points: Vertex2[]) {
        if (!Array.isArray(points)) {
            return;
        }

        if (points.length < 3) {
            // Ignore invalid data instead of throwing during deserialization; caller can validate separately.
            return;
        }

        // Normalize incoming data to Vertex2 instances (can be plain {x,y} or Vector2)
        const next = points.map((p: any) => (p instanceof Vertex2 ? p : new Vertex2(p.x, p.y)));

        if (this._points.length === next.length && this._points.every((p, i) => p.equals(next[i]))) {
            return;
        }

        this._points = next;
        this.markDirty();
    }

    getBounds(): { min: { x: number; y: number }; max: { x: number; y: number } } {
        const offset = this.getOffset();
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (const point of this.points) {
            const px = point.x + offset.x;
            const py = point.y + offset.y;
            if (px < minX) minX = px;
            if (py < minY) minY = py;
            if (px > maxX) maxX = px;
            if (py > maxY) maxY = py;
        }

        return {
            min: { x: minX, y: minY },
            max: { x: maxX, y: maxY }
        };
    }

    createShapeDescriptor(): PolygonCollisionShapeDescriptor {
        return {
            type: "polygon",
            vertices: this.points,
            density: this.getDensity(),
            friction: this.getFriction(),
            restitution: this.getRestitution(),
            isSensor: this.isSensor(),
            offset: this.getOffset()
        };
    }
}

export class BoxCollisionComponent extends CollisionComponent {
    private width: number;
    private height: number;

    constructor(width: number, height: number) {
        super();
        this.assertDimension(width);
        this.assertDimension(height);
        this.width = width;
        this.height = height;
    }

    getWidth(): number {
        return this.width;
    }

    setWidth(width: number): void {
        this.assertDimension(width);
        if (this.width !== width) {
            this.width = width;
            this.markDirty();
        }
    }

    getHeight(): number {
        return this.height;
    }

    setHeight(height: number): void {
        this.assertDimension(height);
        if (this.height !== height) {
            this.height = height;
            this.markDirty();
        }
    }

    getBounds(): { min: { x: number; y: number }; max: { x: number; y: number } } {
        const offset = this.getOffset();
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        return {
            min: { x: offset.x - halfW, y: offset.y - halfH },
            max: { x: offset.x + halfW, y: offset.y + halfH }
        };
    }

    createShapeDescriptor(): PolygonCollisionShapeDescriptor {
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        const vertices = [
            new Vector2(-halfW, -halfH),
            new Vector2(halfW, -halfH),
            new Vector2(halfW, halfH),
            new Vector2(-halfW, halfH)
        ];

        return {
            type: "polygon",
            vertices,
            density: this.getDensity(),
            friction: this.getFriction(),
            restitution: this.getRestitution(),
            isSensor: this.isSensor(),
            offset: this.getOffset()
        };
    }

    private assertDimension(value: number): void {
        if (value <= 0 || !Number.isFinite(value)) {
            throw new Error("Box dimensions must be positive finite numbers");
        }
    }
}