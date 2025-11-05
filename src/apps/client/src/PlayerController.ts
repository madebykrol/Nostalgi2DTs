import { Controller, InputManager } from "@repo/engine";
import { inject, injectable } from 'inversify';

@injectable()
export class PlayerController extends Controller {

  constructor(@inject(InputManager) inputManager: InputManager) {
    super(inputManager);
  }
}