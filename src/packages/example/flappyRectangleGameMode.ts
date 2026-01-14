import {
    MeshComponent,
    PhysicsComponent,
    PolygonCollisionComponent,
    Quad,
    Vertex2,
    World,
    actor,
    Constructor,
    Controller,
    GameMode,
    inject,
    injectable,
    Engine,
    CollisionComponent,
    property,
    Vector2,
    Rpc,
} from "@repo/engine";
import { UnlitMaterial } from "@repo/basicrenderer";

import { FlappyRectangleController } from "./controllers/flappyRectangleController";
import { Character } from "../engine/game";
import { FlappyRectangleGapDetectorActor } from "./actors/flappyRectangleObsticleGeneratorActor";
import { FLAPPY_UI_EVENTS } from "./flappyEvents";

@injectable()
export class FlappyRectangleGameMode extends GameMode {
    public playerControllerType: Constructor<Controller> | undefined = FlappyRectangleController;
    public playerCharacterType: Constructor<Character> | undefined = FlappyRectangleCharacter;

    private score: number = 0;
    private highScore: number = 0;
    private static bestScore: number = 0;
    private lastScore: number = 0;
    private waitingForStart: boolean = true;
    private gameActive: boolean = false;

    public withIndicators: boolean = false;

    @property({ label: "Spawn Interval (ms)" })
    public spawnIntervalMs: number = 1800;

    @property({ label: "Horizontal Spawn X" })
    public spawnX: number = 20;

    @property({ label: "Despawn Boundary X" })
    public despawnX: number = -30;

    @property({ label: "Scroll Speed" })
    public scrollSpeed: number = 8;

    @property({ label: "Playfield Top" })
    public playfieldTop: number = 12;

    @property({ label: "Playfield Bottom" })
    public playfieldBottom: number = -12;

    @property({ label: "Vertical Padding" })
    public verticalPadding: number = 1;

    @property({ label: "Minimum Gap" })
    public minGapSize: number = 4;

    @property({ label: "Maximum Gap" })
    public maxGapSize: number = 6.5;

    @property({ label: "Obstacle Width" })
    public obstacleWidth: number = 2;

    @property({ label: "Minimum Column Height" })
    public minObstacleHeight: number = 1.25;

    @property({ label: "Gap Detector Width" })
    public gapDetectorWidth: number = 0.75;

    private shouldRestart: boolean = false;

    constructor(@inject(World) protected world: World, @inject(Engine) protected engine: Engine) {
        super(world, engine);

        this.world.onCollision("begin", this.handleCollisionBegin);

        this.engine.guiManager.on(FLAPPY_UI_EVENTS.restartRequest, () => {
            this.shouldRestart = true;
        });
        this.engine.guiManager.on(FLAPPY_UI_EVENTS.startRequest, this.handleStartGame);
        this.engine.guiManager.on(FLAPPY_UI_EVENTS.flapRequest, this.handleFlapRequest);
        // Ensure UI shows start gate immediately on load
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.waitingStart, this.waitingForStart);

        this.engine.guiManager.on(FLAPPY_UI_EVENTS.useIndicators, (useIndicators: boolean) => {
            this.withIndicators = useIndicators;
        });

