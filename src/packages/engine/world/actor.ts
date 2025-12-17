import { Controller } from "../game";
import { Vector2 } from "../math/vector2";
import { BaseObject } from "./baseobject";
import { CollisionComponent } from "./collisioncomponent";
import { Component } from "./component";
import { World } from "./world";
import { PhysicsComponent } from "../physics";
import { EngineNetworkMode } from "../engine";

export abstract class Actor extends BaseObject {
    isOwnedBy<TController extends Controller>(controller: TController|null): boolean {
        return this.possessedBy === controller;
    }
    willSpawn() {
        throw new Error("Method not implemented.");
    }
    // If true, this actor will tick its children when it ticks
    tickComponents: boolean = true;

    // If true, this actor will tick
    shouldTick: boolean = false;

    // The tick group this actor belongs to
    // Actors in the "physics" group will tick after the physics simulation step
    tickGroup: "default" | "post-physics" = "default";
    
    // All components attached to this actor
    // Components can be used to add functionality to actors
    // e.g. a SpriteComponent to render a sprite or a animation component to animate a sprite
    components:Component[];

    // The controller possessing this actor.
    // In client mode, this is the local player controller.
    // In server mode, this is the controller of the player owning this actor.
    possessedBy: Controller | null = null;

    // If true, this actor will replicate over the network
    shouldReplicate: boolean = false;
    
    // Rendering layer, higher layers are rendered on top of lower layers
    layer: number = 0; 

    // If true, the actor will be hidden in-game (not rendered) but visible in editor collision still apply
    isHiddenInGame: boolean = false;

    // Position of the actor in world space
    private position:Vector2;

    // Rotation of the actor in radians
    private rotation: number = 0; // in radians

    // Reference to the world this actor belongs to
    private world: World | null = null;

    // Internal flag to track if the actor is currently rendering
    private isRendering: boolean = false;

        // Internal flag used to mark the actor for despawning by the engine
    private isMarkedForDespawn: boolean = false;

    public isSpawned: boolean = false;

    protected name: string|undefined = undefined;

    constructor() {
        super();
        this.components = [];
        this.position = new Vector2(0, 0);
    }

    /**
     * This method is called before the actor is being spawned.
     * Used to load any necessary resources.
     */
    async onLoad(): Promise<void> {
        
    }

    public setName(name: string): void {
        if (this.name !== name) {
            this.name = name;
        }
    }

    setIsRendering(rendering: boolean): void {

        if(this.isRendering === rendering) {
            return;
        }

        if (rendering) {
            this.onStartRendering();
        } else {
            this.onStopRendering();
        }

        this.isRendering = rendering;

    }

    onDespawned() {
        
    }

    onStopRendering() {
        
    }

    onStartRendering() {
        
    }

    markForDespawn(): void {
        this.isMarkedForDespawn = true;
    }

    isMarkedForDespawned(): boolean {
        return this.isMarkedForDespawn;
    }

    setWorld(world: World | null): void {
        this.world = world;
    }

    getWorld(): World | null {
        return this.world;
    }

    getRotation(): number { return this.rotation; }
    setRotation(rotation: number): void {
        this.rotation = rotation;
        this.syncPhysicsTransform();
    }

    getPosition(): Vector2 {
        const parentActor = this.getParent() as Actor

        if(parentActor && parentActor instanceof Actor) {
            const parentPos = parentActor.getPosition();
            
            return new Vector2(parentPos.x + this.position.x, parentPos.y + this.position.y);
        }
        return new Vector2(this.position.x, this.position.y);
    }

    setPosition(position: Vector2): void {
        this.position = new Vector2(position.x, position.y);
        this.syncPhysicsTransform();
    }

    setTransformFromPhysics(position: Vector2, rotation: number): void {
        this.position = new Vector2(position.x, position.y);
        this.rotation = rotation;
    }

    addComponent<T extends Component>(component: T): T {
        component.setActor(this);
        this.components.push(component);
        return component;
    }


    getComponentsOfType<T extends Component>(ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): T[] {
        return this.components.filter(c => c instanceof ctor) as T[];
    }


    // Get the world bounds of the actor
    getWorldBounds(): { min: Vector2; max: Vector2 } | null {
        const physicsBounds = this.getPhysicsBounds();
        if (physicsBounds) {
            return physicsBounds;
        }

        const collisionComponents = this.getComponentsOfType(CollisionComponent);
        if (collisionComponents.length === 0) return null;

        const bounds = {
            min: new Vector2(Infinity, Infinity),
            max: new Vector2(-Infinity, -Infinity)
        };

        for (const comp of collisionComponents) {
            const compBounds = comp.getBounds();
            bounds.min.x = Math.min(bounds.min.x, compBounds.min.x);
            bounds.min.y = Math.min(bounds.min.y, compBounds.min.y);
            bounds.max.x = Math.max(bounds.max.x, compBounds.max.x);
            bounds.max.y = Math.max(bounds.max.y, compBounds.max.y);
        }

        return bounds;
    }
    
    initialize(): void {}

    // Called after the actor has been spawned in the world
    // Override this to implement custom behavior
    onSpawned(): void {}
    
    // Called when the game starts or when the actor is spawned
    // Override this to implement custom behavior
    onBeginPlay(): void {}
    

    private syncPhysicsTransform(): void {
        const physicsComponents = this.getComponentsOfType(PhysicsComponent);
        if (physicsComponents.length === 0) {
            return;
        }

        const worldPosition = this.getPosition();
        const rotation = this.rotation;

        for (const physics of physicsComponents) {
            physics.syncBodyTransform(worldPosition, rotation);
        }
    }

    private getPhysicsBounds(): { min: Vector2; max: Vector2 } | null {
        const physicsComponents = this.getComponentsOfType(PhysicsComponent);
        for (const physics of physicsComponents) {
            const body = physics.getBody();
            if (!body || typeof body.getBoundingVolumes !== "function") {
                continue;
            }

            const volumes = body.getBoundingVolumes();
            if (!volumes || volumes.length === 0) {
                continue;
            }

            const min = new Vector2(Infinity, Infinity);
            const max = new Vector2(-Infinity, -Infinity);
            let found = false;

            for (const volume of volumes) {
                const vertices = volume.getWorldVertices();
                if (!vertices || vertices.length === 0) {
                    continue;
                }

                found = true;

                for (const vertex of vertices) {
                    min.x = Math.min(min.x, vertex.x);
                    min.y = Math.min(min.y, vertex.y);
                    max.x = Math.max(max.x, vertex.x);
                    max.y = Math.max(max.y, vertex.y);
                }
            }

            if (found) {
                return { min, max };
            }
        }

        return null;
    }

    // Internal tick function, do not override
    // Calls tick on all components and then calls the actor's tick function
    public readonly _tick = (deltaTime: number, engineNetworkMode: EngineNetworkMode): void => {
        if (!this.shouldTick) return;

        if(this.tickComponents) {
            for(const component of this.components) {
                component._tick(deltaTime, engineNetworkMode);
            }
        }

        this.tick(deltaTime, engineNetworkMode);
    }

    // Override this to implement custom behavior
    public tick(_deltaTime: number, _engineNetworkMode: EngineNetworkMode): void {}
}