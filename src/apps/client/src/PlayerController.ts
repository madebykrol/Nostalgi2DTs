import { Controller, InputManager } from "@repo/engine";
import { inject } from 'inversify';

export class PlayerController extends Controller {

  constructor(@inject(InputManager) inputManager: InputManager) {
    super(inputManager);
    
  }
}
