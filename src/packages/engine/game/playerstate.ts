import { Controller } from "./controller";

export class PlayerState {
    setController<T extends Controller>(controller: T) {
        throw new Error("Method not implemented.");
    }
    playerId: string;
    playerName: string;
    isConnected: boolean = true;
    isLocal: unknown;

    constructor(playerId: string, playerName: string) {
        this.playerId = playerId;
        this.playerName = playerName;
    }
}