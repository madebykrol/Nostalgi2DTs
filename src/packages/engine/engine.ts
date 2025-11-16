import { Frustum, Camera } from "./camera";
import { Actor, World, BaseObject } from "./world";
import { Level } from "./level";
import { PlayerState, Controller } from "./game";
import { Url, TimerManager, Constructor, Container } from "./utils";
import { Vector2 } from "./math";
import { Endpoint } from "./network/endpoint";
import { InputManager } from "./input/inputmanager";
import { ActorRenderer } from "./rendering";
import { GameMode } from "./game/gameMode";

class RootObject extends BaseObject {

}

export type EngineNetworkMode = "client" | "server" | "singleplayer";

export class Engine<TSocket, TReq> {

    afterRenderCallbacks: Map<string, (() => void)> = new Map();
    currentGameMode: GameMode | undefined;

    onAfterRender(afterRenderHandle: (() => void)): string {
      // Add a callback to be called after rendering is complete
      const id = Math.random().toString(36).substr(2, 9);
      this.afterRenderCallbacks.set(id, afterRenderHandle);
      return id;
    }

    offAfterRender(id: string): void {
      this.afterRenderCallbacks.delete(id);
    }

    protected currentCamera: Camera | undefined;
    protected lastFrameTime: number = 0; // used ONLY for FPS measurement (updated in finishFrame)
    protected lastTickTime: number = 0;  // used for simulation delta (updated in tick)
    protected fps: number = 0;
    protected deltaTime: number = 0;
    protected currentMap: Level | undefined;

    protected netTickRate = 120;

    protected clientRpcs: Map<string, Function> = new Map();
    protected serverRpcs: Map<string, Function> = new Map();

    protected timerManager: TimerManager = new TimerManager();
    protected inputManager: InputManager | undefined = undefined;

    protected frameTimes: number[] = [];
    private frameId: number = 0; // increments every render pass
    private rendererCache: Map<any, any> = new Map();
    // private spatialGrid: SpatialGrid = new SpatialGrid(10);
    public debugMeshes: boolean = false; // show physics debug outlines
    public useDebugLogging: boolean = false;

    players: PlayerState[] = [];
    controllers: Controller[] = [];

    rootObject: BaseObject = new RootObject();

    private controllerTypeForPlayer: Constructor<Controller> | null = null;

    constructor(
        protected world: World,
        protected netEndpoint: Endpoint<TSocket, TReq> | undefined,
        protected networkMode: EngineNetworkMode = "singleplayer", 
        protected container: Container) {
    }

    setNetworkMode(networkMode: EngineNetworkMode): void {
        this.networkMode = networkMode;
    }

    setCurrentCamera(camera: Camera): void {
        this.currentCamera = camera;
    }

    getCurrentCamera(): Camera | undefined {
        return this.currentCamera;
    }

    protected setControllerTypeForPlayer<T extends Controller>(
        controllerCtor: Constructor<T> | null
    ): void {
        console.log("Setting controller type for player");
        this.controllerTypeForPlayer = controllerCtor;
    }

    setIsDebug(enabled: boolean): void {
        this.debugMeshes = enabled;
        this.useDebugLogging = enabled;
    }

    getLocalPlayerState(): PlayerState | undefined {
        return this.players.find(player => player.isLocal);
    }

