import { InputManager } from "../input";
import { Actor } from "../world";

export abstract class Controller {

    protected readonly inputManager: InputManager;
    protected possessedActor: Actor | null = null;

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

    public activate(): void {
        // Optional activation hook for controllers.
    }

    public deactivate(): void {
        // Optional deactivation hook for controllers.
    }

    public possess(actor: Actor): void {
        
        if (this.possessedActor !== actor) {
            this.possessedActor?.isOwnedBy(null);
        }

        // Logic to possess the given actor
        this.possessedActor = actor;
        actor.isOwnedBy(this);
    }


    // User-overrideable tick method
    tick(_deltaTime: number): void {}
}

