import http from "http";


import { Actor, CollisionComponent, Controller, createBoinkSound, Engine, GainChannel, InputManager, PhysicsComponent, SoundHandle, SoundManager, Vector2 } from "@repo/engine";
import { inject, injectable } from 'inversify';
import { DemoActor } from "@repo/example";

@injectable()
export class PlayerController extends Controller {

  private boink: SoundHandle | null = null;
  
  private lastMousePosition: Vector2 = new Vector2(0, 0);
  private lastMouseDownPosition: Vector2 = new Vector2(0, 0);
  private lastMouseUpPosition: Vector2 = new Vector2(0, 0);
  private mouseMoveDelta: Vector2 = new Vector2(0, 0);

  constructor(@inject(InputManager) inputManager: InputManager, @inject(Engine) engine: Engine<WebSocket, http.IncomingMessage>, @inject(SoundManager) soundManager: SoundManager) {
    super(inputManager);


    inputManager.on("keyDown", (key: string, modifiers: any) => {

      const physicsComponent = this.possessedActor?.getComponentsOfType<PhysicsComponent>(PhysicsComponent)[0];
      console.log("PhysicsComponent:", physicsComponent);

      if (key === "ArrowLeft") {
          console.log("Moving left", this.possessedActor);
          // demoActor!.setPosition(new Vector2(cameraPos.x - 1, cameraPos.y));        
      } else if (key === "ArrowRight") {

          console.log("Moving right", this.possessedActor);
          physicsComponent?.addImpulse(new Vector2(10, 0));
        
      } else if (key === "ArrowUp") {
          // demoActor!.setPosition(new Vector2(cameraPos.x, cameraPos.y + 1));
          const currentZoom = engine.getCurrentCamera()?.getZoom() ?? 1;
          engine.getCurrentCamera()?.setZoom(currentZoom+0.1);
        
      } else if (key === "ArrowDown") {

          // Handle ArrowDown key press
          // demoActor!.setPosition(new Vector2(cameraPos.x, cameraPos.y - 1));
          const currentZoom = engine.getCurrentCamera()?.getZoom() ?? 1;
          engine.getCurrentCamera()?.setZoom(currentZoom-0.1);
        
      }
    });

    inputManager.on("mouseMove", (data: { screenX: number; screenY: number; worldX: number; worldY: number }, modifiers: any) => {
      this.lastMousePosition = new Vector2(data.worldX, data.worldY);
    });

    inputManager.on("mouseUp", (data: { screenX: number; screenY: number; worldX: number; worldY: number }, modifiers: any) => {
      console.log("Mouse up at world position:", data.worldX, data.worldY);
      this.lastMouseUpPosition = new Vector2(data.worldX, data.worldY);
      this.mouseMoveDelta = new Vector2(this.lastMouseUpPosition.x - this.lastMouseDownPosition.x, this.lastMouseUpPosition.y - this.lastMouseDownPosition.y);
      console.log("Mouse move delta since mouse down:", this.mouseMoveDelta);
    });

    inputManager.on("mouseDown", (data: { screenX: number; screenY: number; worldX: number; worldY: number }, modifiers: any) => {

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

  tick(deltaTime: number): void {

  }
}