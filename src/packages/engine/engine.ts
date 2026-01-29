import { Camera } from "./camera";
import { Actor, World, Component } from "./world";
import { Level } from "./level";
import { PlayerState, Controller } from "./game";
import { TimerManager, Constructor, Container, injectable, StringUtils, inject, normalizeClassName, getRegisteredPropertiesForInstance, Property } from "./utils";
import { Vector2 } from "./math";
import { Endpoint } from "./network/endpoint";
import { InputManager } from "./input/inputmanager";
import { MeshComponent, PostProcessingVolumeActor, PostProcessMaterial } from "./rendering";
import { GameMode } from "./game/gameMode";
import { EditorActor } from "./editor/editorActor";
import { AssetLoader} from "./assets/assetService";
import { GUIManager } from "./ui/guiManager";
import { GUIComponentRegistry } from "./ui/guiComponentRegistry";
import { GUIModuleRegistry } from "./ui/uiModuleRegistry";
import { LevelParser } from "./level/levelParser";
import { BaseObject, SceneNode } from "./world/baseobject";

export type EngineNetworkMode = "client" | "server" | "singleplayer";

export type PostProcessingTarget = {
    framebuffer: WebGLFramebuffer;
    colorTexture: WebGLTexture;
    depthBuffer: WebGLRenderbuffer;
    width: number;
    height: number;
}

@injectable()
export class Engine {
    getContainer(): Container {
        return this.container;
    }

    afterRenderCallbacks: Map<string, (() => void)> = new Map();
    currentGameMode: GameMode | undefined;
    asEditor: boolean = false;

    onAfterRender(afterRenderHandle: (() => void)): string {
      // Add a callback to be called after rendering is complete
      const id = Math.random().toString(36).substr(2, 9);
      this.afterRenderCallbacks.set(id, afterRenderHandle);
      return id;
    }

    offAfterRender(id: string): void {
      this.afterRenderCallbacks.delete(id);
    }

    public static instance: Engine;

    protected currentCamera: Camera | undefined;
    protected lastFrameTime: number = 0; // used ONLY for FPS measurement (updated in finishFrame)
    protected lastTickTime: number = 0;  // used for simulation delta (updated in tick)
    protected fps: number = 0;
    protected deltaTime: number = 0;
    protected currentMap: Level | undefined;

    protected netTickRate = 120;
    protected maxFrames = 240;

    protected clientRpcs: Map<string, Function> = new Map();
    protected serverRpcs: Map<string, Function> = new Map();

    protected inputManager: InputManager | undefined = undefined;

    protected frameTimes: number[] = [];
    private frameId: number = 0; // increments every render pass
    private postProcessTarget?: PostProcessingTarget;
    // private spatialGrid: SpatialGrid = new SpatialGrid(10);
    public debugMeshes: boolean = false; // show physics debug outlines
    public useDebugLogging: boolean = false;
    public showDebugGrid: boolean = false;

    players: PlayerState[] = [];
    controllers: Controller[] = [];

    public readonly guiManager: GUIManager = new GUIManager();
    public readonly componentRegistry: GUIComponentRegistry = new GUIComponentRegistry();
    public readonly uiModuleRegistry: GUIModuleRegistry = new GUIModuleRegistry();

    rootObject: SceneNode = new SceneNode();
    editorRootObject: SceneNode = new SceneNode();

    private controllerTypeForPlayer: Constructor<Controller> | null = null;

    constructor(
        protected world: World,
        protected netEndpoint: Endpoint | undefined,
        protected networkMode: EngineNetworkMode = "singleplayer",
        protected container: Container,
        protected timerManager: TimerManager) {
    }

    setNetworkMode(networkMode: EngineNetworkMode): void {
        this.networkMode = networkMode;
    }

    getNetworkMode(): EngineNetworkMode {
        return this.networkMode;
    }

    setCurrentCamera(camera: Camera): void {
        this.currentCamera = camera;
    }

    getCurrentCamera(): Camera | undefined {
        return this.currentCamera;
    }

    getRootActors(): Actor[] {
        return this.rootObject.getChildrenOfType(Actor);
    }

    getWorld(): World {
        return this.world;
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
        const targetCtor = Engine.getActorCtor<T>(ctor);
        return this.world.aabbCast(point, includeStatic, includeDynamic, targetCtor) as T[];
    }

