
import { BoundingVolume, CircleCollisionShapeDescriptor, CollisionShapeDescriptor, PolygonCollisionShapeDescriptor } from "../engine/physics";
import { CollisionComponent } from "../engine/world";
import { Vector2, Vertex2 } from "../engine/math";
import { Vec2, Body, Fixture, Circle, Polygon } from "planck";

export class PlanckBoundingVolume extends BoundingVolume {
    
    private fixture: Fixture;
    private descriptor: CollisionShapeDescriptor;
    private localVertices: Vec2[] = [];
    private localOffset: Vec2 = new Vec2(0, 0);
    private radius: number | null = null;

    constructor(private body: Body, component: CollisionComponent) {
        super();
        this.descriptor = component.createShapeDescriptor();

        const shapeInfo = this.createShape(this.descriptor);
        this.localVertices = shapeInfo.localVertices;
        this.localOffset = shapeInfo.localOffset;
        this.radius = shapeInfo.radius;

        this.fixture = this.body.createFixture({
            shape: shapeInfo.shape,
            density: this.descriptor.density,
            friction: this.descriptor.friction,
            restitution: this.descriptor.restitution,
            isSensor: this.descriptor.isSensor,
            userData: component
        });

        this.fixture.setFilterGroupIndex(component.getGroupIndex());
        this.fixture.setFilterCategoryBits(component.getFilterBits());
        this.fixture.setFilterMaskBits(component.getFilterMask());

        component.clearDirty();
    }

    getType() {
        return this.descriptor.type;
    }

    getWorldVertices(): Vertex2[] {
        if (this.descriptor.type === "circle") {
            return this.sampleCircleVertices();
        }

        return this.localVertices.map((vertex) => {
            const worldPoint = this.body.getWorldPoint(vertex);
            return new Vector2(worldPoint.x, worldPoint.y);
        });
    }

    private createShape(descriptor: CollisionShapeDescriptor): {
        shape: Circle | Polygon;
        localVertices: Vec2[];
        localOffset: Vec2;
        radius: number | null;
    } {
        if (descriptor.type === "circle") {
            return this.createCircleShape(descriptor);
        }

        return this.createPolygonShape(descriptor);
    }

    private createCircleShape(descriptor: CircleCollisionShapeDescriptor) {
        const offset = new Vec2(descriptor.offset.x, descriptor.offset.y);
        const circle = new Circle(offset, descriptor.radius);
        return {
            shape: circle,
            localVertices: [],
            localOffset: offset,
            radius: descriptor.radius
        };
    }

    private createPolygonShape(descriptor: PolygonCollisionShapeDescriptor) {
        const localVertices = descriptor.vertices.map((vertex) =>
            new Vec2(vertex.x + descriptor.offset.x, vertex.y + descriptor.offset.y)
        );
        const polygon = new Polygon(localVertices);
        return {
            shape: polygon,
            localVertices,
            localOffset: new Vec2(descriptor.offset.x, descriptor.offset.y),
            radius: null
        };
    }

    private sampleCircleVertices(): Vector2[] {
        if (this.radius === null) {
            return [];
        }

        const segments = 16;
        const vertices: Vector2[] = [];
        const center = this.body.getWorldPoint(this.localOffset);
        const angleStep = (Math.PI * 2) / segments;
        for (let i = 0; i < segments; i++) {
            const angle = angleStep * i;
            const x = center.x + Math.cos(angle) * this.radius;
            const y = center.y + Math.sin(angle) * this.radius;
            vertices.push(new Vector2(x, y));
        }
        return vertices;
    }
}
