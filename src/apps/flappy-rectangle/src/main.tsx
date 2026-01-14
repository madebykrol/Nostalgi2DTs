
import { DOMParser } from "@xmldom/xmldom";
import http from "http";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { Canvas } from "@repo/basicrenderer";
import { EngineContext } from "@repo/ui";
import {
  Vector2,
  EngineBuilder,
  SoundManager,
  OrthoCamera,
  PlayerState,
  TimerManager,
  GUIProvider,
  GUIRenderer,
  Level,
  AssetService,
  DefaultGameMode,
} from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import {
  FlappyRectangleGameMode,
  FlappyRectangleController,
  flappyUiModule,
  ExampleTopDownRPGGameMode,
  GrasslandsMap,
  TopDownRPGController,
} from "@repo/example";
import { Parser } from "@repo/tiler";
import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@repo/client";
import { GameResourceManager } from "./gameResourceManager";
const App = () => {
  const [engine, setEngine] = useState<ClientEngine | null>(null);
  const [engineReady, setEngineReady] = useState(false);

  useEffect(() => {
    // Begin performance timing
    const startTime = performance.now();
    
    const builder = new EngineBuilder<WebSocket, http.IncomingMessage>();
    builder
      .withTimerManager(TimerManager)
      .withWorldInstance(new PlanckWorld(undefined, builder.container))
      .withEndpointInstance(new ClientEndpoint("localhost", 3001))
      .withServiceInstance(DOMParser, new DOMParser())
      .withService(Parser)
      .withService(AssetService)

      .withInputManager(DefaultInputManager)
      .withSoundManager(SoundManager)
      .withGameMode(ExampleTopDownRPGGameMode)
      .withGameMode(DefaultGameMode)
      .withGameMode(FlappyRectangleGameMode)
      .withLevel(GrasslandsMap)
      .withLevel(Level)

      // Provide default UI module selection if desired; levels can override via uiModules property
      .withResourceManager(GameResourceManager)
      .withDecoratedActors()
      .withPlayerController(TopDownRPGController)
      .withPlayerController(FlappyRectangleController)
      .withDebugLogging()
      .asSinglePlayer("LocalPlayer", "local_player");

    const e = builder.build(ClientEngine);
    // Register UI modules once
    e.uiModuleRegistry.registerModule(flappyUiModule);

    // Make engine available to the Canvas compile callback immediately
    setEngine(e);
    
    // Log time to startup
    const endTime = performance.now();
    console.log(`Engine built in ${(endTime - startTime).toFixed(4)} ms`);

    const setupLevel = async () => {
      try {
        const level = await e.loadLevel("levels/new-level");
        const levelStartTime = performance.now();
        await e.loadLevelObject(level);

        // Explicitly (re)activate UI modules for this level to ensure entrypoints render
        e.uiModuleRegistry.activateForLevel(
          level,
          {
            guiManager: e.guiManager,
            componentRegistry: e.componentRegistry,
            engine: e,
            level,
          },
          /* isEditor */ false,
        );

        // Place camera slightly ahead so obstacles scroll toward the player
        e.setCurrentCamera(new OrthoCamera(new Vector2(0, 0), 1, 40));
        
        // Log time to load level 
        const levelEndTime = performance.now();
        console.log(`Level loaded in ${(levelEndTime - levelStartTime).toFixed(2)} ms`);

        e.addPlayer(new PlayerState("local_player", "LocalPlayer"));

        e.run(false);
        setEngineReady(true);
      } catch (error) {
        console.error("Failed to initialize level", error);
      }
    };

    setupLevel();
        

    return () => {
      // Cleanup if needed
    };
  }, []);

  const compile = (gl: WebGL2RenderingContext | null) => {
    console.log(engine, engineReady);
    if (gl && engine) {
      console.log("Compiling materials");
      engine.compileMaterials(gl);
    }
  }

  const draw = (gl: WebGL2RenderingContext | null) => {
    if (!engine || !engineReady) {
      return;
    }
    engine.tick();

    if (gl) {
      engine.render(gl);
    }

    engine.finishFrame();
  }

  return (
  <div style={{ width: "100vw", height: "100vh", margin: 0, padding: 0, overflow: "hidden" }}>
    <EngineContext.Provider value={engine}>
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <Canvas
          compile={compile}
          draw={draw}
          options={{ context: 'webgl2' }}
          className="block w-full h-full"
          style={{ width: '100%', height: '100%' }}
        />
        {engine && (
          <GUIProvider guiManager={engine.guiManager} componentRegistry={engine.componentRegistry}>
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
              {/* Render whatever modules registered for the level */}
              <GUIRenderer />
            </div>
          </GUIProvider>
        )}
      </div>
    </EngineContext.Provider>
  </div>
)};

createRoot(document.getElementById("app")!).render(<App />);
