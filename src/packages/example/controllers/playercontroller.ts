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
export class PlayerController<TSocket, TRequest> extends Controller {

  private boink: SoundHandle | null = null;
  
  public lastMousePosition: Vector2 = new Vector2(0, 0);
  private lastMouseDownPosition: Vector2 = new Vector2(0, 0);
  private lastMouseUpPosition: Vector2 = new Vector2(0, 0);
  private mouseMoveDelta: Vector2 = new Vector2(0, 0);
  private readonly soundManager: SoundManager;
  private isActive = false;

  private readonly handleMoveUp = () => this.moveUp();
  private readonly handleMoveDown = () => this.moveDown();
  private readonly handleMoveLeft = () => this.moveLeft();
  private readonly handleMoveRight = () => this.moveRight();
  private readonly handleMouseUp = (data: {screenX : number, screenY: number, worldX: number, worldY: number}) => {
    console.log("Mouse up at world position:", data.worldX, data.worldY);
    this.lastMouseUpPosition = new Vector2(data.worldX, data.worldY);
    this.mouseMoveDelta = new Vector2(this.lastMouseUpPosition.x - this.lastMouseDownPosition.x, this.lastMouseUpPosition.y - this.lastMouseDownPosition.y);
    console.log("Mouse move delta since mouse down:", this.mouseMoveDelta);
  };
  private readonly handleMouseMove = (data: { screenX: number; screenY: number; worldX: number; worldY: number }) => {
    this.lastMousePosition = new Vector2(data.worldX, data.worldY);
  };
  private readonly handleMouseDown = async (data: { screenX: number; screenY: number; worldX: number; worldY: number }) => {
    const hitActors = this.engine.aabbCast(new Vector2(data.worldX, data.worldY), true, true, Actor);
    this.lastMouseDownPosition = new Vector2(data.worldX, data.worldY);
    console.log("Mouse down at world position:", data.worldX, data.worldY);

    if (hitActors.length > 0) {
      for (const actor of hitActors) {
        console.log(`Clicked actor: ${actor.getId()}`);
        actor.markForDespawn();
      }
      return;
    }

    await this.engine.spawnActor(DemoActor, undefined, new Vector2(data.worldX, data.worldY));

    if(!this.boink) {
      this.boink = this.soundManager.loadSoundFromBuffer("boinkSound", createBoinkSound(this.soundManager.getAudioContext()!), GainChannel.Effects);
      this.boink?.setVolume(1);
    }

    this.soundManager.setMasterVolume(0.1);
    this.soundManager.setEffectsVolume(1);

    this.boink?.play(false, 0);
  };
  private readonly handleWheelWithShift = (data: {deltaX: number, deltaY: number}) => {
    this.zoomCamera(data.deltaY);
  };


  constructor(@inject(InputManager) inputManager: InputManager, @inject(Engine) protected engine: Engine<TSocket, TRequest>, @inject(SoundManager) soundManager: SoundManager) {
    super(inputManager);
    this.soundManager = soundManager;
  }

  public override activate(): void {
    if (this.isActive) {
      return;
    }

    const inputManager = this.getInputManager();
    inputManager.on("arrowup:down", this.handleMoveUp);
    inputManager.on("arrowdown:down", this.handleMoveDown);
    inputManager.on("arrowleft:down", this.handleMoveLeft);
    inputManager.on("arrowright:down", this.handleMoveRight);
    inputManager.on("mouse:up", this.handleMouseUp);
    inputManager.on("mouse:move", this.handleMouseMove);
    inputManager.on("mouse:down", this.handleMouseDown);
    inputManager.on("wheel:tap:shift", this.handleWheelWithShift);

    this.isActive = true;
  }

  public override deactivate(): void {
    if (!this.isActive) {
      return;
    }

    const inputManager = this.getInputManager();
    inputManager.off("arrowup:down", this.handleMoveUp);
    inputManager.off("arrowdown:down", this.handleMoveDown);
    inputManager.off("arrowleft:down", this.handleMoveLeft);
    inputManager.off("arrowright:down", this.handleMoveRight);
    inputManager.off("mouse:up", this.handleMouseUp);
    inputManager.off("mouse:move", this.handleMouseMove);
    inputManager.off("mouse:down", this.handleMouseDown);
    inputManager.off("wheel:tap:shift", this.handleWheelWithShift);

    this.isActive = false;
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