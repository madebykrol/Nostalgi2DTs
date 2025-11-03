import { Vector2 } from "../math";
import { Actor, World } from "../world";
import { CollisionComponent } from "../world/collisioncomponent";
import { BodyType } from "./bodyType";
import { BoundingVolume } from "./boundingvolume";
export abstract class PhysicsBody {

    protected actor: Actor;
    protected world: World;
    protected bodyType: BodyType = "dynamic";
    constructor(world:World, actor: Actor) {
        this.world = world;
        this.actor = actor;
        this.bodyType = "dynamic";
    }

    abstract addForce(force: Vector2): void;
    abstract addImpulse(impulse: Vector2): void;
    abstract setIsActive(active: boolean): void;
    abstract createBoundingVolume(component: CollisionComponent): void;
    abstract destroyBoundingVolume(): void;
    abstract getBoundingVolumes(): BoundingVolume[];
    abstract setBodyType(type: BodyType): void;
    abstract setTransform(position: Vector2, rotation: number): void;
    abstract setCollisionFilter(filterFunction: (actor: Actor) => boolean): void;
}


