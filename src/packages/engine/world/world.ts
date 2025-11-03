
import { Frustum } from "../camera/frustum";
import { Vector2 } from "../math/vector2";
import { PhysicsBody, PhysicsComponent } from "../physics";
import { Actor } from "./actor";

export interface WorldSettings { 
    gravity: Vector2|undefined;
    allowSleep: boolean|undefined;
}

export abstract class World {
    

    constructor(protected settings: WorldSettings|undefined) {

    }

    abstract getGravity(): Vector2|undefined;
    abstract setGravity(gravity: Vector2): void;
    abstract createPhysicsBody(actor: Actor, physics: PhysicsComponent): PhysicsBody;
    abstract checkWithinBounds(actor: Actor, bounds: Frustum): boolean;

    spawnActor<T extends Actor>(actor: T, _position: Vector2|undefined): T {

        actor.setWorld(this);

        const physicsComponents = actor.getComponentsOfType(PhysicsComponent);
        if (physicsComponents.length > 0) {
            const physics = physicsComponents[0];
            const body = this.createPhysicsBody(actor, physics);
            physics.setBody(body);
        }

        return actor;
    }

    despawnActor(actor: Actor): void {
        const physicsComponents = actor.getComponentsOfType(PhysicsComponent);
        for (const physics of physicsComponents) {
            const body = physics.getBody();
            if (body) {
                body.destroyBoundingVolume();
            }
            physics.setBody(null);
        }
    }

    abstract aabbCast<T extends Actor>(point: Vector2, includeStatic: boolean, includeDynamic: boolean, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): Actor[];

    abstract radialCast<T extends Actor>(start: Vector2, radius: number, includeStatic: boolean, includeDynamic: boolean, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): Actor[];

    abstract rayCast<T extends Actor>(start: Vector2, end: Vector2, includeStatic: boolean, includeDynamic: boolean, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)   ): Actor[];

    abstract _tick(timestep: number): void;
}