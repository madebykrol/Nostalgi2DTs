
import { DOMParser } from "@xmldom/xmldom";
import http from "http";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { Canvas } from "@repo/basicrenderer"
import { Header, Counter, EngineContext } from "@repo/ui";
import { 
  Vector2, 
  EngineBuilder, 
  SoundManager,
  OrthoCamera,
  PlayerState,
  DefaultResourceManager,
} from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import { BombActor, DemoActor, ExampleTopDownRPGGameMode, GameTileMapActor, GrasslandsMap, PlayerController, WallActor } from "@repo/example";
import { Parser }from "@repo/tiler";
import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@repo/client";
const App = () => {

  const ws = useRef<WebSocket>(null);
  const [engine, setEngine] = useState<ClientEngine | null>(null);

  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:3001/?userId=world");
    ws.current.addEventListener("open", () => {
      if(ws.current) {
        console.log("Sending data. We're open!")
        ws.current.send(JSON.stringify({ userid: "world" }))
      }
    });
    
    ws.current.addEventListener("message", (d) => console.log("msg:", JSON.stringify(d.data)));
  }, []);

  useEffect(() => {
    // Begin performance timing
    const startTime = performance.now();
    
    const demoActor = new DemoActor();
    demoActor.layer = 5;

    const builder = new EngineBuilder<WebSocket, http.IncomingMessage>();
    builder
      .withWorldInstance(new PlanckWorld())
      .withEndpointInstance(new ClientEndpoint("localhost", 3001))
      .withServiceInstance(DOMParser, new DOMParser())
      .withService(Parser)
      .withInputManager(DefaultInputManager)
      .withSoundManager(SoundManager)
      .withGameMode(ExampleTopDownRPGGameMode)
      .withResourceManager(DefaultResourceManager)
      .withActor(DemoActor)
      .withActor(GameTileMapActor)
      .withActor(BombActor)
      .withActor(WallActor)
      .withPlayerController(PlayerController<WebSocket, http.IncomingMessage>)
      .withDebugLogging()
      .asSinglePlayer("LocalPlayer", "local_player");

    const e = builder.build(ClientEngine);
    e.run(false);

    // Log time to startup
    const endTime = performance.now();
    console.log(`Engine built in ${(endTime - startTime).toFixed(4)} ms`);
    
    const level = new GrasslandsMap(builder.container);
    level.addActor(demoActor);

    const setupLevel = async () => {
      try {
        const levelStartTime = performance.now();
        await e.loadLevelObject(level);

        const worldSize = level.getWorldSize();

        if (worldSize) {
          const camera = new OrthoCamera(new Vector2(worldSize.x / 2, worldSize.y / 2), 1, 40);
          e.setCurrentCamera(camera);
        } else {
          e.setCurrentCamera(new OrthoCamera(new Vector2(0, 0), 1));
        }
        
        // Log time to load level 
        const levelEndTime = performance.now();
        console.log(`Level loaded in ${(levelEndTime - levelStartTime).toFixed(2)} ms`);

        e.addPlayer(new PlayerState("local_player", "LocalPlayer"));
        console.log(e.getLocalPlayerState());
        e.getLocalPlayerState()?.getController()?.possess(demoActor);
        
        // Set engine state only after everything is set up
        setEngine(e);
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
    if (gl && engine) {
      engine.compileMaterials(gl);
    }
  }

  const draw = (gl: WebGL2RenderingContext | null) => {
    if (!engine) {
      return;
    }
    engine.tick();

    if (gl) {
      engine.render(gl);
    }

    engine.finishFrame();
  }

  return (
  <div>
    <Header title="Rendered Engine" />
    <div className="card w-full h-full relative flex-1 bg-gray-800" style={{ width: "1500px", height: "100%" }}>
    <Canvas compile={compile} draw={draw} options={{ context: 'webgl2' }} className="w-full h-full" style={{ width: "1500px", height: "100%" }}/>
    </div>
    <EngineContext.Provider value={engine}>
      <Counter />
    </EngineContext.Provider>
  </div>
)};

createRoot(document.getElementById("app")!).render(<App />);
