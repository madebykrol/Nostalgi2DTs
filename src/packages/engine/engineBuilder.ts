import { SoundManager } from "./audio";
import { Engine, EngineNetworkMode } from "./engine";
import { Endpoint } from "./network";
import { ActorRenderer } from "./rendering";
import { Constructor, Container, InversifyContainer } from "./utils";
import { Actor, World } from "./world";
import { InputManager } from "./input";
import { GameMode } from "./game/gameMode";

export class EngineBuilder<TSocket, TReq> {
   
    // Implementation of the EngineBuilder class
    private networkMode: EngineNetworkMode = "singleplayer";
    private useDebugLogging: boolean = false;
    public readonly container: Container;

    constructor(container?: Container) {
        // Initialize any necessary properties
        if (container) {
            this.container = container;
            
        } else {
            this.container = new InversifyContainer();
        }

        this.container.registerSingletonInstance(Container, this.container);
    }

    withEndpointInstance(endpoint: Endpoint<TSocket, TReq>): EngineBuilder<TSocket, TReq> {
        this.container.registerSingletonInstance<Endpoint<TSocket, TReq>>(Endpoint<TSocket, TReq>, endpoint);
        return this;
    }

    withWorldInstance(world: World): EngineBuilder<TSocket, TReq> {
        this.container.registerSingletonInstance<World>(World, world);
        return this;
    }

    withPlayerController<TPlayerController>(ctor: Constructor<TPlayerController>): EngineBuilder<TSocket, TReq> {
        this.container.registerSingleton<TPlayerController, TPlayerController>(ctor, ctor);
        return this;
    }

    withGameMode(ctor: Constructor<GameMode>) : EngineBuilder<TSocket, TReq> 
    {
        this.container.registerSelf<GameMode>(ctor, ctor.name);
        return this;
    }

    withInputManager<T extends InputManager>(DefaultInputManager: Constructor<T>) : EngineBuilder<TSocket, TReq> {
        this.container.registerSingleton(InputManager, DefaultInputManager);
        return this;
    }

    withWorld<T extends World>(ctor: Constructor<T>): EngineBuilder<TSocket, TReq> {
        this.container.registerSingleton<World, T>(World, ctor);
        return this;
    }

    asSinglePlayer(_playerName: string, _playerId: string): EngineBuilder<TSocket, TReq> {
        // Configure the engine for local single-player mode
        this.networkMode = "singleplayer";
        return this;
    }

    asServer(_serverName: string): EngineBuilder<TSocket, TReq> {
        // Configure the engine for server mode
        this.networkMode = "server";
        return this;
    }

    asClient(): EngineBuilder<TSocket, TReq> {
        // Configure the engine for client mode
        this.networkMode = "client";
        return this;
    }

    withNetworkEndpoint(_endpoint: Endpoint<TSocket, TReq>, mode: EngineNetworkMode): EngineBuilder<TSocket, TReq> {
        // Configure the engine with a network endpoint

        this.container.registerSingletonInstance<Endpoint<TSocket, TReq>>(Endpoint<TSocket, TReq>, _endpoint);
        this.networkMode = mode;
        return this;
    }

    withSoundManager(ctor: Constructor<SoundManager>): EngineBuilder<TSocket, TReq> {
        this.container.registerSingleton(ctor, ctor);
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
        engine.setNetworkMode(this.networkMode);
        engine.setIsDebug(this.useDebugLogging);



        return engine;
    }
}