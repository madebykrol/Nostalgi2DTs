import http from "http";


import { 
  Actor,
  Controller,
  createBoinkSound,
  Engine,
  GainChannel,
  InputManager,
  PhysicsComponent,
  SoundHandle,
  SoundManager,
  Vector2 } from "@repo/engine";
import { inject, injectable } from 'inversify';
import { DemoActor } from "@repo/example";

@injectable()
export class PlayerController extends Controller {

  private boink: SoundHandle | null = null;
  
  public lastMousePosition: Vector2 = new Vector2(0, 0);
  private lastMouseDownPosition: Vector2 = new Vector2(0, 0);
  private lastMouseUpPosition: Vector2 = new Vector2(0, 0);
  private mouseMoveDelta: Vector2 = new Vector2(0, 0);


  constructor(@inject(InputManager) inputManager: InputManager, @inject(Engine) protected engine: Engine<WebSocket, http.IncomingMessage>, @inject(SoundManager) soundManager: SoundManager) {
    super(inputManager);


    inputManager.on("arrowup:down", () => this.moveUp());
    inputManager.on("arrowdown:down", () => this.moveDown());
    inputManager.on("arrowleft:down", () => this.moveLeft());
    inputManager.on("arrowright:down", () => this.moveRight());
    inputManager.on("mouse:up", (data: {screenX : number, screenY: number, worldX: number, worldY: number}, _modifiers: any) => {
      console.log("Mouse up at world position:", data.worldX, data.worldY);
      this.lastMouseUpPosition = new Vector2(data.worldX, data.worldY);
      this.mouseMoveDelta = new Vector2(this.lastMouseUpPosition.x - this.lastMouseDownPosition.x, this.lastMouseUpPosition.y - this.lastMouseDownPosition.y);
      console.log("Mouse move delta since mouse down:", this.mouseMoveDelta);
    });

    inputManager.on("wheel:tap:shift", (data: {deltaX: number, deltaY: number}, _modifiers: any) => {
      this.zoomCamera(data.deltaY);
    });

    inputManager.on("mouseMove", (data: { screenX: number; screenY: number; worldX: number; worldY: number }, _modifiers: any) => {
      this.lastMousePosition = new Vector2(data.worldX, data.worldY);
    });

    inputManager.on("mouseUp", (_data: { screenX: number; screenY: number; worldX: number; worldY: number }, _modifiers: any) => {
      
    });

    inputManager.on("mouse:down", (data: { screenX: number; screenY: number; worldX: number; worldY: number }, _modifiers: any) => {
      const hitActors = engine.aabbCast(new Vector2(data.worldX, data.worldY), true, true, Actor);
      this.lastMouseDownPosition = new Vector2(data.worldX, data.worldY);
      console.log("Mouse down at world position:", data.worldX, data.worldY);

      if (hitActors.length > 0) {
        
        for (const actor of hitActors) {
          console.log(`Clicked actor: ${actor.getId()}`);
          actor.isMarkedForDespawn = true;
        }
        return;
      }

      engine.spawnActor(DemoActor, undefined, new Vector2(data.worldX, data.worldY));

      if(!this.boink) {
        this.boink = soundManager.loadSoundFromBuffer("boinkSound", createBoinkSound(soundManager.getAudioContext()!), GainChannel.Effects);
        this.boink?.setVolume(1)
      }

      soundManager.setMasterVolume(0.1)
      soundManager.setEffectsVolume(1);

      // Play the boink sound when spawning an actor
      this.boink?.play(false, 0);
      
    });
  }

  tick(_deltaTime: number): void {
    this.engine.getCurrentCamera()?.setPosition(this.possessedActor?.getPosition() || new Vector2(0, 0));
  }

   protected moveLeft(): void {
    const physicsComponent = this.possessedActor?.getComponentsOfType<PhysicsComponent>(PhysicsComponent)[0];      
    physicsComponent?.addImpulse(new Vector2(-10, 0));
  }

  protected moveRight(): void {
    const physicsComponent = this.possessedActor?.getComponentsOfType<PhysicsComponent>(PhysicsComponent)[0];
    physicsComponent?.addImpulse(new Vector2(10, 0));
  }

  protected moveUp(): void {
    const physicsComponent = this.possessedActor?.getComponentsOfType<PhysicsComponent>(PhysicsComponent)[0];
    physicsComponent?.addImpulse(new Vector2(0, 10));
  }

  protected moveDown(): void {
    const physicsComponent = this.possessedActor?.getComponentsOfType<PhysicsComponent>(PhysicsComponent)[0];
    physicsComponent?.addImpulse(new Vector2(0, -10));
  }

  protected zoomCamera(zoomDelta: number): void {
    const currentZoom = this.engine.getCurrentCamera()?.getZoom() ?? 1;
    this.engine.getCurrentCamera()?.setZoom(currentZoom - zoomDelta * 0.001);
  }
}