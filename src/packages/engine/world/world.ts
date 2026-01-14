
import { Actor, BaseObject, CollisionComponent, Constructor, Container, PhysicsBody, PhysicsComponent, Vector2 } from "..";
export interface WorldSettings { 
    gravity: Vector2|undefined;
    allowSleep: boolean|undefined;
    airFriction: number|undefined;
}

export abstract class World {
    private editorMode: boolean = false;

    protected collisionCallbacks: Map<"begin"|"end", ((collisionA: CollisionComponent, collisionB: CollisionComponent) => void)[]> = new Map();

    protected isSimulating: boolean = true;
    
    constructor(protected settings: WorldSettings|undefined, protected container: Container) {

    }

    setEditorMode(isEditor: boolean): void {
        this.editorMode = isEditor;
    }

    abstract getGravity(): Vector2|undefined;
    abstract setGravity(gravity: Vector2): void;
    abstract createPhysicsBody(actor: Actor, physics: PhysicsComponent): PhysicsBody;

    public pauseSimulation(): void {
        this.isSimulating = false;
    }

    public resumeSimulation(): void {
        this.isSimulating = true;
    }

    public onCollision(event: "begin"|"end", callback: (collisionA: CollisionComponent, collisionB: CollisionComponent) => void): void {
        if (!this.collisionCallbacks.has(event)) {
            this.collisionCallbacks.set(event, []);
        }
        this.collisionCallbacks.get(event)!.push(callback);
    }

    public offCollision(event: "begin"|"end", callback: (collisionA: CollisionComponent, collisionB: CollisionComponent) => void): void {
        if (!this.collisionCallbacks.has(event)) {
            return;
        }
        const callbacks = this.collisionCallbacks.get(event)!;
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
            callbacks.splice(index, 1);
        }
    }

    public abstract resetForces(): void;

    getAirfriction(): number {
        return this.settings?.airFriction ?? 0.02;
    }

    spawnActor<TActor extends Actor>(ctor: Constructor<TActor>, parent: BaseObject, position?: Vector2, properties?: Record<string, any>): Actor {

        const actor = this.container.get<TActor>(ctor);
        if (properties)
            actor.applyProperties(properties);

        actor.initialize();

        this.spawnActorInstance(actor, parent, position);

        return actor;
    }

    spawnActorInstance(actor: Actor, parent?: BaseObject, position?: Vector2): void {
        let resolvedParent = parent ?? actor.getParent();

        if (resolvedParent) {
            if (actor.getParent() !== resolvedParent) {
                resolvedParent.addChild(actor);
            }
        }

        if(position !== undefined)
            actor.position = position;


        this.spawnActorInternal(actor, actor.position);
        const children = actor.getChildrenOfType(Actor);
        
        for(const child of children) {
            this.spawnActorInstance(child, actor);
        }

        if (!this.editorMode) {
            actor.onSpawned();
            actor.isSpawned = true;
        }
    }

    private spawnActorInternal<T extends Actor>(actor: T, _position: Vector2|undefined): T {
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

        for (const child of actor.getChildrenOfType(Actor)) {
            this.despawnActor(child);
        }
        actor.onDespawned();
        actor.getParent()?.removeChild(actor);


        const physicsComponents = actor.getComponentsOfType(PhysicsComponent);
        for (const physics of physicsComponents) {
            const body = physics.getBody();
            if (body) {
                body.destroyBoundingVolume();
            }
            physics.setBody(null);
        }

        actor.setWorld(null);
        actor.isSpawned = false;
    }

    abstract aabbCast<T extends Actor>(point: Vector2, includeStatic: boolean, includeDynamic: boolean, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): Actor[];

    abstract radialCast<T extends Actor>(start: Vector2, radius: number, includeStatic: boolean, includeDynamic: boolean, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): Actor[];

    abstract rayCast<T extends Actor>(start: Vector2, end: Vector2, includeStatic: boolean, includeDynamic: boolean, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)   ): Actor[];

    abstract _tick(timestep: number): void;
}