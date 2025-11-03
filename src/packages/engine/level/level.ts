import { Vector2 } from "../math";
import { Actor } from "../world";
import { BaseObject } from "../world/baseobject";

export class Level {
   
    protected objects: BaseObject[] = [];

    findActor(name:string): Actor | null {
        for(const actor of this.objects.filter(o => o instanceof Actor)) {
            if(actor.name === name) {
                return actor;
            }
            const childActor = actor.findChildOfType(name, Actor);
            if(childActor) {
                return childActor;
            }
        }

        return null;
    }

    getWorldSize(): Vector2 | null {
        let maxX = 0;
        let maxY = 0;

        return new Vector2(maxX, maxY);
    }

    addActor(actor: Actor): void {
        if (this.findActor(actor.name)) {
            return;
        }
        this.objects.push(actor);
    }

    addActors(actors: Actor[]): void {
        for(const actor of actors) {
            if (this.findActor(actor.name)) {
                continue;
            }
            this.objects.push(actor);
        }
    }

    getActors(): Actor[] {
        return this.objects.filter(o => o instanceof Actor) as Actor[];
    }

    protected getChildActors(actor:Actor): Actor[] {
        const childActors: Actor[] = [];

        for(const child of actor.getChildrenOfType(Actor)) {
            childActors.push(child);
            childActors.push(...this.getChildActors(child));
        };

        return childActors;
    }
}