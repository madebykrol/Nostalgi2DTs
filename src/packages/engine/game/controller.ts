import { InputManager } from "../input";

export abstract class Controller {

    private inputManager: InputManager;

    constructor(inputManager: InputManager) { 
        this.inputManager = inputManager;
    }

    // Internal tick method called by the engine
    public readonly _tick = (deltaTime: number): void => {
        this.tick(deltaTime);
    }

    protected getInputManager(): InputManager {
        return this.inputManager;
    }


    // User-overrideable tick method
    tick(deltaTime: number): void {}
}

