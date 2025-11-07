import { Controller } from "./controller";

export class PlayerState {
    private controller: Controller | null = null;

    getController(): Controller | null {
        return this.controller;
    }
    
    setController<T extends Controller>(controller: T) {
        this.controller = controller;
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