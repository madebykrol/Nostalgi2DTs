import { Controller, InputManager, PhysicsComponent, Vector2 } from "@nostalgi2d/engine";
import { inject, injectable } from "inversify";

@injectable()
export class FlappyRectangleController extends Controller { 
    // Controller code goes here

    constructor(@inject(InputManager) inputManager: InputManager) {
        super(inputManager);

    }

    public override activate(): void {
        super.activate();

        this.inputManager.on("arrowup:down", this.handleSpaceDown);
        this.inputManager.on("space:down", this.handleSpaceDown);
        this.inputManager.on("touch:end", this.handleSpaceDown);
    }

    public deactivate(): void {
        super.deactivate();
        this.inputManager.off("arrowup:down", this.handleSpaceDown);
        this.inputManager.off("space:down", this.handleSpaceDown);
        this.inputManager.off("touch:end", this.handleSpaceDown);
    }

    private readonly handleSpaceDown = (_arg0: string, _handleSpaceDown: any) => {
        // Impulse to make character jump
        const physicsComponent = this.possessedActor?.getComponentsOfType<PhysicsComponent>(PhysicsComponent)[0];   
        physicsComponent?.addImpulse(new Vector2(0, 20));
    }
}