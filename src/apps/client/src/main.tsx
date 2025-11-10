import http from "http";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import {BaseActorRenderer, Canvas} from "@repo/basicrenderer"
import { Header, Counter, EngineContext } from "@repo/ui";
import { 
  Level,
  Vector2,
  Actor, 
  actor, 
  PolygonCollisionComponent, 
  ActorRenderer, 
  PhysicsComponent, 
  Vertex2,   
  EngineBuilder, 
  SoundManager,
  createBoinkSound,
  Camera,
  OrthoCamera,
  GainChannel,
  Container,
  Constructor,
  PlayerState
} from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import { BombActor, DemoActor } from "@repo/example";
import { Parser, TiledPoint, TileMapActor, TileMapActorRenderer, type TileMapActorOptions }from "@repo/tiler";
import { TiledObjectLayer } from "@repo/tiler";
import { unmanaged } from 'inversify';
import { PlayerController } from "./PlayerController";

import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@repo/client";
import { GameMode } from "../../../packages/engine/game/gameMode";
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
    .withPlayerController(PlayerController)
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
    let disposed = false;

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
      disposed = true;
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

class DefaultGameMode extends GameMode {
  start(): void {
    throw new Error("Method not implemented.");
  }
  stop(): void {
    throw new Error("Method not implemented.");
  }
  playerControllerType: typeof PlayerController = PlayerController;
}

class ExampleTopDownRPGGameMode extends GameMode {
  start(): void {
    throw new Error("Method not implemented.");
  }
  stop(): void {
    throw new Error("Method not implemented.");
  }
  playerControllerType: typeof PlayerController = PlayerController;

}

class GrasslandsMap extends Level {

  private tileMapActor: GameTileMapActor;
  private container: Container;
  constructor(container: Container) {
    super();

    this.name = "Grasslands";
    this.tileMapActor = new GameTileMapActor("/Nostalgi2DTs/client/grasslands.tmx", new Parser(), container);

    this.container = container;

    this.addActor(this.tileMapActor);
    // const mapCenter = tileMapActor.getWorldCenter();
    // tileMapActor.setPosition(mapCenter);
  }

  // get
  getGravity(): Vector2 {
    return new Vector2(
      this.tileMapActor.getMap()?.properties?.GravityX as number ?? 0,
      this.tileMapActor.getMap()?.properties?.GravityY as number ?? 0
    );
  }

  getGameMode(): Constructor<GameMode> | undefined {
    console.log(this.tileMapActor.getMap()?.properties?.GameMode);
    return this.container.getTypeForIdentifier(this.tileMapActor.getMap()?.properties?.GameMode as  string) as Constructor<GameMode> | undefined;
  }
}

class GameTileMapActor extends TileMapActor {
  constructor(@unmanaged() mapUrl: string, parser: Parser = new Parser(), container: Container, options: TileMapActorOptions = {}) {
    super(mapUrl, parser, container, options);
  }

  protected handleLayer(layer: TiledObjectLayer): boolean {
      const layerName = layer.name?.toLowerCase?.() ?? "";
      const typeProperty = layer.properties ? layer.properties["Type"] : undefined;

      console.log(layerName, typeProperty);
      const layerType = typeof typeProperty === "string"
          ? typeProperty.toLowerCase()
          : "";

      if (layerName.includes("wall") || layerType === "walls") {
          console.log("Handling walls for layer:", layer.name);
          this.handleWalls(layer);
          return true;
      }
      return true;
  }

  private handleWalls(layer: TiledObjectLayer): void {
      if (!layer.visible || !layer.objects.length) {
          return;
      }

      const scale = this.getWorldUnitsPerPixel();
      const translation = this.getRenderTranslation();

      console.log("Processing walls for layer:", layer.name);

      layer.objects.forEach((object, index) => {
          if (!object.visible) {
              return;
          }

          const polygon = object.polygon;
          let vertices: Vertex2[] = [];

          if (polygon && polygon.length >= 3) {
            vertices = this.handlePolygonWall(polygon, scale, object.rotation ?? 0);
          }

          else {
            vertices = object.width && object.height ? [
              { x: 0, y: 0 },
              { x: object.width * scale, y: 0 },
              { x: object.width * scale, y: -object.height * scale },
              { x: 0, y: -object.height * scale }
            ] : [];
          }

          const wallActor = this.container.get<WallActor>(WallActor);
          wallActor.applyProperties({ vertices: vertices });

          wallActor.initialize();

          const posX = (object.x + (layer.offsetX ?? 0)) * scale;
          const posY = -((object.y + (layer.offsetY ?? 0)) * scale);
          const worldPosition = new Vector2(posX + translation.x, posY + translation.y);
          wallActor.setPosition(worldPosition);

          this.addChild(wallActor);
      });
  }

  private handlePolygonWall(polygon: TiledPoint[], scale: number, rotation: number): { x: number; y: number }[] {
    const rotationRadians = -(rotation * (Math.PI / 180));
    const cos = Math.cos(rotationRadians);
    const sin = Math.sin(rotationRadians);

    return polygon.map((point) => {
        const scaledX = point.x * scale;
        const scaledY = -point.y * scale;
        return {
            x: scaledX * cos - scaledY * sin,
            y: scaledX * sin + scaledY * cos
        };
    });
  }
}

class WallActor extends Actor {

  vertices: Vertex2[] | undefined;

  constructor(){
    super();
  }

  initialize(): void {
    const physicsComponent = new PhysicsComponent();
    physicsComponent.setSimulationState(true, "static");
    this.addComponent(physicsComponent);

    const collisionComponent = new PolygonCollisionComponent(this.vertices ? this.vertices : []);
    this.addComponent(collisionComponent);
  }
  
}

class WallActorRenderer extends ActorRenderer<WallActor> {
  render(_actor: WallActor, _camera: Camera, _gl: WebGL2RenderingContext, _debugPhysics?: boolean): boolean {
    return true;
  }

}
