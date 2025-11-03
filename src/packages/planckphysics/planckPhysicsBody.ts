import { Actor, BoundingVolume, CollisionComponent, PhysicsBody, PhysicsComponent, Vector2, World } from "@repo/engine";
import { World as PWorld, Vec2, Body } from "planck";
import { BodyType } from "planck";
import { PlanckBoundingVolume } from "./planckBoundingVolume";

export class PlanckPhysicsBody extends PhysicsBody {

    protected bodyType: BodyType = "dynamic";

    private body: Body;
    private boundingVolumes: PlanckBoundingVolume[] = [];

    constructor(world: World, protected actor: Actor, physics: PhysicsComponent, planckWorld: PWorld) {
        super(world, actor);
        this.body = planckWorld.createBody({ userData: { actor: this.actor, component: physics }, type: physics.getBodyType(), awake: true });
        this.body.setPosition(new Vec2(actor.getPosition().x, actor.getPosition().y));
        this.body.setActive(physics.isSimulated());
    }
    
    setCollisionFilter(filterFunction: (actor: Actor) => boolean): void {
        this.body.shouldCollide = (that: Body) => {
            const otherActor = (that?.getUserData() as any).actor;
            return filterFunction(otherActor);
        }
    }

    addImpulse(impulse: Vector2): void {
        this.body.applyLinearImpulse(new Vec2(impulse.x, impulse.y), this.body.getWorldCenter(), true);
    }

    addForce(force: Vector2): void {
        this.body.applyForceToCenter(new Vec2(force.x, force.y), true);
    }

    setBodyType(type: BodyType): void {
        this.bodyType = type;
        this.body.setType(type);
    }

    setTransform(position: Vector2, rotation: number): void {
        this.body.setTransform(new Vec2(position.x, position.y), rotation);
    }

    setIsActive(active: boolean): void {
        this.body.setActive(active);
    }

    createBoundingVolume(component: CollisionComponent): void {
        const volume = new PlanckBoundingVolume(this.body, component);
        this.boundingVolumes.push(volume);
    }

    destroyBoundingVolume(): void {
        for (const volume of this.boundingVolumes) {
            this.body.destroyFixture(volume['fixture']);
        }
        this.boundingVolumes = [];
    }
    
    getBoundingVolumes(): BoundingVolume[] {
        return this.boundingVolumes;
    }
}