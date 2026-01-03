import { Level } from "../level";
import { type Constructor, property } from "../utils";
import { Character } from "./character";
import { Controller } from "./controller";
import { Pawn } from "./pawn";
import { PlayerStart } from "./playerstart";
import { PlayerState } from "./playerstate";

export abstract class GameMode {

    private _currentLevel: Level | null = null; 

    public readonly start = (): void => {
        this.onGameStart();
    }
    public readonly stop = (): void => {
        this.onStop();
    }

    @property()
    public playerControllerType: Constructor<Controller> | undefined;

    @property()
    public playerCharacterType: Constructor<Character> | undefined;

    @property()
    public playerStateType: Constructor<PlayerState> | undefined;

    public readonly _tick = (deltaTime: number): void => {
        this.tick(deltaTime);
    }

    public setCurrentLevel(level: Level): void {
        this._currentLevel = level;
    }

    tick(_deltaTime: number): void {}

    public readonly _onGameStart = (): void => {
        this.onGameStart();
    }

    onGameStart(): void {
        // Custom logic for when the game starts
    }

    public readonly _onStop = (): void => {
        this.onStop();
    }

    public onStop(): void {
        // Custom logic for when the game stops
    }

    public onPawnSpawned(pawn: Pawn): void {
        // Custom logic for when a pawn is spawned
    }

    public pickPlayerStart(): PlayerStart | null {
        // Custom logic to pick a player start
        const playerStartPositions = this._currentLevel?.getChildrenOfType(PlayerStart) || [];
        if (playerStartPositions.length === 0) {
            return null;
        }

        // select random player start

        const randomIndex = Math.floor(Math.random() * playerStartPositions.length);
        return playerStartPositions[randomIndex];
    }
}