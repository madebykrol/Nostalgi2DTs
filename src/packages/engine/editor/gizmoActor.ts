import { Actor } from "../world";
import { Vector2 } from "../math";
import type { EngineNetworkMode } from "../engine";
import { EditorActor } from "./editorActor";
import { GizmoHandle } from "./gizmoHandle";

export abstract class GizmoActor extends EditorActor {

    private targetActors: Set<Actor> = new Set();

    constructor() {
        super();
        this.shouldTick = true;
        this.tickComponents = false;
    }

    public setTargetActors(actors: Actor[]): void {
        this.targetActors = new Set(actors);
    }

    public override tick(_deltaTime: number, _engineNetworkMode: EngineNetworkMode): void {
        var position = this.calculateGizmoPosition(Array.from(this.targetActors));
        this.setPosition(position);
    }

    public getTargetActors(): Set<Actor> {
        return this.targetActors;
    }

    public abstract getHandle(worldPoint: Vector2, cameraZoom: number): GizmoHandle | null;

    private calculateGizmoPosition(selectedActors: Actor[]): Vector2 {
        if (selectedActors.length === 0) {
            return Vector2.zero();
        }

        if( selectedActors.length === 1) {
            return selectedActors[0].getPosition();
        }

        // Calculate the middle point of all selected actors
        let biggestX = Number.NEGATIVE_INFINITY;
        let smallestX = Number.POSITIVE_INFINITY;
        let biggestY = Number.NEGATIVE_INFINITY;
        let smallestY = Number.POSITIVE_INFINITY;
        
        for (const actor of selectedActors) {
            // calculate the left most, right most, top most, bottom most positions
            const actorPosition = actor.getPosition();
            if (actorPosition.x > biggestX) {
                biggestX = actorPosition.x;
            }
            if (actorPosition.x < smallestX) {
                smallestX = actorPosition.x;
            }
            if (actorPosition.y > biggestY) {
                biggestY = actorPosition.y;
            }
            if (actorPosition.y < smallestY) {
                smallestY = actorPosition.y;
            }
        }

        const middleX = (biggestX + smallestX) / 2;
        const middleY = (biggestY + smallestY) / 2;   

        return new Vector2(middleX, middleY);
    }
}