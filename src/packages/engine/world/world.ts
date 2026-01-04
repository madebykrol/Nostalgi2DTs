
import { Actor, BaseObject, Constructor, Container, PhysicsBody, PhysicsComponent, Vector2 } from "..";
export interface WorldSettings { 
    gravity: Vector2|undefined;
    allowSleep: boolean|undefined;
    airFriction: number|undefined;
}

export abstract class World {
    private editorMode: boolean = false;
    
    constructor(protected settings: WorldSettings|undefined, protected container: Container) {

    }

    setEditorMode(isEditor: boolean): void {
        this.editorMode = isEditor;
    }

    abstract getGravity(): Vector2|undefined;
    abstract setGravity(gravity: Vector2): void;
    abstract createPhysicsBody(actor: Actor, physics: PhysicsComponent): PhysicsBody;

    public resetForces() {
        
    }

    getAirfriction(): number {
        return this.settings?.airFriction ?? 1;
    }

    async spawnActor<TActor extends Actor>(ctor: Constructor<TActor>, parent: BaseObject, position?: Vector2, properties?: Record<string, any>): Promise<TActor> {

        const actor = this.container.get<TActor>(ctor);
        if (properties)
            actor.applyProperties(properties);

        actor.initialize();

        await this.spawnActorInstance(actor, parent, position);

        return actor;
    }

    async spawnActorInstance(actor: Actor, parent?: BaseObject, position?: Vector2): Promise<void> {
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
            await this.spawnActorInstance(child, actor);
        }

        if (!this.editorMode) {
            actor.onSpawned();
        }

        actor.isSpawned = true;
    }

    private spawnActorInternal<T extends Actor>(actor: T, position: Vector2|undefined): T {
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