import {
    Vector2,
    CollisionComponent,
    WorldSettings,
    PhysicsComponent,
    Container
} from "@repo/engine";
import { World as PWorld, Vec2, Fixture, AABB } from "planck";
import { Actor, World } from "@repo/engine";
import { PhysicsBody } from "@repo/engine";
import { PlanckPhysicsBody } from "./planckPhysicsBody";

export class PlanckWorld extends World {
    
    private world: PWorld;

    constructor(settings?: WorldSettings|undefined, container?: Container) {
        super(settings, container!);

        this.world = new PWorld({
            gravity: settings?.gravity ? new Vec2(settings.gravity.x, settings.gravity.y) : new Vec2(0, 0),
            allowSleep: settings?.allowSleep ?? true
        });

        this.world.on('begin-contact', (contact) => {
            const fixtureA: Fixture = contact.getFixtureA();
            const fixtureB: Fixture = contact.getFixtureB();    
            const userDataA = fixtureA.getUserData() as CollisionComponent;
            const userDataB = fixtureB.getUserData() as CollisionComponent;

            userDataA?.triggerCollisionCallbacks(userDataB!.getActor()!, userDataA);
            userDataB?.triggerCollisionCallbacks(userDataA!.getActor()!, userDataB);

            this.collisionCallbacks.get("begin")?.forEach(callback => {
                callback(userDataA!, userDataB!);
            });
        });
    }

    public resetForces(): void {
        let body = this.world.getBodyList();
        this.world.clearForces();
        while (body) {
            body.setLinearVelocity(new Vec2(0, 0));
            body.setAngularVelocity(0);
            body = body.getNext();
        }
    }

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
        const segments = 32;
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
        if (!this.isSimulating) {
            return;
        }
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

}