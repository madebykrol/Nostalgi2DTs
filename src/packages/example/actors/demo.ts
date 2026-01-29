import { actor, Actor, CircleCollisionComponent, Engine, GainChannel, inject, injectable, MeshComponent, PhysicsComponent, PolygonCollisionComponent, property, Quad, SoundManager, TimerHandle, TimerManager, Vector2, Vertex2, World } from "@nostalgi2d/engine";
import { UnlitMaterial } from "@nostalgi2d/basicrenderer";
import { Character } from "../../engine/game";

@injectable()
@actor("BombActor")
export class BombActor extends Actor {

    private static readonly BOMB_GEOMETRY = new Quad();
    private static readonly BOMB_COLLISION_POINTS = [
        new Vertex2(-0.5, -0.5),
        new Vertex2(0.5, -0.5),
        new Vertex2(0.5, 0.5),
        new Vertex2(-0.5, 0.5)
    ];
    private static readonly EXPLOSION_FORCE_VECTOR = new Vector2(0, 0);
    private static explosionBuffer: AudioBuffer | null = null;
    
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

    constructor(@inject(TimerManager) protected timerManager: TimerManager, @inject(World) protected world: World, @inject(SoundManager) protected soundManager: SoundManager) {
        super();
        this.shouldTick = true;
        const physics = this.addComponent(new PhysicsComponent(this.world));
        physics.setSimulationState(true, "dynamic");

        const collisionComponent = new PolygonCollisionComponent();
        collisionComponent.points = BombActor.BOMB_COLLISION_POINTS;
        this.addComponent(collisionComponent);
        const material = new UnlitMaterial();
        material.setColor([0.2, 0.7, 0.2, 1.0]);
        this.addComponent(new MeshComponent(BombActor.BOMB_GEOMETRY, material));
    }

    private armFuse(): void {
        // Clear any previous fuse (hot reload/editor reuse)
        if (this.timerHandle) {
            this.timerManager.clearTimer(this.timerHandle);
            this.timerHandle = null;
        }

        this.timerHandle = this.timerManager.setTimer(() => {
            this.getWorld()?.radialCast(this.position, this.blastRadius, true, true, Actor).forEach((actor) => {
                if (actor.getId() !== this.getId()) {
                    const dx = actor.position.x - this.position.x;
                    const dy = actor.position.y - this.position.y;
                    const len = Math.hypot(dx, dy) || 1;
                    BombActor.EXPLOSION_FORCE_VECTOR.x = (dx / len) * this.blastForce;
                    BombActor.EXPLOSION_FORCE_VECTOR.y = (dy / len) * this.blastForce;
                    actor.applyImpulse(BombActor.EXPLOSION_FORCE_VECTOR);
                }
            });

            // play sound effect, spawn particles, etc. here
            // Create a simple explosion sound
            if (!BombActor.explosionBuffer) {
                BombActor.explosionBuffer = this.createExplosionSound(this.soundManager.getAudioContext()!);
            }
            const explosionSound = this.soundManager.loadSoundFromBuffer("explosionSound", BombActor.explosionBuffer, GainChannel.Effects);
            explosionSound.setVolume(0.5);
            explosionSound.play(false, 0);


            this.markForDespawn();

        }, this.fuseTimer);
    }

    public onBeginPlay(): void {
        // Only arm the fuse when the game is actually playing (not just loaded in editor)
        if (!this.timerHandle) {
            this.armFuse();
        }
    }

    public onSpawned(): void {
        if(!this.timerHandle){
            this.armFuse();
        }
    }

    public onDespawned(): void {
        if (this.timerHandle) {
            this.timerManager.clearTimer(this.timerHandle);
            this.timerHandle = null;
        }
    }

    private createExplosionSound(audioContext: AudioContext): AudioBuffer {
        const sampleRate = audioContext.sampleRate;
        const duration = 0.5; // seconds
        let frameCount = sampleRate * duration;
        // Add a random frameCount offset to reduce repetitiveness
        frameCount += Math.floor(Math.random() * sampleRate * 0.6);
        const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frameCount; i++) {
            // Simple white noise with exponential decay
            
            const time = i / sampleRate;
            const decay = Math.exp(-5 * time);
            data[i] = (Math.random() * 2 - 1) * decay;
        }
        return buffer;

    }
}


@actor("DemoActor")
export class DemoActor extends Actor {

    private static readonly DEMO_GEOMETRY = new Quad();
    private static readonly DEMO_COLLISION_RADIUS = 0.5;

    constructor(@inject(World) protected world: World) {
        super();
        this.shouldTick = true;
        const physics = this.addComponent(new PhysicsComponent(this.world));
        physics.setSimulationState(true, "dynamic");

        const collisionComponent = new CircleCollisionComponent(DemoActor.DEMO_COLLISION_RADIUS);
        
        this.addComponent(collisionComponent);
        const material = new UnlitMaterial();
        material.setColor([0.9, 0.25, 0.25, 1.0]);
        this.addComponent(new MeshComponent(DemoActor.DEMO_GEOMETRY, material));
    }

    initialize(): void {
        console.log("DemoActor initialized with id:", this.getId());
    }

    tick(_deltaTime: number): void {
     
    }
}

@actor("DemoCharacter")
export class DemoCharacter extends Character {

    private static readonly CHARACTER_GEOMETRY = new Quad();
    private static readonly CHARACTER_COLLISION_POINTS = [
        new Vertex2(-1, -1),
        new Vertex2(1, -1),
        new Vertex2(1, 1),
        new Vertex2(-1, 1)
    ];

    @property()
    public shouldSpawnBombs: boolean = true;

    constructor(
        @inject(World) protected world: World,
        @inject(Engine) protected engine: Engine,
        @inject(TimerManager) protected timerManager: TimerManager) {
        super();

        this.shouldTick = true;
        const physics = this.addComponent(new PhysicsComponent(this.world));
        physics.setSimulationState(true, "dynamic");

        const collisionComponent = new PolygonCollisionComponent();
        collisionComponent.points = DemoCharacter.CHARACTER_COLLISION_POINTS;
        this.addComponent(collisionComponent);
        const material = new UnlitMaterial();
        material.setColor([0.2, 0.7, 0.2, 1.0]);
        this.addComponent(new MeshComponent(DemoCharacter.CHARACTER_GEOMETRY, material));
    }

    onSpawned(): void {
        // Spawn and launch 16 bombs in a circle around the character
        const bombCount = 16;
        const launchForce = 35;
        this.timerManager.setTimer(async () => {
            for (let i = 0; i < bombCount; i++) {
                const angle = (i / bombCount) * Math.PI * 2;
                const radialDirection = new Vector2(Math.cos(angle), Math.sin(angle));
                const worldPosition = this.position.add(radialDirection.multiply(3));
                const parent = this.getParent(); // place bombs alongside the character to avoid parent-physics double transforms

                const bomb = this.engine?.createObject(BombActor, (parent?.id ?? "bomb")+"-"+i) as BombActor;

                this.getWorld()?.spawnActorInstance(bomb,
                    parent ?? this, 
                    worldPosition
                );

                const launchVector = radialDirection.multiply(launchForce);
                bomb.applyImpulse(launchVector);
                bomb.fuseTimer = 60000;
                bomb.blastRadius = 10;
                bomb.blastForce = 50;
            }
        }, 1500, true);
    }

    tick(_deltaTime: number): void {
       
    }
}