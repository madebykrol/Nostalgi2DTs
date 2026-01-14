import { GameMode } from "../game/gameMode";
import { Vector2 } from "../math";
import { SerializedNode, SerializedProperty } from "../serialization";
import { type Constructor, property, injectable } from "../utils";
import { Actor } from "../world";
import { BaseObject } from "../world/baseobject";

@injectable()
export class Level extends BaseObject {

    private _gravity: Vector2 = new Vector2(0, 10);
    
    private _gameMode: Constructor<GameMode> | undefined;

    @property()
    public name: string = "Unnamed Level";

    @property()
    public  set gravity(gravity: Vector2) {
        this._gravity = gravity;
    }

    get gravity(): Vector2 {
        return this._gravity;
    }

    @property()
    set gameMode(gameMode: Constructor<GameMode>){
        this._gameMode = gameMode;
    }

    get gameMode(): Constructor<GameMode> | undefined {
        return this._gameMode;
    }

    @property({ label: "UI Modules" })
    public uiModules: string[] = [];

    /**
     *
     */
    constructor() {
        super();
    }

    protected objects: BaseObject[] = [];

    findActor(id:string): Actor | null {
        for(const actor of this.children.filter(o => o instanceof Actor)) {
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

    getActors(): Actor[] {
        return this.children.filter(o => o instanceof Actor) as Actor[];
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

export class SerializedLevel {
    type: string|null = null;
    properties: SerializedProperty[] = [];
    actors: SerializedNode[] = [];
}
