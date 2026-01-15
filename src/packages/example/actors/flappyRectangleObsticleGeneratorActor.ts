import {
    Actor,
    CollisionComponent,
    Engine,
    Mesh,
    MeshComponent,
    PhysicsComponent,
    PolygonCollisionComponent,
    Quad,
    TimerHandle,
    TimerManager,
    Vector2,
    Vertex2,
    World,
    actor,
    inject,
    property,
} from "@repo/engine";
import { UnlitMaterial } from "@repo/basicrenderer";
import { FLAPPY_UI_EVENTS } from "../flappyEvents";
import { FlappyRectangleGameMode } from "../flappyRectangleGameMode";

const randomBetween = (min: number, max: number): number => {
    if (max <= min) {
        return min;
    }
    return Math.random() * (max - min) + min;
};

@actor("FlappyRectangleObstacleActor")
export class FlappyRectangleObstacleActor extends Actor {
    @property()
    public scrollSpeed: number = 8;

    @property()
    public despawnX: number = -30;

    private width: number = 2;
    private height: number = 6;

    private readonly physics: PhysicsComponent;
    private readonly collision: PolygonCollisionComponent;
    private readonly material: UnlitMaterial;
    private readonly meshComponent: MeshComponent;

    constructor(@inject(World) protected world: World) {
        super();
        this.shouldTick = true;

        this.physics = new PhysicsComponent(this.world);
        this.physics.gravityScale = 0;
        this.physics.setSimulationState(true, "kinematic");
        this.addComponent(this.physics);
    

        this.collision = new PolygonCollisionComponent();
        this.addComponent(this.collision);

        this.material = new UnlitMaterial();
        this.meshComponent = this.addComponent(new MeshComponent(this.createQuad(this.width, this.height), this.material));

        this.rebuildGeometry();
    }

    public configure(options: {
        width: number;
        height: number;
        scrollSpeed: number;
        despawnX: number;
        color?: [number, number, number, number];
    }): void {
        this.width = Math.max(0.25, options.width);
        this.height = Math.max(0.5, options.height);
        this.scrollSpeed = options.scrollSpeed;
        this.despawnX = options.despawnX;
        if (options.color) {
            this.material.setColor(options.color);
        }
        this.rebuildGeometry();
    }

    public tick(deltaTime: number): void {
        if (!this.shouldTick) {
            return;
        }
        const offset = new Vector2(-this.scrollSpeed * deltaTime, 0);
        this.position = this.position.add(offset);

        if (this.position.x + this.width * 0.5 < this.despawnX) {
            this.markForDespawn();
        }
    }

    private rebuildGeometry(): void {
        const halfW = this.width / 2;
        const halfH = this.height / 2;

        this.collision.points = [
            new Vertex2(-halfW, -halfH),
            new Vertex2(halfW, -halfH),
            new Vertex2(halfW, halfH),
            new Vertex2(-halfW, halfH),
        ];

        this.meshComponent.setMesh(this.createQuad(this.width, this.height));

        this.rebuildCollisionVolumes();
    }

    private createQuad(width: number, height: number): Quad {
        const quad = new Quad();
        const halfW = width / 2;
        const halfH = height / 2;
        quad.vertices = new Float32Array([
            -halfW, -halfH,
            halfW, -halfH,
            -halfW, halfH,
            halfW, halfH,
        ]);
        return quad;
    }

    private rebuildCollisionVolumes(): void {
        const body = this.physics.getBody();
        if (!body) {
            return;
        }

        body.destroyBoundingVolume();
        for (const component of this.getComponentsOfType(CollisionComponent)) {
            if (component instanceof PolygonCollisionComponent && component.points.length < 3) {
                continue;
            }
            body.createBoundingVolume(component);
        }
    }
}

@actor()
export class FlayypRectangleObsticleGeneratorActor extends Actor {
    private static readonly PREVIEW_LEAD_MS = 600;

    @property({ label: "Spawn Interval (ms)" })
    public spawnIntervalMs: number = 1800;

    @property({ label: "Horizontal Spawn X" })
    public spawnX: number = 20;

    @property({ label: "Despawn Boundary X" })
    public despawnX: number = -30;

    @property({ label: "Scroll Speed" })
    public scrollSpeed: number = 8;

    @property({ label: "Playfield Top" })
    public playfieldTop: number = 100;

    @property({ label: "Playfield Bottom" })
    public playfieldBottom: number = -100;

    @property({ label: "Vertical Padding" })
    public verticalPadding: number = 1;

