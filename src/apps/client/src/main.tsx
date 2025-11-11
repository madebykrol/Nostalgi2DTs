import http from "http";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import {BaseActorRenderer, Canvas} from "@repo/basicrenderer"
import { Header, Counter, EngineContext } from "@repo/ui";
import { 
  Vector2, 
  EngineBuilder, 
  SoundManager,
  OrthoCamera,
  PlayerState
} from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import { BombActor, DemoActor, ExampleTopDownRPGGameMode, GameTileMapActor, GrasslandsMap, PlayerController, WallActor, WallActorRenderer } from "@repo/example";
import { TileMapActorRenderer }from "@repo/tiler";
import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@repo/client";
const App = () => {

  const ws = useRef<WebSocket>(null);

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

  // Begin performance timing
  var startTime = performance.now();

  var builder = new EngineBuilder<WebSocket, http.IncomingMessage>();
  builder
    .withWorldInstance(new PlanckWorld())
    .withEndpointInstance(new ClientEndpoint("localhost", 3001))
    .withDefaultRenderer(BaseActorRenderer)
    .withInputManager(DefaultInputManager)
    .withSoundManager(SoundManager)
    .withGameMode(ExampleTopDownRPGGameMode)
    .withActor(DemoActor)
    .withActor(GameTileMapActor, TileMapActorRenderer)
    .withActor(BombActor)
    .withActor(WallActor, WallActorRenderer)
    .withPlayerController(PlayerController<WebSocket, http.IncomingMessage>)
    .withDebugLogging()
    .asSinglePlayer("LocalPlayer", "local_player");

  const e = builder.build(ClientEngine);
  e.startup();

  // Log time to startup
  const endTime = performance.now();
  console.log(`Engine built in ${(endTime - startTime).toFixed(4)} ms`);

  const [engine] = useState(e);
  const [level] = useState(new GrasslandsMap(builder.container));

  useEffect(() => {
    const demoActor = new DemoActor();

    demoActor.layer = 5;

    level.addActor(demoActor);

    const setupLevel = async () => {
      try {
        startTime = performance.now();
        // Begin performance timing
        await engine.loadLevelObject(level);

        const worldSize = level.getWorldSize();

        if (worldSize) {
          const camera = new OrthoCamera(new Vector2(worldSize.x / 2, worldSize.y / 2), 1, 40);
          engine.setCurrentCamera(camera);
        } else {
          engine.setCurrentCamera(new OrthoCamera(new Vector2(0, 0), 1));
        }
        
        // Log time to load level 
        const endTime = performance.now();
        console.log(`Level loaded in ${(endTime - startTime).toFixed(2)} ms`);

      } catch (error) {
        console.error("Failed to initialize level", error);
      }

      engine.addPlayer(new PlayerState("local_player", "LocalPlayer"));

      console.log(engine.getLocalPlayerState())

      engine.getLocalPlayerState()?.getController()?.possess(demoActor);
    };

    setupLevel();

    return () => {
    };
  }, [engine, level]);

  const draw = (gl: WebGL2RenderingContext | null) => {

    engine.tick();

    if (gl) {
      engine.render(gl);
    }

    engine.finishFrame();
  }

  return (
  <div>
    <Header title="Rendered Engine" />
    <div className="card">
    <Canvas draw={draw} options={{ context: 'webgl2' }} />
    </div>
    <EngineContext.Provider value={engine}>
      <Counter />
    </EngineContext.Provider>
  </div>
)};

createRoot(document.getElementById("app")!).render(<App />);
