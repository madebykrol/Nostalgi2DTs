import { AbstractConstructor, Constructor } from "../utils";
import { Character } from "./character";
import { Controller } from "./controller";
import { PlayerState } from "./playerstate";

export abstract class GameMode {

    abstract start(): void;
    abstract stop(): void;

    public playerControllerType: Constructor<Controller> | undefined;
    public playerCharacterType: Constructor<Character> | undefined;
    public playerStateType: Constructor<PlayerState> | undefined;

    public readonly _tick = (deltaTime: number): void => {
        this.tick(deltaTime);
    }

    tick(deltaTime: number): void {}

    public readonly _onGameStart = (): void => {
        
        
     
        this.onGameStart();
    }

    onGameStart(): void {
        // Custom logic for when the game starts
    }
}