    @property({ label: "Gap Center Spread" })
    public gapCenterSpread: number = 4;

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

    private spawnTimer: TimerHandle | null = null;
    private waitingForStart = true;

    constructor(
        @inject(World) protected world: World,
        @inject(TimerManager) protected timerManager: TimerManager,
        @inject(Engine) protected engine: Engine,
    ) {
        super();
    }

    onBeginPlay(): void {
        this.waitingForStart = true;
        this.clearSpawnTimer();
        this.engine.guiManager.on(FLAPPY_UI_EVENTS.waitingStart, this.handleWaitingStartChanged);
    }

    onSpawned(): void {
        // Keep spawn paused until the start button is pressed.
        this.waitingForStart = true;
        this.clearSpawnTimer();
    }

    onDespawned(): void {
        this.clearSpawnTimer();
        this.engine.guiManager.off(FLAPPY_UI_EVENTS.waitingStart, this.handleWaitingStartChanged);
    }

    private readonly handleWaitingStartChanged = (waiting: boolean) => {
        this.waitingForStart = Boolean(waiting);
        if (this.waitingForStart) {
            this.clearSpawnTimer();
            return;
        }
        this.restartSpawnTimer();
    };

    private restartSpawnTimer(): void {
        if (this.waitingForStart) {
            return;
        }
        this.clearSpawnTimer();
        if (this.spawnIntervalMs <= 0) {
            return;
        }
        this.spawnTimer = this.timerManager.setTimer(() => {
            this.spawnObsticle();
        }, this.spawnIntervalMs, true);
    }

    private clearSpawnTimer(): void {
        if (this.spawnTimer) {
            this.timerManager.clearTimer(this.spawnTimer);
            this.spawnTimer = null;
        }
    }

    private spawnObsticle(): void {
        const world = this.getWorld();
        if (!world) {
            return;
        }

        if (this.waitingForStart) {
            return;
        }

        const gameMode = this.engine.currentGameMode as FlappyRectangleGameMode;
        const withIndicators = gameMode.withIndicators;

        const gapSize = randomBetween(this.minGapSize, this.maxGapSize);
        const paddedTop = this.playfieldTop - this.verticalPadding;
        const paddedBottom = this.playfieldBottom + this.verticalPadding;
        const minCenter = paddedBottom + gapSize * 0.5;
        const maxCenter = paddedTop - gapSize * 0.5;
        if (maxCenter <= minCenter) {
            console.warn("FlappyRectangleObsticleGeneratorActor: invalid playfield bounds for spawning obstacles");
            return;
        }

        const playfieldMid = (this.playfieldTop + this.playfieldBottom) * 0.5;
        const centerMin = playfieldMid - this.gapCenterSpread;
        const centerMax = playfieldMid + this.gapCenterSpread;
        let gapCenterMin = Math.max(minCenter, centerMin);
        let gapCenterMax = Math.min(maxCenter, centerMax);

        if (gapCenterMax <= gapCenterMin) {
            gapCenterMin = minCenter;
            gapCenterMax = maxCenter;
        }

        const gapCenter = randomBetween(gapCenterMin, gapCenterMax);
        const bottomHeight = Math.max(this.minObstacleHeight, gapCenter - gapSize * 0.5 - this.playfieldBottom);
        const topHeight = Math.max(this.minObstacleHeight, this.playfieldTop - (gapCenter + gapSize * 0.5));

        const spawnColumns = () => {
            this.spawnColumn(world, bottomHeight, new Vector2(this.spawnX, this.playfieldBottom + bottomHeight / 2));
            this.spawnGapDetector(world, gapCenter, gapSize);
            this.spawnColumn(world, topHeight, new Vector2(this.spawnX, this.playfieldTop - topHeight / 2));
        };

        if (withIndicators) {
            const indicator = this.spawnGapPreview(world, gapCenter, gapSize);
            this.timerManager.setTimer(() => {
                spawnColumns();
                if (indicator && !indicator.isMarkedForDespawned()) {
                    indicator.markForDespawn();
                }
            }, FlayypRectangleObsticleGeneratorActor.PREVIEW_LEAD_MS, false);
        } else {
            spawnColumns();
        }
    }

