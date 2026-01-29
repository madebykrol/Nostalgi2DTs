import { Engine } from "../engine";
import { Level } from "../level";
import { type Constructor, inject, property } from "../utils";
import { World } from "../world";
import { Character } from "./character";
import { Controller } from "./controller";
import { Pawn } from "./pawn";
import { PlayerStart } from "./playerstart";
import { PlayerState } from "./playerstate";

export abstract class GameMode {

    private _currentLevel: Level | null = null; 
    private _localPlayerState: PlayerState | null = null;

    public readonly start = (): void => {
        this.onGameStart();
    }

    public readonly stop = (): void => {
        this.onStop();
    }

    constructor(@inject(World) protected world: World, @inject(Engine) protected engine: Engine) {

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

    public tick(_deltaTime: number): void {}

    public readonly _onGameStart = (): void => {
        this.onGameStart();
    }

    public setLocalPlayerState(playerState: PlayerState): void {
        // Logic to set the local player state
        this._localPlayerState = playerState;
    }

    public getLocalPlayerState(): PlayerState | null {
        // Logic to get the local player state
        return this._localPlayerState;
    }

    public onGameStart(): void {
        // Custom logic for when the game starts
    }

    public readonly _onStop = (): void => {
        this.onStop();
    }

    public onStop(): void {
        // Custom logic for when the game stops
    }

    public spawnPawnForPlayer(playerState: PlayerState): void {
        const playerPawnCtor = this.playerCharacterType;

        if (playerState && playerPawnCtor) {
            const pawn = this.engine.createObject(playerPawnCtor, playerState.playerId);
            const sceneRoot = this.engine.getRootObject();

            this.world.spawnActorInstance(pawn, sceneRoot, this.pickPlayerStart()?.position);

            playerState.getController()?.possess(pawn);
            this.setLocalPlayerState(playerState);
        }
    }

    public onPawnSpawned(_pawn: Pawn): void {
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