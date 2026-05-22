import type { EngineBuilder } from "./engineBuilder";
import type { Engine } from "./engine";

/**
 * A registration object describing one Nostalgi2D project (a "game" or
 * playable experience).
 *
 * Every folder under `projects/<id>` exports a default {@link ProjectRegistration}
 * from its `src/index.ts`. The runtime/editor calls
 * {@link ProjectRegistration.register} on its `EngineBuilder` so the project
 * can wire up its game modes, controllers, actors, services and other DI
 * bindings. After the engine is built the runtime/editor calls
 * {@link ProjectRegistration.onEngineReady} and then loads
 * {@link ProjectRegistration.startupLevel}.
 */
export interface ProjectRegistration {
    /** Unique kebab-case id, matches the folder name and the project manifest id. */
    readonly id: string;

    /** Human-readable title. */
    readonly title: string;

    /**
     * Path of the level to load on startup, relative to the project's content
     * root and without the `.n2asset` extension (e.g. `"levels/main"`).
     */
    readonly startupLevel: string;

    /**
     * Hook invoked once with the {@link EngineBuilder} that will produce the
     * engine. Use it to call `withGameMode`, `withPlayerController`,
     * `withDecoratedActors`, `withResourceManager`, etc.
     */
    register(builder: EngineBuilder<unknown, unknown>): void;

    /**
     * Optional hook invoked after the engine is built but before the startup
     * level is loaded. Use this to register UI modules, RPCs, or other things
     * that need the live engine instance.
     */
    onEngineReady?(engine: Engine): void;
}
