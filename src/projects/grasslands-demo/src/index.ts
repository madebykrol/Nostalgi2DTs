import type { EngineBuilder, ProjectRegistration } from "@nostalgi2d/engine";

import { ExampleTopDownRPGGameMode } from "./gameMode";
import { GrasslandsMap } from "./level";
import { TopDownRPGController } from "./controllers/topDownRPGController";
import { DemoActor, BombActor, DemoCharacter } from "./actors/demo";
import { GameTileMapActor } from "./actors/gameTileMapActor";
import { WallActor } from "./actors/wall";
import { SoundActor } from "./actors/soundactor";

// Re-exports for consumers (editor, server, packaged game runtime).
export { ExampleTopDownRPGGameMode } from "./gameMode";
export { GrasslandsMap } from "./level";
export { TopDownRPGController } from "./controllers/topDownRPGController";
export { DemoActor, BombActor, DemoCharacter } from "./actors/demo";
export { GameTileMapActor } from "./actors/gameTileMapActor";
export { WallActor } from "./actors/wall";
export { SoundActor } from "./actors/soundactor";

const grasslandsDemoProject: ProjectRegistration = {
    id: "grasslands-demo",
    title: "Grasslands Demo",
    startupLevel: "levels/grasslands",

    register(builder: EngineBuilder<unknown, unknown>): void {
        // Touch the @actor()-decorated classes so withDecoratedActors() picks them up.
        void DemoActor;
        void BombActor;
        void DemoCharacter;
        void GameTileMapActor;
        void WallActor;
        void SoundActor;

        builder
            .withGameMode(ExampleTopDownRPGGameMode)
            .withPlayerController(TopDownRPGController)
            .withLevel(GrasslandsMap)
            .withDecoratedActors();
    },
};

export default grasslandsDemoProject;
