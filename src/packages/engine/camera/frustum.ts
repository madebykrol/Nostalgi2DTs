import { Actor, CollisionComponent } from "..";
import { Vector2 } from "../math";

export class Frustum {
    private containsBounds( min: Vector2, max: Vector2 ): boolean {
        return (
            min.x >= this.left &&
            min.y >= this.bottom &&
            max.x <= this.right &&
            max.y <= this.top
        );
    }

    // Implement the abstract method from base World by delegating to the existing checkWorldBounds.
    checkWithinBounds(actor: Actor): boolean {
        return this.checkWorldBounds(actor);
    }

    private checkWorldBounds(actor: Actor): boolean {
        const collisionComponents = actor.getComponentsOfType(CollisionComponent);
        if (collisionComponents.length === 0) return true;

        const position = actor.position;
        for (const component of collisionComponents) {
            const localBounds = component.getBounds();
            const worldMinX = localBounds.min.x + position.x;
            const worldMinY = localBounds.min.y + position.y;
            const worldMaxX = localBounds.max.x + position.x;
            const worldMaxY = localBounds.max.y + position.y;

            return this.containsBounds(new Vector2(worldMinX, worldMinY), new Vector2(worldMaxX, worldMaxY));
        }

        return false;
    }

    constructor(public near: number, public far: number, public left: number, public right: number, public top: number, public bottom: number) {
    }
}