    private spawnGapPreview(world: World, gapCenter: number, gapSize: number): FlappyRectangleGapPreviewActor | null {
        const indicatorHeight = Math.max(0.25, gapSize - this.verticalPadding * 0.5);
        if (indicatorHeight <= 0) {
            return null;
        }

        const parent = this.getParent() ?? this;
        const actor = world.spawnActor(
            FlappyRectangleGapPreviewActor,
            parent,
            new Vector2(this.spawnX, gapCenter)
        ) as FlappyRectangleGapPreviewActor;
        if (!actor) {
            return null;
        }
        actor.configure({
            width: this.gapDetectorWidth * 1.5,
            height: indicatorHeight,
            despawnX: this.despawnX,
            leadMs: FlayypRectangleObsticleGeneratorActor.PREVIEW_LEAD_MS,
        });
        return actor;
    }

    private spawnColumn(world: World, height: number, position: Vector2): void {
        if (height <= 0) {
            return;
        }

        const parent = this.getParent() ?? this;
        const actor = world.spawnActor(FlappyRectangleObstacleActor, parent, position) as FlappyRectangleObstacleActor;

        if (!actor) {
            return;
        }
        actor.configure({
            width: this.obstacleWidth,
            height,
            scrollSpeed: this.scrollSpeed,
            despawnX: this.despawnX,
            color: this.randomizeColor(),
        });
            
    }

    private spawnGapDetector(world: World, gapCenter: number, gapSize: number): void {
        const detectorHeight = Math.max(0.25, gapSize - this.verticalPadding * 0.5);
        if (detectorHeight <= 0) {
            return;
        }

        const parent = this.getParent() ?? this;
        const actor = world
            .spawnActor(FlappyRectangleGapDetectorActor, parent, new Vector2(this.spawnX, gapCenter)) as FlappyRectangleGapDetectorActor;
        if (!actor) {
            return;
        }
        actor.configure({
            width: this.gapDetectorWidth,
            height: detectorHeight,
            scrollSpeed: this.scrollSpeed,
            despawnX: this.despawnX,
        });
            
    }

    private randomizeColor(): [number, number, number, number] {
        const green = 0.55 + Math.random() * 0.35;
        return [0.2, green, 0.4 + Math.random() * 0.2, 1];
    }
}

@actor("FlappyRectangleGapDetector")
export class FlappyRectangleGapDetectorActor extends Actor {
    @property()
    public scrollSpeed: number = 8;

    @property()
    public despawnX: number = -30;

    private width: number = 0.5;
    private height: number = 4;

    private readonly physics: PhysicsComponent;
    private readonly collision: PolygonCollisionComponent;

    constructor(@inject(World) protected world: World) {
        super();
        this.shouldTick = true;

        this.physics = new PhysicsComponent(this.world);
        this.physics.gravityScale = 0;
        this.physics.setSimulationState(true, "kinematic");
        this.addComponent(this.physics);

        this.collision = new PolygonCollisionComponent();
        this.collision.setSensor(true);
        this.addComponent(this.collision);

        this.rebuildCollision();
    }

    public configure(options: { width: number; height: number; scrollSpeed: number; despawnX: number }): void {
        this.width = Math.max(0.1, options.width);
        this.height = Math.max(0.1, options.height);
        this.scrollSpeed = options.scrollSpeed;
        this.despawnX = options.despawnX;
        this.rebuildCollision();
    }

    public tick(deltaTime: number): void {
        if (!this.shouldTick) {
            return;
        }
        const offset = new Vector2(-this.scrollSpeed * deltaTime, 0);
        this.position = this.position.add(offset);

        if (this.position.x + this.width * 0.5 < this.despawnX) {
            this.markForDespawn();
        }
    }

    private rebuildCollision(): void {
        const halfW = this.width / 2;
        const halfH = this.height / 2;

        this.collision.points = [
            new Vertex2(-halfW, -halfH),
            new Vertex2(halfW, -halfH),
            new Vertex2(halfW, halfH),
            new Vertex2(-halfW, halfH),
        ];

        this.rebuildCollisionVolumes();
    }

    private rebuildCollisionVolumes(): void {
        const body = this.physics.getBody();
        if (!body) {
            return;
        }

        body.destroyBoundingVolume();
        for (const component of this.getComponentsOfType(CollisionComponent)) {
            if (component instanceof PolygonCollisionComponent && component.points.length < 3) {
                continue;
            }
            body.createBoundingVolume(component);
        }
    }
}

@actor("FlappyRectangleGapPreview")
export class FlappyRectangleGapPreviewActor extends Actor {
    @property()
    public despawnX: number = -30;

    @property()
    public width: number = 0.9;

    @property()
    public height: number = 2;

    @property()
    public leadMs: number = 600;

    private readonly material: UnlitMaterial;
    private readonly meshComponent: MeshComponent;
    private elapsed = 0;

