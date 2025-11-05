import { SoundManager } from "./audio";
import { Engine, EngineNetworkMode } from "./engine";
import { Endpoint } from "./network";
import { Constructor, IContainer } from "./utils";
import { World } from "./world";

export class EngineBuilder<TSocket, TReq> {
    // Implementation of the EngineBuilder class

    private world: World | null = null;
    private endPoint: Endpoint<TSocket, TReq> | undefined = undefined;
    private networkMode: EngineNetworkMode = "singleplayer";
    private soundManager: SoundManager | null = null;

    constructor(private container: IContainer) {
        // Initialize any necessary properties
    }

    withWorld(world: World): EngineBuilder<TSocket, TReq> {
        this.container.registerSingletonInstance<World>(World, world);
        this.world = world;
        return this;
    }

    withWorldType<T extends World>(ctor: Constructor<T>): EngineBuilder<TSocket, TReq> {
        this.container.registerSingleton<World, T>(World, ctor);
        this.world = this.container.get<T>(ctor);
        return this;
    }


    addSingleton<TAbstract, TConcrete extends TAbstract>(ctor: Constructor<TConcrete>, ctor2: Constructor<TConcrete>): EngineBuilder<TSocket, TReq> {
        this.container.registerSingleton<TAbstract, TConcrete>(ctor, ctor2);
        return this;
    }

    addSingletonInstance<TAbstract>(instance: TAbstract): EngineBuilder<TSocket, TReq> {
        return this;
    }

    asLocalSinglePlayer(): EngineBuilder<TSocket, TReq> {
        // Configure the engine for local single-player mode
        this.endPoint = undefined;
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

    build(): Engine<TSocket, TReq> {

        if (!this.world) {
            throw new Error("World must be set before building the engine.");
        }

        // Build and return an Engine instance
        return new Engine<TSocket, TReq>(this.world, this.endPoint, this.networkMode);
    }
}