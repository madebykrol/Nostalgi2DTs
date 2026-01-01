import { GameMode } from "../game/gameMode";
import { Vector2 } from "../math";
import { type Constructor, property } from "../utils";
import { Actor } from "../world";
import { BaseObject } from "../world/baseobject";

export class Level {

    private _gravity: Vector2 = new Vector2(0, 0);
    
    private _gameMode: Constructor<GameMode> | undefined = undefined;

    @property()
    public name: string = "Unnamed Level";

    protected set gravity(gravity: Vector2) {
    this._gravity = gravity;
    }

    @property()
    get gravity(): Vector2 {
        return this._gravity;
    }

    protected set gameMode(gameMode: Constructor<GameMode> | undefined){
        this._gameMode = gameMode;
    }

    @property()
    get gameMode(): Constructor<GameMode> | undefined {
        return this._gameMode;
    }

    /**
     *
     */
    constructor() {
        
    }

    protected objects: BaseObject[] = [];

    findActor(id:string): Actor | null {
        for(const actor of this.objects.filter(o => o instanceof Actor)) {
            if(actor.getId() === id) {
                return actor;
            }
            const childActor = actor.findChildOfType(id, Actor);
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
        if (this.findActor(actor.getId())) {
            return;
        }
        this.objects.push(actor);
    }

    addActors(actors: Actor[]): void {
        for(const actor of actors) {
            if (this.findActor(actor.getId())) {
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