        world.pauseSimulation();
    }

    private crashed(): void {
        console.log("Crashed! Final Score:", this.score);
        
        // Update high score if needed
        if (this.score > FlappyRectangleGameMode.bestScore) {
            FlappyRectangleGameMode.bestScore = this.score;
            this.highScore = this.score;
            this.engine.guiManager.emit(FLAPPY_UI_EVENTS.highScore, this.highScore);
        }
        
        // Emit game over event
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.gameOver, true);
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.finalScore, this.score);
        this.lastScore = this.score;
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.lastScore, this.lastScore);
        this.gameActive = false;

        this.world.pauseSimulation();

        this.setScore(this.score);
    }

    @Rpc(true)
    protected setScore(score: number): void {
        console.log("Derp RPC called on server with score:", score);
    }

    public override tick(_deltaTime: number): void {
        if (this.shouldRestart) {
            this.shouldRestart = false;
            this.engine.loadLevel("levels/new-level").then(level => {
                this.engine.loadLevelObject(level)
                this.engine.run(false)
                this.levelRestarted();
            });
        }
    }

    public override onGameStart(): void {
        // Reset score and emit initial values
        this.score = 0;
        this.highScore = FlappyRectangleGameMode.bestScore;
        this.waitingForStart = true;
        this.gameActive = false;
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.score, this.score);
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.highScore, this.highScore);
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.gameOver, false);
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.waitingStart, this.waitingForStart);
    }
    
    private readonly handleCollisionBegin = (collisionA: CollisionComponent, collisionB: CollisionComponent): void => {
        const actorA = collisionA.getActor();
        const actorB = collisionB.getActor();

        // Game is active handler

        if(!this.gameActive) {
            return;
        }

        if (
            actorA === this.getLocalPlayerState()?.getController()?.getCurrentPossessedPawn() || 
            actorB === this.getLocalPlayerState()?.getController()?.getCurrentPossessedPawn())
            {
                if (
                    actorA instanceof FlappyRectangleGapDetectorActor || 
                    actorB instanceof FlappyRectangleGapDetectorActor
                ) {
                    console.log("Passed through gap detector - incrementing score");
                    this.score += 1;
                    this.engine.guiManager.emit(FLAPPY_UI_EVENTS.score, this.score);
                    return;
                }

                this.crashed();
         }
    }

    private levelRestarted(): void {
        // Logic to restart the level
        this.score = 0;
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.score, this.score);
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.gameOver, false);
        this.waitingForStart = true;
        this.gameActive = false;

        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.waitingStart, this.waitingForStart);
    }

    private readonly handleStartGame = (): void => {

        console.log("Start game requested");

        if (this.gameActive) return;
        
        this.waitingForStart = false;
        this.gameActive = true;
        this.shouldRestart = false;
        this.score = 0;
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.score, this.score);
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.gameOver, false);
        this.engine.guiManager.emit(FLAPPY_UI_EVENTS.waitingStart, this.waitingForStart);

        this.world.resumeSimulation();
    }

    public override onStop(): void {
        this.engine.guiManager.off(FLAPPY_UI_EVENTS.startRequest, this.handleStartGame);
        this.engine.guiManager.off(FLAPPY_UI_EVENTS.flapRequest, this.handleFlapRequest);
    }

    private readonly handleFlapRequest = (): void => {
        if (!this.gameActive || this.waitingForStart) {
            return;
        }
        const pawn = this.getLocalPlayerState()?.getController()?.getCurrentPossessedPawn();
        const physics = pawn?.getComponentsOfType(PhysicsComponent)[0];
        physics?.addImpulse(new Vector2(0, 20));
    };

    // private findGeneratorRecursive(node: BaseObject): FlayypRectangleObsticleGeneratorActor | null {
    //     for (const child of node.getChildren()) {
    //         if (child instanceof FlayypRectangleObsticleGeneratorActor) {
    //             return child;
    //         }
    //         const found = this.findGeneratorRecursive(child);
    //         if (found) {
    //             return found;
    //         }
    //     }
    //     return null;
    // }
}

@actor("FlappyRectangleCharacter")
export class FlappyRectangleCharacter extends Character {
    private readonly physics: PhysicsComponent;
    private readonly collision: PolygonCollisionComponent;
    private readonly material: UnlitMaterial;

    constructor(@inject(World) protected world: World, @inject(Engine) protected engine: Engine) {
        super();

        this.shouldTick = true;

        this.physics = this.addComponent(new PhysicsComponent(this.world));
        this.physics.setSimulationState(true, "dynamic");

        this.collision = new PolygonCollisionComponent();
        this.collision.points = this.buildSquareVertices();

        this.addComponent(this.collision);

        this.material = new UnlitMaterial();
        this.material.setColor([1, 0.9, 0.2, 1]);
        const quad = this.createSquareQuad();
        this.addComponent(new MeshComponent(quad, this.material));
    }

    private buildSquareVertices(): Vertex2[] {
        const halfSize = 0.6;
        return [
            new Vertex2(-halfSize, -halfSize),
            new Vertex2(halfSize, -halfSize),
            new Vertex2(halfSize, halfSize),
            new Vertex2(-halfSize, halfSize),
        ];
    }

    private createSquareQuad(): Quad {
        const halfSize = 0.6;
        const quad = new Quad();
        quad.vertices = new Float32Array([
            -halfSize, -halfSize,
            halfSize, -halfSize,
            -halfSize, halfSize,
            halfSize, halfSize,
        ]);
        return quad;
    }

    public override tick(_deltaTime: number): void {
        // rotate slightly based on vertical velocity
        const velocity = this.physics?.getLinearVelocity().y || 0;
        const targetRotation = Math.min(Math.max(velocity / 10, -0.5), 0.5);
        this.rotation += (targetRotation - this.rotation) * 0.1;
    }
}