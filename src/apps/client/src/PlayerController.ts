import { CollisionComponent, Controller, InputManager, PhysicsComponent, Vector2 } from "@repo/engine";
import { inject, injectable } from 'inversify';

@injectable()
export class PlayerController extends Controller {

  constructor(@inject(InputManager) inputManager: InputManager) {
    super(inputManager);

    console.log(inputManager)
    console.log("PlayerController initialized");
  }

  tick(deltaTime: number): void {
    this.possessedActor?.getComponentsOfType(PhysicsComponent).forEach((comp) => {
        comp.addImpulse(new Vector2(0, 50))
    });
  }
}