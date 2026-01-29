import { EngineNetworkMode } from "../engine";
import { Actor } from "./actor";
import { BaseObject } from "./baseobject";

export abstract class Component extends BaseObject {
    protected actor: Actor | null;
    
    constructor() {
        super();
        this.actor = null;
    }

    // Internal tick function, do not override
    public readonly _tick = (deltaTime: number, engineNetworkMode: EngineNetworkMode): void => {
        this.tick(deltaTime, engineNetworkMode);
    }
    
    setActor(actor: Actor) {
        this.actor = actor;
    }

    getActor(): Actor | null {
        return this.actor;
    }

    // Override this to implement custom behavior
    public tick(_deltaTime: number, _engineNetworkMode: EngineNetworkMode): void {}
}