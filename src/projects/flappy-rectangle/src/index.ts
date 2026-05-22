import type { EngineBuilder, Engine, ProjectRegistration } from "@nostalgi2d/engine";

import { FlappyRectangleController } from "./controllers/flappyRectangleController";
import { FlappyRectangleGameMode, FlappyRectangleCharacter } from "./gameMode";
import {
    FlappyRectangleObstacleActor,
    FlappyRectangleGapDetectorActor,
    FlayypRectangleObsticleGeneratorActor,
} from "./actors/obstacleGenerator";
import { flappyUiModule } from "./ui/flappyUiModule";
import { FLAPPY_UI_EVENTS } from "./events";

// Re-exports for consumers (editor, packaged game runtime) that still need
// the concrete classes for builder registration. Phase 4 will replace those
// direct references with the ProjectRegistration default export below.
export { FlappyRectangleController } from "./controllers/flappyRectangleController";
export { FlappyRectangleGameMode, FlappyRectangleCharacter } from "./gameMode";
export {
    FlappyRectangleObstacleActor,
    FlappyRectangleGapDetectorActor,
    FlayypRectangleObsticleGeneratorActor,
} from "./actors/obstacleGenerator";
export { flappyUiModule } from "./ui/flappyUiModule";
export {
    FlappyRectangleScoreUI,
    FlappyRectangleGameOverUI,
    FlappyRectangleStartUI,
    FlappyRectangleFlapButton,
} from "./ui/FlappyRectangleScoreUI";
export { FLAPPY_UI_EVENTS } from "./events";

const flappyRectangleProject: ProjectRegistration = {
    id: "flappy-rectangle",
    title: "Flappy Rectangle",
    startupLevel: "levels/new-level",

    register(builder: EngineBuilder<unknown, unknown>): void {
        // Touch the actor classes so their @actor() decorators run before
        // withDecoratedActors() collects them.
        void FlappyRectangleObstacleActor;
        void FlappyRectangleGapDetectorActor;
        void FlayypRectangleObsticleGeneratorActor;
        void FlappyRectangleCharacter;
        void FLAPPY_UI_EVENTS;

        builder
            .withGameMode(FlappyRectangleGameMode)
            .withPlayerController(FlappyRectangleController)
            .withDecoratedActors();
    },

    onEngineReady(engine: Engine): void {
        engine.uiModuleRegistry.registerModule(flappyUiModule);
    },
};

export default flappyRectangleProject;
