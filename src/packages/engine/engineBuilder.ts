import { DemoActor } from "../example/actors/demo";
import { SoundManager } from "./audio";
import { Engine, EngineNetworkMode } from "./engine";
import { PlayerState } from "./game";
import { Endpoint } from "./network";
import { ActorRenderer } from "./rendering";
import { Constructor, Container } from "./utils";
import { Actor, World } from "./world";

export class EngineBuilder<TSocket, TReq> {
    // Implementation of the EngineBuilder class

    private world: World | null = null;
    private endPoint: Endpoint<TSocket, TReq> | undefined = undefined;
    private networkMode: EngineNetworkMode = "singleplayer";
    private soundManager: SoundManager | null = null;
    private playerControllerCtor: Constructor<any> | null = null;
    private localPlayerName = "Player";
    private localPlayerId = "player1"
    private useDebugLogging: boolean = false;

    constructor(private container: Container) {
        // Initialize any necessary properties
    }

    withEndpoint(endpoint: Endpoint<TSocket, TReq>): EngineBuilder<TSocket, TReq> {
        this.container.registerSingletonInstance<Endpoint<TSocket, TReq>>(Endpoint<TSocket, TReq>, endpoint);
        return this;
    }

    withWorld(world: World): EngineBuilder<TSocket, TReq> {
        this.container.registerSingletonInstance<World>(World, world);
        return this;
    }

    withPlayerController<TPlayerController>(ctor: Constructor<TPlayerController>): EngineBuilder<TSocket, TReq> {
        this.container.registerSingleton<TPlayerController, TPlayerController>(ctor, ctor);

        this.playerControllerCtor = ctor;
        return this;
    }

    withWorldType<T extends World>(ctor: Constructor<T>): EngineBuilder<TSocket, TReq> {
        this.container.registerSingleton<World, T>(World, ctor);
        this.world = this.container.get<T>(ctor);
        return this;
    }


    asLocalSinglePlayer(playerName: string, playerId: string): EngineBuilder<TSocket, TReq> {
        // Configure the engine for local single-player mode
        this.endPoint = undefined;
        this.networkMode = "singleplayer";
        this.localPlayerName = playerName;
        this.localPlayerId = playerId;
        return this;
    }

    withNetworkEndpoint(endpoint: Endpoint<TSocket, TReq>, mode: EngineNetworkMode): EngineBuilder<TSocket, TReq> {
        // Configure the engine with a network endpoint
        this.endPoint = endpoint;
        this.networkMode = mode;
        return this;
    }

    withSoundManager(soundManager: SoundManager): EngineBuilder<TSocket, TReq> {
        this.container.registerSingletonInstance<SoundManager>(SoundManager, soundManager);
        this.soundManager = soundManager;
        return this;
    }

    withDefaultRenderer(renderer: Constructor<ActorRenderer<Actor>>): EngineBuilder<TSocket, TReq> {
      this.container.registerSelf(renderer, "BaseActorRenderer");
      return this;
    }

    withDebugLogging() : EngineBuilder<TSocket, TReq> {
      this.useDebugLogging = true;
      return this;
    }

    withActor<TActor extends Actor>(ctor: Constructor<TActor>, renderer?: Constructor<ActorRenderer<TActor>>): EngineBuilder<TSocket, TReq> {
        this.container.registerSelf<TActor>(ctor, ctor.name);

        if (renderer) {
            this.container.registerSelf(renderer, ctor.name + "Renderer");
            this.container.get(ActorRenderer<TActor>);
        }

        return this;
    }


    build<TEngine extends Engine<TSocket, TReq>>(ctor: Constructor<TEngine>): TEngine {

        this.container.registerSingleton(Engine<TSocket, TReq>, ctor);
        const engine = this.container.get(Engine<TSocket, TReq>) as TEngine;
        engine.setIsDebug(this.useDebugLogging);
        engine.setControllerTypeForPlayer(this.playerControllerCtor);
        if (this.networkMode === "singleplayer") {
            engine.addPlayer(new PlayerState(this.localPlayerId, this.localPlayerName));
        }

        return engine;
    }
}