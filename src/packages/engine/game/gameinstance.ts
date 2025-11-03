import { PlayerState } from "@repo/engine";

export class GameInstance {
    private players: Map<string, PlayerState> = new Map();

    constructor() {
        // Initialize game instance
    }

    public addPlayer(playerId: string, playerState: PlayerState): void {
        this.players.set(playerId, playerState);
    }

    public removePlayer(playerId: string): void {
        this.players.delete(playerId);
    }

    public getPlayer(playerId: string): PlayerState | undefined {
        return this.players.get(playerId);
    }
}