    aabbCast<T extends Actor>(
        point: Vector2,
        includeStatic: boolean = true,
        includeDynamic: boolean = true,
        ctor?: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)
    ): T[] {
        if (!this.world) {
            return [];
        }
        const targetCtor = (ctor ?? (Actor as unknown as new (...args: any[]) => T));
        return this.world.aabbCast(point, includeStatic, includeDynamic, targetCtor) as T[];
    }

    rayCast<T extends Actor>(
        start: Vector2,
        end: Vector2,
        includeStatic: boolean = true,
        includeDynamic: boolean = true,
        ctor?: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)
    ): T[] {
        if (!this.world) {
            return [];
        }

        const targetCtor = (ctor ?? (Actor as unknown as new (...args: any[]) => T));
        return this.world.rayCast(start, end, includeStatic, includeDynamic, targetCtor) as T[];
    }

    radialCast<T extends Actor>(
        start: Vector2,
        radius: number,
        includeStatic: boolean = true,
        includeDynamic: boolean = true,
        ctor?: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)
    ): T[] {
        if (!this.world) {
            return [];
        }
        const targetCtor = (ctor ?? (Actor as unknown as new (...args: any[]) => T));
        return this.world.radialCast(start, radius, includeStatic, includeDynamic, targetCtor) as T[];
    }

    getDebugPhysics(): boolean { return this.debugMeshes; }

    getTimerManager(): TimerManager { return this.timerManager; }

    bindClientRpc(name: string, func: Function): void { this.clientRpcs.set(name, func); }

    bindServerRpc(name: string, func: Function): void { this.serverRpcs.set(name, func); }

    callClientRpc<T>(name: string, ...args: any[]): T | null {
        const rpc = this.clientRpcs.get(name);
        if (rpc) {
            return rpc(...args) as T;
        }

        return null;
    }

    startup(): void {
        if (this.networkMode === "server") {
            this.netEndpoint?.connect((_socket: any, req: any) => {
                console.log(`New connection: ${req.socket.remoteAddress}`);
            });

            this.netEndpoint?.onMessage<any>("input", (data) => {
                console.log("Received player input:", data);
            });

                    // Start server timers
            this.timerManager.setTimer(() => {
                this.handleNetworkTick();
            }, 1000 / this.netTickRate, true); // 60 Hz server tick);
        }

        // Initialize all renderers
        // const renderers = listRenderers()
    }

    public addPlayer(player: PlayerState): void {
        this.players.push(player);
        if(this.controllerTypeForPlayer)
            player.setController(this.container.get(this.controllerTypeForPlayer));
    }

    protected handleNetworkTick(): void {

    }

    shutdown(): void { this.netEndpoint?.disconnect(); }

    callServerRpc<T>(name: string, ...args: any[]): T | null {
        const rpc = this.serverRpcs.get(name);
        if (rpc) {
            return rpc(...args) as T;
        }

        return null;
    }

    private getActorsFlattened(actor: BaseObject): Actor[] {
        const actors: Actor[] = [];

        for (const child of actor.getChildrenOfType(Actor)) {
            actors.push(child);
            const children = this.getActorsFlattened(child);

            if (children.length === 0) continue;

            actors.push(...children);
        }
        return actors;
    }

    // Should be called once every "frame" to progress the world
    // If you calculate deltaTime yourself, you can pass it in as an argument
    tick(): void {
        const now = performance.now();

        if(this.lastTickTime === 0){
            this.lastTickTime = now;
        }
    
        this.deltaTime = (now - this.lastTickTime) / 1000; // seconds
        this.lastTickTime = now;

        this.tickTimerManager(this.deltaTime);

        this.players.forEach(player => {
            player.getController()?._tick(this.deltaTime);
        });
        this.tickActorsAndWorld(this.deltaTime);

        // Update spatial partition (simple: reinsert/move all for now; can optimize with dirty flags later)
        // if (this.spatialEnabled) {
        //     const actors = this.rootObject.getChildrenOfType(Actor);
        //     for (const a of actors) {
        //         this.spatialGrid.update(a); // update handles insert/move
        //     }
        // }

        // server
        if (this.networkMode === "server") {
            this.serverTick(this.deltaTime);
        } else if (this.networkMode === "client") {
            this.clientTick(this.deltaTime);
        } else {
            this.singlePlayerTick(this.deltaTime);
        }
    }

    private getFlattenedActors() : Actor[] {
        const actors: Actor[] = [];

        for (const child of this.rootObject.getChildrenOfType(Actor)) {
            actors.push(child);
            const children = this.getActorsFlattened(child);
            if (children.length === 0) continue;
            actors.push(...children);
        }
        return actors;
    }

    // this is called to render the current state of the world
    // Should be called as often as possible usualy after every tick
    render(gl: WebGL2RenderingContext): void {
        this.frameId++;
        const actors = this.getFlattenedActors();

        // Order actors based on their layer (lower layers drawn first)
        const sortedActors = actors.sort((a, b) => a.layer - b.layer);

        const camera = this.currentCamera;
        let frustum: Frustum | undefined;
        if (camera) {
            const canvasWidth = gl.canvas.width || 1;
            const canvasHeight = gl.canvas.height || 1;
            const aspectRatio = canvasHeight === 0 ? 1 : canvasWidth / canvasHeight;
            camera.getViewProjectionMatrix(aspectRatio);
            frustum = camera.getFrustum();
        }

        // Loop actors: frustum cull and render main pass immediately
        for (const actor of sortedActors) {
            const shouldRender = !frustum || this.world.checkWithinBounds(actor, frustum);
            if (shouldRender) {
                actor.setIsRendering(true);
                this.renderActor(actor, gl);
            } else {
                actor.setIsRendering(false);
            }
        }

        // Second pass: draw debug overlays on top so they always appear above main pass
        if (this.debugMeshes && this.currentCamera) {
            const wasDepthEnabled = gl.isEnabled(gl.DEPTH_TEST);
            gl.disable(gl.DEPTH_TEST);
            for (const actor of actors) {
                this.renderActorDebug(actor, gl);
            }
            if (wasDepthEnabled) gl.enable(gl.DEPTH_TEST);
        }
    }

    private renderActor(actor: Actor, gl: WebGL2RenderingContext): void {
        const ctor = Object.getPrototypeOf(actor).constructor;
        let renderer = this.rendererCache.get(ctor);


        if (!renderer) {
            renderer = this.getRendererForActor(actor);
            this.rendererCache.set(ctor, renderer);
        }
        if (renderer) {
            renderer.render(actor, this.currentCamera, gl, this.debugMeshes);
        }
    }

    private getRendererForActor<TActor extends Actor>(actor: TActor): ActorRenderer<TActor> | null {
        const ctor = Object.getPrototypeOf(actor).constructor;
        let renderer = this.rendererCache.get(ctor);
        if (!renderer) {
            renderer = this.container.getByIdentifier<ActorRenderer<TActor>>(ctor.name + "Renderer");
        }
        if(!renderer) {
            renderer = this.container.getByIdentifier<ActorRenderer<TActor>>("BaseActorRenderer");
        }
        return renderer;
    }


    private renderActorDebug(actor: Actor, gl: WebGL2RenderingContext, skipChildren?: boolean): void {
        const renderer = this.getRendererForActor(actor);

        if (!renderer) {
            return;
        }

        renderer.renderDebug?.(actor, this.currentCamera!, gl);

        if (!skipChildren) {
            for (const child of actor.getChildrenOfType(Actor)) {
                this.renderActorDebug(child, gl);
            }
        }
    }

    public getFPS(): number {
        return this.fps;
    }
    
    public finishFrame(): void {
        const maxFrames = 240;
        const now = performance.now();

        if (this.lastFrameTime === 0) {
            // Prime FPS timer first call
            this.lastFrameTime = now;
        } else {
            const frameDuration = now - this.lastFrameTime; // ms for full frame (tick+render)
            this.lastFrameTime = now;

            this.frameTimes.push(frameDuration);
            if (this.frameTimes.length > maxFrames) {
                this.frameTimes.shift();
            }

            const total = this.frameTimes.reduce((a,b)=>a+b,0);
            const averageFrameTime = total / this.frameTimes.length; // ms
            if (averageFrameTime > 0) {
                this.fps = 1000 / averageFrameTime;
            }
        }

        for (const callback of this.afterRenderCallbacks.values()) {
            callback();
        }
    }

    private singlePlayerTick(_deltaTime: number): void {
        // Tick UI
    }

    private clientTick(_deltaTime: number): void {
        // Tick UI
        // Despawn actors that are have status of killed
        const actors = this.getActorsFlattened(this.rootObject);
        for (const actor of actors) {
            if (actor.isMarkedForDespawn) {
                this.despawnActor(actor);
                // this.world?.despawnActor(actor);
            }
        }

    }

    private despawnActor(actor: Actor): void {
        for (const child of actor.getChildrenOfType(Actor)) {
            this.despawnActor(child);
        }
        actor.onDespawned();
        actor.getParent()?.removeChild(actor);
        this.world?.despawnActor(actor);
    }

    private serverTick(_deltaTime: number): void {

    }

    private tickTimerManager(_deltaTime: number): void {
        this.timerManager.tick();
    }

    public getActorsCount(): number {
        const flattenedActors = this.getActorsFlattened(this.rootObject);
        return flattenedActors.length;
    }

    private tickActorsAndWorld(_deltaTime: number): void {

        const flattenedActors = this.getActorsFlattened(this.rootObject);
        const tickingActors = flattenedActors
            .filter(a => a.shouldTick) || [];

        tickingActors
            .filter(a => a.tickGroup === "default")
            .forEach(actor => actor._tick(this.deltaTime, this.networkMode));

        this.world?._tick(1/120); // Physics tick at a fixed rate of 120Hz

        tickingActors
            .filter(a => a.tickGroup === "post-physics")
            .forEach(actor => actor._tick(this.deltaTime, this.networkMode));

        const replicatingActors = flattenedActors.filter(a => a.shouldReplicate) || [];

        if (this.networkMode === "server") {
            // Handle client-side prediction and reconciliation
            for (const _actor of replicatingActors) {
                // Handle client-side prediction and reconciliation
            }
        }

        if(this.networkMode === "client") {
            
        }
    }

    getCurrentLevel(): Level | undefined {
        return this.currentMap;
    }

    async loadLevelObject(level: Level): Promise<void> {
        if (!level) {
            throw new Error("Invalid level object");
        }
        
        this.currentMap = level;

        this.rootObject.addChildren(level.getActors());

        await this.spawnLevelActors();
        
        this.currentGameMode = this.container.getByIdentifier<GameMode>(level.getGameMode()?.name ?? "DefaultGameMode");
        this.setControllerTypeForPlayer(this.currentGameMode.playerControllerType ?? null);
                
        this.world.setGravity(level.getGravity());
        
        for(const player of this.players) {
            if(this.controllerTypeForPlayer)
                player.setController(this.container.get(this.controllerTypeForPlayer));
        }
    }

    // Load a level from a given path (URL or local path)
    // Once loaded, spawns all actors in the world
    // Adding actors to the level after it has been loaded does not cause them to spawn
    async loadLevel(levelPath: string): Promise<void> {
        if (!levelPath || levelPath.length === 0) {
            throw new Error("Invalid level path");
        }

        // Check if string is a valid URL
    
        if (Url.isValidUrl(levelPath)) {
            // Load from URL
            return;
        } 
        
        // or a local path
        
        // Spawn actors in the world

        if (!this.currentMap) {
            throw new Error("No level loaded");
        }
      
        const actors = this.rootObject.getChildrenOfType(Actor);
        for (const actor of actors) {
            console.log("Loading actor:", actor.getId());
            await actor.onLoad();
        }

        await this.spawnLevelActors();
    }

    async spawnActor<TActor extends Actor>(ctor: Constructor<TActor>, parent?: Actor, position?: Vector2, properties?: Record<string, any>): Promise<TActor> {
        if (!this.world) {
            throw new Error("No world loaded");
        }

        const actor = this.container.get<TActor>(ctor);
        if (properties)
            actor.applyProperties(properties);

        actor.initialize();

        if(parent)
            parent.addChild(actor);
        else
            this.rootObject.addChild(actor);

        if(position !== undefined)
            actor.setPosition(position);

        this.world.spawnActor(actor, actor.getPosition());
        const children = actor.getChildrenOfType(Actor);
        for(const child of children) {
            await this.spawnActorInstance(child, actor);
        }
        actor.onSpawned();

        return actor;
    }

     async spawnActorInstance(actor: Actor, parent?: Actor, position?: Vector2): Promise<void> {
        if (!this.world) {
            throw new Error("No world loaded");
        }

        if(parent)
            parent.addChild(actor);
        else
            this.rootObject.addChild(actor);

        if(position !== undefined)
            actor.setPosition(position);


        this.world.spawnActor(actor, actor.getPosition());
        const children = actor.getChildrenOfType(Actor);
        for(const child of children) {
            await this.spawnActorInstance(child, actor);
        }
        actor.onSpawned();
        // if (this.spatialEnabled) {
        //     this.spatialGrid.insert(actor);
        // }
    }

    private async spawnLevelActors(): Promise<void> {
        const actors = this.rootObject.getChildrenOfType(Actor);

        await Promise.all(actors.map(actor => actor.onLoad()));

        for (const actor of actors) {
            await this.spawnActorInstance(actor);
            actor.onSpawned();
        }
    }
}
