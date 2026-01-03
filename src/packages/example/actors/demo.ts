import { actor, Actor, CircleCollisionComponent, inject, injectable, MeshComponent, PhysicsComponent, property, Quad, TimerHandle, TimerManager, Vector2 } from "@repo/engine";
import { UnlitMaterial } from "@repo/basicrenderer";
import { PolygonCollisionComponent } from "../../engine/world/circleCollisionComponent";
import { Character } from "../../engine/game";

@actor("BombActor")
export class BombActor extends Actor {
    
    tick(_deltaTime: number): void {
        // Bomb blinks red as it nears explosion
        const progress = this.timerHandle ? Math.min(1, this.timerHandle.timePassed) : 0;
        // Ramp frequency from 4Hz up to 14Hz as we near detonation (quadratic easing for drama)
        const blinkFrequency = 4 + Math.pow(progress, 2) * 10;
        const alpha = 0.5 + 0.5 * Math.sin(progress * blinkFrequency * 2 * Math.PI);
        const material = this.getComponentsOfType(MeshComponent)[0]?.getMaterial() as UnlitMaterial;
        if (material) {
            material.setColor([1.0, 0.0, 0.0, alpha]);
        }
    }

    @property()
    public fuseTimer: number = 3000;
    @property()
    public blastRadius: number = 5;
    @property()
    public blastForce: number = 10;

    private timerHandle: TimerHandle | null = null;

    constructor(@inject(TimerManager) protected timerManager: TimerManager) {
        super();
        this.shouldTick = true;
        const physics = this.addComponent(new PhysicsComponent());
        physics.setSimulationState(true, "dynamic");

        const collisionComponent = new PolygonCollisionComponent([{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }]);

        this.addComponent(collisionComponent);
        const material = new UnlitMaterial();
        material.setColor([0.2, 0.7, 0.2, 1.0]);
        this.addComponent(new MeshComponent(new Quad(), material));
    }

    public onSpawned(): void {
        
        this.timerHandle = this.timerManager.setTimer(() => {
            this.getWorld()?.radialCast(this.position, this.blastRadius, true, true, Actor).forEach((actor) => {
                if (actor.getId() !== this.getId()) {
                    console.log(`BombActor damaging actor with id: ${actor.getId()}`);
                    actor.applyImpulse(new Vector2(actor.position.x - this.position.x, actor.position.y - this.position.y).normalize().multiply(this.blastForce));
                }
            });
            console.log("BombActor exploded");

            this.markForDespawn();

        }, this.fuseTimer);
    }
}


@actor("DemoActor")
export class DemoActor extends Actor {

    constructor() {
        super();
        this.shouldTick = true;
        const physics = this.addComponent(new PhysicsComponent());
        physics.setSimulationState(true, "dynamic");

        const collisionComponent = new CircleCollisionComponent(0.5);
        
        this.addComponent(collisionComponent);
        const material = new UnlitMaterial();
        material.setColor([0.9, 0.25, 0.25, 1.0]);
        this.addComponent(new MeshComponent(new Quad(), material));
    }

    initialize(): void {
        console.log("DemoActor initialized with id:", this.getId());
    }

    tick(_deltaTime: number): void {
     
    }
}

@actor("DemoCharacter")
export class DemoCharacter extends Character {
    constructor() {
        super();

        this.shouldTick = true;
        const physics = this.addComponent(new PhysicsComponent());
        physics.setSimulationState(true, "dynamic");

        const collisionComponent = new PolygonCollisionComponent([{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }]);


        this.addComponent(collisionComponent);
        const material = new UnlitMaterial();
        material.setColor([0.2, 0.7, 0.2, 1.0]);
        this.addComponent(new MeshComponent(new Quad(), material));
    }

    onSpawned(): void {
        console.log("DemoCharacter onSpawned with id:", this.getId());

        // Spawn and launch 16 bombs in a circle around the character
        const bombCount = 16;
        const launchForce = 40;
        for (let i = 0; i < bombCount; i++) {
            const angle = (i / bombCount) * Math.PI * 2;
            const radialDirection = new Vector2(Math.cos(angle), Math.sin(angle));
            const worldPosition = this.position.add(radialDirection.multiply(2));
            const parent = this.getParent() ?? this;

            this.getWorld()?.spawnActor(BombActor, parent, worldPosition).then((bomb) => {
                const launchVector = worldPosition.subtract(this.position).normalize().multiply(launchForce);
                bomb.applyImpulse(launchVector);
                bomb.fuseTimer = 2000;
                bomb.blastRadius = 10;
                bomb.blastForce = 50;
            });
        }
    }

    tick(_deltaTime: number): void {
       
    }
}