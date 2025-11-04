import http from "http";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import {Canvas} from "@repo/basicrenderer"
import { Header, Counter, EngineContext } from "@repo/ui";
import { 
  Engine,
  Level,
  Vector2,
  Actor, 
  actor, 
  PolygonCollisionComponent, 
  ActorRenderer, 
  render, 
  PhysicsComponent, 
  Vertex2, 
  Controller,  
  IContainer, 
  Constructor, 
  EngineBuilder, 
  AbstractConstructor,
  InputManager,
  SoundManager,
  createBoinkSound,
  CollisionComponent
} from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import { DemoActor } from "@repo/example";
import { Camera, OrthoCamera } from "../../../packages/engine/camera/Camera";
import { Parser, TiledPoint, TileMapActor, type TileMapActorOptions }from "@repo/tiler";
import { TiledObjectLayer } from "@repo/tiler";
import { Container, decorate, inject, injectable } from 'inversify';
import { GainChannel } from "../../../packages/engine/audio";

class InversifyContainer implements IContainer {
  private container: Container;

  constructor() {
    this.container = new Container({
        autobind: true
    });
  }

  registerSingleton<T, U extends T>(ctor: Constructor<T> | AbstractConstructor<T>, ctor2: Constructor<U>): void {
    this.container.bind(ctor).to(ctor2);
  }

  register<T1, T2 extends T1>(ctor: Constructor<T1> | AbstractConstructor<T1>, ctor2: Constructor<T2>): void {
    this.container.bind(ctor).to(ctor2);
  }
  get<T>(ctor: Constructor<T> | AbstractConstructor<T>): T {
    return this.container.get(ctor);
  }
}

class PlayerController extends Controller {

  constructor(@inject(InputManager) inputManager: InputManager) {
    super(inputManager);
    
  }
}


class DefaultInputManager extends InputManager {
  // Implement default input manager logic here
}

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

  const container = new InversifyContainer();


  container.registerSingleton(InputManager, DefaultInputManager);  
  container.registerSingleton(Controller, PlayerController);

  const pc = container.get<Controller>(Controller);

  console.log(pc);

  var builder = new EngineBuilder<WebSocket, http.IncomingMessage>(container);
  builder
    .withWorld(new PlanckWorld({gravity: new Vector2(-10, 0), allowSleep: true}))
    .asLocalSinglePlayer();

  const e = builder.build();

  const [engine] = useState(e);
  const [level] = useState(new Level());
  const [soundManager] = useState(() => {
    const sm = new SoundManager();
    sm.initAudioContext();
    
    // Create and load the boink sound using the extracted function
    const boinkBuffer = createBoinkSound(sm.getAudioContext()!);
    sm.loadSoundFromBuffer("boink", boinkBuffer, GainChannel.Effects);
    return sm;
  });

  useEffect(() => {
    let disposed = false;

    const demoActor = new DemoActor("DemoActor");

    demoActor.layer = 5;

    level.addActor(demoActor);

    const setupLevel = async () => {
      try {
        const tileMapActor = new GameTileMapActor("GrasslandsMap", "/Nostalgi2DTs/client/grasslands.tmx", new Parser(), {});

        level.addActor(tileMapActor);
        
        if (disposed) {
          return;
        }

        const mapCenter = tileMapActor.getWorldCenter();
        tileMapActor.setPosition(mapCenter);

        await engine.loadLevelObject(level);

        // engine.setControllerTypeForPlayer<PlayerController>(
        //   engine.getLocalPlayerState(),
        //   PlayerController
        // );

        const worldSize = level.getWorldSize();

        if (worldSize) {
          const camera = new OrthoCamera(mapCenter.clone(), 1, 40);
          engine.setCurrentCamera(camera);
        } else {
          engine.setCurrentCamera(new OrthoCamera(new Vector2(0, 0), 1));
        }

      } catch (error) {
        console.error("Failed to initialize level", error);
      }
    };

    setupLevel();

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      console.log("Key down:", e.key);

      if (e.key === "ArrowLeft") {
        // Handle ArrowLeft key press
        const cameraPos = demoActor?.getPosition();
        if (cameraPos) {
          console.log("Moving left", demoActor);
          // demoActor!.setPosition(new Vector2(cameraPos.x - 1, cameraPos.y));
        
        }
      } else if (e.key === "ArrowRight") {
        // Handle ArrowRight key press
        const cameraPos = demoActor?.getPosition();
        if (cameraPos) {
          console.log("Moving right", cameraPos);
          // demoActor!.setPosition(new Vector2(cameraPos.x + 1, cameraPos.y));
        }
      } else if (e.key === "ArrowUp") {
        // Handle ArrowUp key press
        const cameraPos = demoActor?.getPosition();
        if (cameraPos) {
          console.log("Moving up", cameraPos);
          // demoActor!.setPosition(new Vector2(cameraPos.x, cameraPos.y + 1));
            const currentZoom = engine.getCurrentCamera()?.getZoom() ?? 1;
          engine.getCurrentCamera()?.setZoom(currentZoom+0.1);
        }
      } else if (e.key === "ArrowDown") {
        // Handle ArrowDown key press
        const cameraPos = demoActor?.getPosition();
        if (cameraPos) {
          console.log("Moving down", cameraPos);
          // demoActor!.setPosition(new Vector2(cameraPos.x, cameraPos.y - 1));
            const currentZoom = engine.getCurrentCamera()?.getZoom() ?? 1;
          engine.getCurrentCamera()?.setZoom(currentZoom-0.1);
        }
      }
    });

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
    <Canvas draw={draw} options={{ context: 'webgl2' }} onClick={(e: React.MouseEvent<HTMLCanvasElement>) => {
          const canvas = e.currentTarget as HTMLCanvasElement;
          const rect = canvas.getBoundingClientRect();

          // Account for CSS scaling vs. backing store resolution (hiDPI support)
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;

          const canvasX = (e.clientX - rect.left) * scaleX;
          const canvasY = (e.clientY - rect.top) * scaleY;

          const camera = engine.getCurrentCamera();
          
          if (!camera) {
            return;
          }

          const worldPos = camera.screenToWorld(new Vector2(canvasX, canvasY), canvas.width, canvas.height);

          const hitActors = engine.aabbCast(worldPos, true, true, Actor);

          if (hitActors.length > 0) {
            
            for (const actor of hitActors) {
              console.log(`Clicked actor: ${actor.name}`);
              actor.isMarkedForDespawn = true;
            }
            return;
          }

          for(let i = 0; i < 1; i++) {
            const spawnedActor = new DemoActor("SpawnedActor-"+i+Date.now());
            spawnedActor.setPosition(worldPos);
            engine.spawnActor(spawnedActor);

            const boink = soundManager.getSound("boink");
            soundManager.setMasterVolume(0.1)
            soundManager.setEffectsVolume(1);
            boink?.setVolume(1)
            // Play the boink sound when spawning an actor
            boink?.play(false, 0);
          }

          console.log(`Canvas clicked {${canvasX.toFixed(2)}, ${canvasY.toFixed(2)}} => World ${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}`);
        }} />
    </div>
    <EngineContext.Provider value={engine}>
      <Counter />
    </EngineContext.Provider>
  </div>
)};

