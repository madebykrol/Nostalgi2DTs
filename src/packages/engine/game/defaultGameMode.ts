import { GameMode } from "./gameMode";

export class DefaultGameMode extends GameMode { 
    public onGameStart(): void {
        console.log("DefaultGameMode: Game Started");
    }
}