    rayCast<T extends Actor>(
        start: Vector2,
        end: Vector2,
        includeStatic: boolean = true,
        includeDynamic: boolean = true,
        ctor?: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)
    ): T[] {
        const targetCtor = Engine.getActorCtor<T>(ctor);
        return this.world.rayCast(start, end, includeStatic, includeDynamic, targetCtor) as T[];
    }

    radialCast<T extends Actor>(
        start: Vector2,
        radius: number,
        includeStatic: boolean = true,
        includeDynamic: boolean = true,
        ctor?: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)
    ): T[] {
        const targetCtor = Engine.getActorCtor<T>(ctor);
        return this.world.radialCast<T>(start, radius, includeStatic, includeDynamic, targetCtor) as T[];
    }

    spawnActorInstance(actor: Actor, parent?: SceneNode, position?: Vector2): void {
        this.world.spawnActorInstance(actor, parent, position);
    }

    despawnActor(actor: Actor): void {
        this.world.despawnActor(actor);
    }

    createObject<T extends BaseObject>(ctor: Constructor<T>, id: string): T {
        var object = this.container.get(ctor) as T;
        object.id = id;
        return object;
    }

    createObjectFromIdentifier<T extends BaseObject>(identifier: string, id: string): T {
        var object = this.container.getByIdentifier<T>(identifier)
        object.id = id;
        return object;
    }

    createActorFromIdentifier<T extends Actor>(identifier: string): T {
        return this.container.getByIdentifier<T>(identifier);
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

    compileMaterials(gl: WebGL2RenderingContext): void {
        // Compile all materials in the engine
        const actors = this.getFlattenedActors();

        actors.forEach(actor => {
            actor.getComponentsOfType(MeshComponent).forEach(component => {
                component.getMaterial().compile(gl);
            });
        });
    }

    public async loadLevel(levelPath: string, _levelProperties: any = {}): Promise<Level> {

        levelPath += !levelPath.toLowerCase().endsWith(".n2asset") ? ".n2asset" : "";

        var resourceLoader = this.container.get(AssetLoader);
        var levelParser = this.container.get(LevelParser);

        var levelAsset = await resourceLoader.loadAsset(levelPath);

        const manifest = levelAsset.manifest;
        if (!manifest) {
            throw new Error(`Asset manifest is missing in level asset ${levelPath}`);
        }

        const rootEntry = levelAsset.getRootEntry();

        if (!rootEntry) {
            throw new Error(`No root entry found in level asset ${levelPath}`);
        }
        const payloadBytes = rootEntry.bytes;
        const text = StringUtils.DecodeUtf(payloadBytes);

        return levelParser.deserializeLevel(text)!;
    }

    run(asEditor: boolean = false): void {
        Engine.instance = this;
        this.setEditorMode(asEditor);
        this.ensureInputManager();
        this.configurePlayerControllers();
        
        for (const actor of this.getFlattenedActors()) {
            actor.onBeginPlay();
        }

        var playerStart = this.currentGameMode?.pickPlayerStart();
        if (playerStart) {
            console.log(`Spawning local player at start: ${playerStart.getId()}`);

            const localPlayer = this.getLocalPlayerState();
            this.currentGameMode?.spawnPawnForPlayer(localPlayer!);
        }

        if (this.networkMode === "server") {
            this.runServer();
            return 
        }

        if (this.asEditor) {
            console.log("Running in editor mode");
            return;
        }

        this.uiModuleRegistry.activateForLevel(this.getCurrentLevel()!, {
            guiManager: this.guiManager,
            componentRegistry: this.componentRegistry,
            engine: this,
            level: this.getCurrentLevel()!,
        }, this.asEditor);
    }

    setEditorMode(asEditor: boolean): void {
        this.asEditor = asEditor;
        this.world?.setEditorMode(asEditor);
    }

    private runServer(): void {

        if (!this.netEndpoint) {
            console.error("No network endpoint defined for server mode");
            return;
        }
        this.netEndpoint.connect((_socket: any, req: any) => {
            console.log(`New connection: ${req.socket.remoteAddress}`);
        });

        this.netEndpoint.onMessage<any>("input", (data) => {
            console.log("Received player input:", data);
        });

        // Start server timers
        this.timerManager.setTimer(() => {
            this.handleNetworkTick();
        }, 1000 / this.netTickRate, true);
    }
    
    // this is called to render the current state of the world
    // Should be called as often as possible usualy after every tick
    render(gl: WebGL2RenderingContext): void {
        this.frameId++;
        const actors = this.getFlattenedActors();

        if (this.asEditor) {
            actors.push(...this.getEditorActorsFlattened(this.editorRootObject));
        }

        // Order actors based on their layer (lower layers drawn first)
        const sortedActors = actors.sort((a, b) => a.layer - b.layer);

        if (!this.currentCamera) {
            console.warn("No camera set for engine rendering. Skipping frame");
            return;
        }

        const camera = this.currentCamera;
        const canvasWidth = gl.canvas.width || 1;
        const canvasHeight = gl.canvas.height || 1;
        const aspectRatio = canvasHeight === 0 ? 1 : canvasWidth / canvasHeight;

        camera.setViewportSize(canvasWidth, canvasHeight);
        camera.getViewProjectionMatrix(aspectRatio);

        const postProcessComponents: MeshComponent[] = [];

        for (const actor of sortedActors) {
            const meshComponents = actor.getComponentsOfType(MeshComponent);
            for (const component of meshComponents) {
                if (component.getRenderPass() !== "postprocess") {
                    continue;
                }
                if (!this.shouldApplyPostProcess(component, camera)) {
                    continue;
                }
                postProcessComponents.push(component);
            }
        }

        const hasPostProcess = postProcessComponents.length > 0;
        const postProcessTarget = hasPostProcess
            ? this.ensurePostProcessTarget(gl, canvasWidth, canvasHeight)
            : undefined;

        // Bind the appropriate framebuffer: offscreen when post-processing, otherwise default
        gl.bindFramebuffer(gl.FRAMEBUFFER, hasPostProcess ? postProcessTarget!.framebuffer : null);
        gl.viewport(0, 0, canvasWidth, canvasHeight);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

       

        // Render forward pass into the current framebuffer (FBO if post-process, default otherwise)
        for (const actor of sortedActors) {

            const shouldRender = camera.getFrustum().checkWithinBounds(actor);

            if (shouldRender) {

                actor.setIsRendering(true);
                const meshComponents = actor.getComponentsOfType(MeshComponent);
                for (const component of meshComponents) {
                    if (component.getRenderPass() !== "forward") {
                        continue;
                    }
                    component.render(gl, camera, "forward");
                }

            } else {
                actor.setIsRendering(false);
            }
        }

        if (hasPostProcess) {
            const wasDepthEnabledForForward = gl.isEnabled(gl.DEPTH_TEST);

            // Resolve to default framebuffer for post-processing pass
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvasWidth, canvasHeight);
            if (wasDepthEnabledForForward) {
                gl.disable(gl.DEPTH_TEST);
            }

            const sceneSize = { width: canvasWidth, height: canvasHeight };
            for (const component of postProcessComponents) {
                const material = component.getMaterial();
                if (material instanceof PostProcessMaterial) {
                    material.prepare(gl, camera, sortedActors, sceneSize);
                }
                component.renderPostProcess(gl, camera, postProcessTarget!.colorTexture, sceneSize);
            }

            if (wasDepthEnabledForForward) {
                gl.enable(gl.DEPTH_TEST);
            }
        }

        const cameraForOverlays = camera;
        const hasCameraForOverlays = !!cameraForOverlays;
        const shouldRenderDebug = this.debugMeshes && hasCameraForOverlays;
        let depthDisabled = false;
        const wasDepthEnabled = gl.isEnabled(gl.DEPTH_TEST);

        if (shouldRenderDebug && cameraForOverlays) {
            gl.disable(gl.DEPTH_TEST);
            depthDisabled = true;
            for (const actor of actors) {
                this.renderActorDebug(actor, gl, cameraForOverlays);
            }
        }

        if (depthDisabled && wasDepthEnabled) {
            gl.enable(gl.DEPTH_TEST);
        }
    }

    public addPlayer(player: PlayerState): void {
        this.players.push(player);
        this.configurePlayerControllers();
    }

    public getFPS(): number {
        return this.fps;
    }
    
    public finishFrame(): void {
        const maxFrames = this.maxFrames;
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

    shutdown(): void { 
        this.netEndpoint?.disconnect();
        this.timerManager.clearAllTimers();
        this.world.resetForces();
     }

    callServerRpc<T>(name: string, ...args: any[]): T | null {
        const rpc = this.serverRpcs.get(name);
        if (rpc) {
            return rpc(...args) as T;
        }

        return null;
    }

    // Should be called once every "frame" to progress the world
    tick(): void {
        if(this.asEditor)
            this.editorTick();
        else
            this.gameTick();
    }

    // Load a level from a given path (URL or local path)
    // Once loaded, spawns all actors in the world
    // Adding actors to the level after it has been loaded does not cause them to spawn
    // async loadLevel(levelPath: string): Promise<void> {
    //     if (!levelPath || levelPath.length === 0) {
    //         throw new Error("Invalid level path");
    //     }

    //     // Check if string is a valid URL
    
    //     if (Url.isValidUrl(levelPath)) {
    //         // Load from URL
    //         return;
    //     } 
        
    //     // or a local path
        
    //     // Spawn actors in the world

    //     if (!this.currentMap) {
    //         throw new Error("No level loaded");
    //     }
      
    //     const actors = this.rootObject.getChildrenOfType(Actor);
    //     for (const actor of actors) {
    //         console.log("Loading actor:", actor.getId());
    //         await actor.onLoad();
    //     }

    //     await this.spawnLevelActors();
    // }

    loadLevelObject(level: Level): void {
        if (!level) {
            throw new Error("Invalid level object");
        }

        const existing = this.rootObject.getChildrenOfType(Actor);
        for (const actor of existing) {
            this.world?.despawnActor(actor);
        }
        
        this.currentMap = level;

        this.rootObject = level;

        this.spawnLevelActors();
        
        const requestedGameModeId = level.gameMode?.name ?? "DefaultGameMode";
        try {
            this.currentGameMode = this.container.getByIdentifier<GameMode>(requestedGameModeId);
            
        } catch (error) {
            console.warn(`Failed to resolve game mode '${requestedGameModeId}', falling back to null`, error);
            this.currentGameMode = undefined;
        }

        if (this.currentGameMode) {
            this.setControllerTypeForPlayer(this.currentGameMode.playerControllerType ?? null);
            this.currentGameMode.setCurrentLevel(level);
        } else {
            this.setControllerTypeForPlayer(null);
        }
                
        this.world.setGravity(level.gravity);
        
        // Activate UI modules for this level (skip when in editor)
        
        this.configurePlayerControllers();
    }

    public getActorsCount(): number {
        const flattenedActors = this.getActorsFlattened(this.rootObject);
        return flattenedActors.length;
    }

    public getRootObject(): SceneNode {
        return this.rootObject;
    }

    public getEditorRoot():SceneNode {
        return this.editorRootObject;
    }

    public getCurrentLevel(): Level | undefined {
        return this.currentMap;
    }

    public dispose(): void {
        this.shutdown();
        this.inputManager?.dispose();
        this.timerManager.dispose();

        this.rootObject.getChildrenOfType(Actor).forEach(actor => { this.despawnActor(actor); });
        this.rootObject.dispose();

        this.rootObject = new SceneNode();
    }
    
    protected handleNetworkTick(): void {

    }

    protected setControllerTypeForPlayer<T extends Controller>(
        controllerCtor: Constructor<T> | null
    ): void {
        console.log("Setting controller type for player");
        this.controllerTypeForPlayer = controllerCtor;
    }

    private static getActorCtor<T extends Actor>(ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T) | undefined) {
        return ctor ?? (Actor as unknown as new (...args: any[]) => T);
    }


    private getEditorActorsFlattened(actor: SceneNode): Actor[] {
        const actors: Actor[] = [];

        for (const child of actor.getChildrenOfType(EditorActor)) {
            actors.push(child);
            const children = this.getActorsFlattened(child);

            if (children.length === 0) continue;

            actors.push(...children);
        }
        return actors;
    }

    private getActorsFlattened(actor: SceneNode): Actor[] {
        const actors: Actor[] = [];

        for (const child of actor.getChildrenOfType(Actor)) {
            actors.push(child);
            const children = this.getActorsFlattened(child);

            if (children.length === 0) continue;

            actors.push(...children);
        }
        return actors;
    }

    private gameTick(): void {
        const now = performance.now();

        if(this.lastTickTime === 0){
            this.lastTickTime = now;
        }
    
        this.deltaTime = (now - this.lastTickTime) / 1000; // seconds
        this.lastTickTime = now;

        // despawn actors marked for despawn
        const allActors = this.getFlattenedActors();
        
        allActors.filter(a => a.isMarkedForDespawned()).forEach(a => {
            this.despawnActor(a);
            a.dispose();
        });

        this.tickTimerManager(this.deltaTime);

        this.players.forEach(player => {
            player.getController()?._tick(this.deltaTime);
        });

        this.tickActorsAndWorld(this.deltaTime);

        // server
        if (this.networkMode === "server") {
            this.serverTick(this.deltaTime);
        } else if (this.networkMode === "client") {
            this.clientTick(this.deltaTime);
        } else {
            this.singlePlayerTick(this.deltaTime);
        }

        this.currentGameMode?._tick(this.deltaTime);
    }
    private editorTick(): void {
        // Editor tick logic
        const flattenedActors = this.getEditorActorsFlattened(this.editorRootObject);
        const tickingActors = flattenedActors
            .filter(a => a.shouldTick) || [];

        tickingActors.forEach(actor => actor._tick(this.deltaTime, this.networkMode));
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

    private ensurePostProcessTarget(gl: WebGL2RenderingContext, width: number, height: number) {
        if (
            !this.postProcessTarget ||
            this.postProcessTarget.width !== width ||
            this.postProcessTarget.height !== height
        ) {
            if (this.postProcessTarget) {
                gl.deleteFramebuffer(this.postProcessTarget.framebuffer);
                gl.deleteTexture(this.postProcessTarget.colorTexture);
                gl.deleteRenderbuffer(this.postProcessTarget.depthBuffer);
            }

            const framebuffer = gl.createFramebuffer();
            const colorTexture = gl.createTexture();
            const depthBuffer = gl.createRenderbuffer();

            if (!framebuffer || !colorTexture || !depthBuffer) {
                throw new Error("Failed to allocate post-process framebuffer");
            }

            gl.bindTexture(gl.TEXTURE_2D, colorTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
            gl.framebufferRenderbuffer(
                gl.FRAMEBUFFER,
                gl.DEPTH_ATTACHMENT,
                gl.RENDERBUFFER,
                depthBuffer
            );

            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.bindTexture(gl.TEXTURE_2D, null);
                gl.bindRenderbuffer(gl.RENDERBUFFER, null);
                gl.deleteFramebuffer(framebuffer);
                gl.deleteTexture(colorTexture);
                gl.deleteRenderbuffer(depthBuffer);
                throw new Error(`Post-process framebuffer incomplete: 0x${status.toString(16)}`);
            }

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.bindRenderbuffer(gl.RENDERBUFFER, null);

            this.postProcessTarget = {
                framebuffer,
                colorTexture,
                depthBuffer,
                width,
                height,
            };
        }

        return this.postProcessTarget!;
    }

    private shouldApplyPostProcess(component: MeshComponent, camera: Camera): boolean {
        const owner = component.getActor();
        if (!owner || owner.isHiddenInGame) {
            return false;
        }

        if (owner instanceof PostProcessingVolumeActor) {
            return owner.containsCamera(camera);
        }

        return true;
    }
    
    private renderActorDebug(actor: Actor, gl: WebGL2RenderingContext, camera: Camera): void {
        const meshComponents = actor.getComponentsOfType(MeshComponent);
        for (const component of meshComponents) {
            component.renderDebug(gl, camera);
        }
    }

    private ensureInputManager(): InputManager | undefined {

        this.inputManager?.dispose();

        this.inputManager = this.container.get(InputManager);
        
        this.inputManager?.initialize();

        return this.inputManager;
    }

    private configurePlayerControllers(): void {
        if (!this.controllerTypeForPlayer) {
            return;
        }

        for (const player of this.players) {
            let controller = player.getController();

            
            controller = this.container.get(this.controllerTypeForPlayer);
            if (!controller) {
                continue;
            }
            player.setController(controller);
            

            if (this.asEditor) {
                controller.deactivate();
            } else {
                controller.activate();
            }
        }
    }

    private singlePlayerTick(_deltaTime: number): void {
    }

    private clientTick(_deltaTime: number): void {
        // Despawn actors that are have status of killed
        const actors = this.getActorsFlattened(this.rootObject);
        for (const actor of actors) {
            if (actor.isMarkedForDespawned()) {
                this.despawnActor(actor);
                // this.world?.despawnActor(actor);
            }
        }
    }

    private serverTick(_deltaTime: number): void {
        // Tick server timers

        // Tick replicated actors

        // Handle incomming RPCs from clients

        // send RPCs to clients
    }

    private tickTimerManager(_deltaTime: number): void {
        this.timerManager.tick(); // runs asynchronous timers
    }

    private tickActorsAndWorld(_deltaTime: number): void {

        const flattenedActors = this.getActorsFlattened(this.rootObject);
        const tickingActors = flattenedActors
            .filter(a => a.shouldTick) || [];

        tickingActors
            .filter(a => a.tickGroup === "default")
            .forEach(actor => actor._tick(this.deltaTime, this.networkMode));

        this.world?._tick(this.deltaTime); // Physics tick at a fixed rate of 120Hz

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

    private spawnLevelActors(): void {
        const actors = this.rootObject.getChildrenOfType(Actor);

        actors.map(actor => actor.onLoad());

        for (const actor of actors) {
            this.world.spawnActorInstance(actor);
        }
    }
}