    constructor(@inject(World) protected world: World) {
        super();
        this.shouldTick = true;
        this.material = new UnlitMaterial();
        this.meshComponent = this.addComponent(
            new MeshComponent(this.createArrowMesh(this.width, this.height), this.material)
        );
        this.material.setColor([0.05, 1, 0.85, 0.5]);
    }

    public configure(options: { width: number; height: number; despawnX: number; leadMs: number }): void {
        this.width = Math.max(0.1, options.width);
        this.height = Math.max(0.1, options.height);
        this.despawnX = options.despawnX;
        this.leadMs = Math.max(100, options.leadMs);
        this.meshComponent.setMesh(this.createArrowMesh(this.width, this.height));
    }

    public tick(deltaTime: number): void {
        this.elapsed += deltaTime;
        const pulse = (Math.sin(this.elapsed * 10) + 1) * 0.5;
        const flicker = 0.08 * Math.abs(Math.sin(this.elapsed * 22));
        const alpha = Math.min(1, 0.45 + 0.35 * pulse + flicker);
        this.material.setColor([0.05, 1, 0.85, alpha]);

        if (this.elapsed * 1000 >= this.leadMs || this.position.x < this.despawnX) {
            this.markForDespawn();
        }
    }

    private createArrowMesh(width: number, height: number): ArrowMesh {
        return new ArrowMesh(width, height);
    }
}

class ArrowMesh extends Mesh {
    private width: number;
    private height: number;

    constructor(width: number, height: number) {
        super();
        this.width = Math.max(0.05, width);
        this.height = Math.max(0.05, height);
        this.rebuild();
    }

    private rebuild(): void {
        const w = this.width;
        const h = this.height;
        const halfH = h * 0.5;
        const tailHalfH = halfH * 0.6;
        const tailFrontX = -w * 0.5 + w * 0.45;

        this.vertices = new Float32Array([
            -w * 0.5, tailHalfH,
            tailFrontX, tailHalfH,
            tailFrontX, halfH,
            w * 0.5, 0,
            tailFrontX, -halfH,
            tailFrontX, -tailHalfH,
            -w * 0.5, -tailHalfH,
        ]);

        this.indices = new Uint16Array([
            0, 1, 6,
            1, 5, 6,
            1, 2, 3,
            1, 3, 4,
            1, 4, 5,
        ]);

        const minX = -w * 0.5;
        const maxX = w * 0.5;
        const minY = -halfH;
        const maxY = halfH;
        const spanX = maxX - minX;
        const spanY = maxY - minY;

        this.uvs = new Float32Array([
            (this.vertices[0] - minX) / spanX, (this.vertices[1] - minY) / spanY,
            (this.vertices[2] - minX) / spanX, (this.vertices[3] - minY) / spanY,
            (this.vertices[4] - minX) / spanX, (this.vertices[5] - minY) / spanY,
            (this.vertices[6] - minX) / spanX, (this.vertices[7] - minY) / spanY,
            (this.vertices[8] - minX) / spanX, (this.vertices[9] - minY) / spanY,
            (this.vertices[10] - minX) / spanX, (this.vertices[11] - minY) / spanY,
            (this.vertices[12] - minX) / spanX, (this.vertices[13] - minY) / spanY,
        ]);
    }

    rotate(angle: number): void {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (let i = 0; i < this.vertices.length; i += 2) {
            const x = this.vertices[i];
            const y = this.vertices[i + 1];
            this.vertices[i] = x * cos - y * sin;
            this.vertices[i + 1] = x * sin + y * cos;
        }
    }

    scale(sx: number, sy: number): void {
        for (let i = 0; i < this.vertices.length; i += 2) {
            this.vertices[i] *= sx;
            this.vertices[i + 1] *= sy;
        }
        this.width = Math.max(0.05, this.width * Math.abs(sx));
        this.height = Math.max(0.05, this.height * Math.abs(sy));
    }

    translate(tx: number, ty: number): void {
        for (let i = 0; i < this.vertices.length; i += 2) {
            this.vertices[i] += tx;
            this.vertices[i + 1] += ty;
        }
    }

    clone(): Mesh {
        const copy = new ArrowMesh(this.width, this.height);
        copy.vertices = new Float32Array(this.vertices);
        copy.indices = new Uint16Array(this.indices);
        copy.uvs = new Float32Array(this.uvs);
        return copy;
    }

    getVertexCount(): number {
        return this.vertices.length / 2;
    }
}