createRoot(document.getElementById("app")!).render(<App />);


@actor()
class GameTileMapActor extends TileMapActor {
  constructor(name: string, mapUrl: string, parser: Parser = new Parser(), options: TileMapActorOptions = {}) {
    super(name, mapUrl, parser, options);
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
      const existingNames = new Set(this.getChildren().map((child) => child.name));

      console.log("Processing walls for layer:", layer.name);

      layer.objects.forEach((object, index) => {
          if (!object.visible) {
              return;
          }

          const polygon = object.polygon;
          let vertices: Vertex2[] = [];

          if (polygon && polygon.length >= 3) {
            vertices = this.handlePolygonWall(polygon, scale, translation, object.rotation ?? 0);
          }

          else {
            vertices = object.width && object.height ? [
              { x: 0, y: 0 },
              { x: object.width * scale, y: 0 },
              { x: object.width * scale, y: -object.height * scale },
              { x: 0, y: -object.height * scale }
            ] : [];
          }

          const baseName = this.getObjectBaseName(layer, object, index);
          const uniqueName = this.makeUniqueName(baseName, existingNames);
          existingNames.add(uniqueName);

          const wallActor = new WallActor(uniqueName, vertices);

          const posX = (object.x + (layer.offsetX ?? 0)) * scale;
          const posY = -((object.y + (layer.offsetY ?? 0)) * scale);
          const worldPosition = new Vector2(posX + translation.x, posY + translation.y);
          wallActor.setPosition(worldPosition);

          this.addChild(wallActor);

          this.getWorld()?.spawnActor(wallActor, worldPosition);
      });
  }

  private handlePolygonWall(polygon: TiledPoint[], scale: number, translation: Vector2, rotation: number): { x: number; y: number }[] {
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

@actor()
class WallActor extends Actor {
  private readonly physics: PhysicsComponent;

  constructor(name: string, vertices: Vertex2[]){
    super(name);
    this.physics = this.addComponent(new PhysicsComponent());
    this.physics.setSimulationState(true, "static");

    const collisionComponent = new PolygonCollisionComponent(vertices);
    this.addComponent(collisionComponent);
  }
}

@render(WallActor)
class WallActorRenderer extends ActorRenderer<WallActor> {
  render(_actor: WallActor, _camera: Camera, _gl: WebGL2RenderingContext, _debugPhysics?: boolean): boolean {
    return true;
  }

}