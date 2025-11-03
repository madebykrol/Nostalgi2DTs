import {
    Vector2,
    CollisionComponent,
    WorldSettings,
    PhysicsComponent
} from "@repo/engine";
import { World as PWorld, Vec2, Fixture, AABB } from "planck";
import { Actor, World } from "@repo/engine";
import { PhysicsBody } from "@repo/engine";
import { Frustum } from "../engine/camera/frustum";
import { PlanckPhysicsBody } from "./planckPhysicsBody";

export class PlanckWorld extends World {
   
    aabbCast<T extends Actor>(point: Vector2, includeStatic: boolean, includeDynamic: boolean, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): Actor[] {
        const hits = new Map<T, number>();

        const epsilon = 1e-5;
        const lower = new Vec2(point.x - epsilon, point.y - epsilon);
        const upper = new Vec2(point.x + epsilon, point.y + epsilon);

        const queryAabb = new AABB(lower, upper);

        this.world.queryAABB(queryAabb, (fixture: Fixture) => {
            if (!fixture.testPoint(point)) {
                return true;
            }

            this.handleRayHit(fixture, new Vec2(point.x, point.y), new Vec2(0, 0), 0, includeStatic, includeDynamic, ctor, hits);
            return true;
        });

        return Array.from(hits.entries())
            .sort((a, b) => a[1] - b[1])
            .map(([actor]) => actor);
    }
    
    rayCast<T extends Actor>(
        start: Vector2,
        end: Vector2,
        includeStatic: boolean,
        includeDynamic: boolean,
        ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)
    ): T[] {
        const hits = new Map<T, number>();
        const startVec = new Vec2(start.x, start.y);
        const endVec = new Vec2(end.x, end.y);

        this.world.rayCast(startVec, endVec, (fixture: Fixture, _point: Vec2, _normal: Vec2, fraction: number) => this.handleRayHit(
            fixture,
            _point,
            _normal,
            fraction,
            includeStatic,
            includeDynamic,
            ctor,
            hits
        ));

        return Array.from(hits.entries())
            .sort((a, b) => a[1] - b[1])
            .map(([actor]) => actor);
    }

    private handleRayHit<T extends Actor>(
        fixture: Fixture,
        _point: Vec2,
        _normal: Vec2,
        fraction: number,
        includeStatic: boolean,
        includeDynamic: boolean,
        ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T),
        hits: Map<T, number>
    ): number {
        const body = fixture.getBody();
        const userData = body.getUserData() as { actor?: Actor } | undefined;
        const actor = userData?.actor;
        if (!actor) {
            return 1;
        }
        const bodyType = body.getType();
        if ((bodyType === "static" && !includeStatic) || ((bodyType === "dynamic" || bodyType === "kinematic") && !includeDynamic)) {
            return 1;
        }
        if (actor instanceof (ctor as any)) {
            const typedActor = actor as T;
            const existingFraction = hits.get(typedActor);
            if (existingFraction === undefined || fraction < existingFraction) {
                hits.set(typedActor, fraction);
            }
        }
        return 1;
    }

    radialCast<T extends Actor>(start: Vector2, radius: number, includeStatic: boolean, includeDynamic: boolean, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): Actor[] {
        // Cast a ray in multiple directions to simulate a radial cast
        const hits = new Map<T, number>();
        const segments = 16;
        const angleStep = (Math.PI * 2) / segments;
        const startVec = new Vec2(start.x, start.y);

        for (let i = 0; i < segments; i++) {
            const angle = angleStep * i;
            const endX = start.x + Math.cos(angle) * radius;
            const endY = start.y + Math.sin(angle) * radius;
            const endVec = new Vec2(endX, endY);

            this.world.rayCast(startVec, endVec, (fixture: Fixture, _point: Vec2, _normal: Vec2, fraction: number) => 
               this.handleRayHit(fixture, _point, _normal, fraction, includeStatic, includeDynamic, ctor, hits)
            );
        }

        return Array.from(hits.entries())
            .sort((a, b) => a[1] - b[1])
            .map(([actor]) => actor);
    }
  

    checkWorldBounds(actor: Actor, frustum: Frustum): boolean {
        const collisionComponents = actor.getComponentsOfType(CollisionComponent);
        if (collisionComponents.length === 0) return true;

        const position = actor.getPosition();
        for (const component of collisionComponents) {
            const localBounds = component.getBounds();
            const worldMinX = localBounds.min.x + position.x;
            const worldMinY = localBounds.min.y + position.y;
            const worldMaxX = localBounds.max.x + position.x;
            const worldMaxY = localBounds.max.y + position.y;

            if (this.boundsOverlapFrustum(worldMinX, worldMinY, worldMaxX, worldMaxY, frustum)) {
                return true;
            }
        }

        return false;
    }

    private boundsOverlapFrustum(minX: number, minY: number, maxX: number, maxY: number, frustum: Frustum): boolean {
        return !(maxX < frustum.left || minX > frustum.right || maxY < frustum.bottom || minY > frustum.top);
    }

    // Implement the abstract method from base World by delegating to the existing checkWorldBounds.
    checkWithinBounds(actor: Actor, bounds: Frustum): boolean {
        return this.checkWorldBounds(actor, bounds);
    }

    createPhysicsBody(actor: Actor, physics: PhysicsComponent): PhysicsBody {
        const body = new PlanckPhysicsBody(this, actor, physics, this.world);

        for (const component of actor.getComponentsOfType(CollisionComponent)) {
            body.createBoundingVolume(component);
        }

        return body;
    }

    getGravity(): Vector2 | undefined {
        const g = this.world.getGravity();
        return new Vector2(g.x, g.y);
    }
    
    setGravity(gravity: Vector2): void {
        this.world.setGravity(new Vec2(gravity.x, gravity.y));
    }

    _tick(timestep: number): void {
        this.world.step(timestep);

        let body = this.world.getBodyList();
        while (body) {
            const actor: Actor = (body.getUserData() as any).actor;
            if (actor) {
                const pos = body.getPosition();
                actor.setTransformFromPhysics(new Vector2(pos.x, pos.y), body.getAngle());
            }

            body = body.getNext();
        }
    }

    private world: PWorld;

    constructor(settings: WorldSettings|undefined) {
        super(settings);

        this.world = new PWorld({
            gravity: settings?.gravity ? new Vec2(settings.gravity.x, settings.gravity.y) : new Vec2(0, 0),
            allowSleep: settings?.allowSleep ?? true
        });
    }
}