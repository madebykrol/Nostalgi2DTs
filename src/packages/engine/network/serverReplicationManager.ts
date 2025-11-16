import { Actor } from "../world/actor";
import { Vector2 } from "../math/vector2";
import { InputState, ActorState, ActorUpdateMessage, ClientInputMessage } from "./messages";

/**
 * Manages actor replication on the server
 * Handles input replay and authoritative state broadcasting
 */
export class ServerReplicationManager {
    private replicatedActors: Map<string, Actor> = new Map();
    private actorSequences: Map<string, number> = new Map();
    private actorIds: Map<Actor, string> = new Map();
    private inputHistory: Map<string, Array<{ sequence: number; inputs: InputState[] }>> = new Map();
    private readonly INPUT_HISTORY_SIZE = 60; // Keep last 60 input batches

    /**
     * Register an actor for replication
     */
    registerActor(actor: Actor, actorId: string): void {
        if (actor.shouldReplicate) {
            this.replicatedActors.set(actorId, actor);
            this.actorIds.set(actor, actorId);
            this.actorSequences.set(actorId, 0);
            this.inputHistory.set(actorId, []);
        }
    }

    /**
     * Unregister an actor from replication
     */
    unregisterActor(actorId: string): void {
        const actor = this.replicatedActors.get(actorId);
        if (actor) {
            this.actorIds.delete(actor);
        }
        this.replicatedActors.delete(actorId);
        this.actorSequences.delete(actorId);
        this.inputHistory.delete(actorId);
    }

    /**
     * Get actor ID for an actor
     */
    getActorId(actor: Actor): string | undefined {
        return this.actorIds.get(actor);
    }

    /**
     * Process client input and replay it on the server
     */
    processClientInput(message: ClientInputMessage): { success: boolean; error?: string } {
        const actor = this.replicatedActors.get(message.actorId);
        
        if (!actor) {
            return { success: false, error: "UNKNOWN_ACTOR" };
        }

        // Validate ownership
        if (!actor.possessedBy || actor.possessedBy !== message.ownerId as any) {
            return { success: false, error: "INVALID_OWNERSHIP" };
        }

        // Validate sequence number
        const lastSeq = this.actorSequences.get(message.actorId) || 0;
        if (message.sequence <= lastSeq) {
            // Out of order or duplicate, ignore
            return { success: false, error: "INVALID_SEQUENCE" };
        }

        // Validate inputs
        if (!this.validateInputs(message.inputs)) {
            return { success: false, error: "INVALID_INPUT" };
        }

        // Store input history
        this.storeInputHistory(message.actorId, message.sequence, message.inputs);

        // Replay inputs to compute authoritative state
        this.replayInputs(actor, message.inputs);

        // Update sequence number
        this.actorSequences.set(message.actorId, message.sequence);

        return { success: true };
    }

    /**
     * Get current state of all replicated actors
     */
    getActorUpdates(): ActorUpdateMessage {
        const updates: Array<{ actorId: string; sequence: number; state: ActorState }> = [];

        this.replicatedActors.forEach((actor, actorId) => {
            const sequence = this.actorSequences.get(actorId) || 0;
            const pos = actor.getPosition();
            
            updates.push({
                actorId,
                sequence,
                state: {
                    position: { x: pos.x, y: pos.y },
                    rotation: actor.getRotation()
                }
            });
        });

        return {
            type: "actor:update",
            timestamp: Date.now(),
            updates
        };
    }

    /**
     * Get state updates only for server-owned actors
     */
    getServerOwnedActorUpdates(): ActorUpdateMessage {
        const updates: Array<{ actorId: string; sequence: number; state: ActorState }> = [];

        this.replicatedActors.forEach((actor, actorId) => {
            // Only include server-owned actors (no possessedBy)
            if (actor.possessedBy === null) {
                const sequence = this.actorSequences.get(actorId) || 0;
                const pos = actor.getPosition();
                
                updates.push({
                    actorId,
                    sequence,
                    state: {
                        position: { x: pos.x, y: pos.y },
                        rotation: actor.getRotation()
                    }
                });
            }
        });

        return {
            type: "actor:update",
            timestamp: Date.now(),
            updates
        };
    }

    /**
     * Replay inputs on an actor
     */
    private replayInputs(actor: Actor, inputs: InputState[]): void {
        for (const input of inputs) {
            this.applyInputToActor(actor, input);
        }
    }

    /**
     * Apply a single input to an actor
     * This logic must match the client's movement logic exactly
     */
    private applyInputToActor(actor: Actor, input: InputState): void {
        const speed = 5.0; // Movement speed
        const currentPos = actor.getPosition();
        let dx = 0;
        let dy = 0;

        // Process keyboard input
        if (input.keys.pressed.includes('w') || input.keys.pressed.includes('ArrowUp')) {
            dy += speed * input.deltaTime;
        }
        if (input.keys.pressed.includes('s') || input.keys.pressed.includes('ArrowDown')) {
            dy -= speed * input.deltaTime;
        }
        if (input.keys.pressed.includes('a') || input.keys.pressed.includes('ArrowLeft')) {
            dx -= speed * input.deltaTime;
        }
        if (input.keys.pressed.includes('d') || input.keys.pressed.includes('ArrowRight')) {
            dx += speed * input.deltaTime;
        }

        // Apply movement
        if (dx !== 0 || dy !== 0) {
            const newPos = new Vector2(currentPos.x + dx, currentPos.y + dy);
            actor.setPosition(newPos);
        }

        // Process mouse input for rotation
        if (input.mouse) {
            const angle = Math.atan2(
                input.mouse.position.y - currentPos.y,
                input.mouse.position.x - currentPos.x
            );
            actor.setRotation(angle);
        }
    }

    /**
     * Validate input data
     */
    private validateInputs(inputs: InputState[]): boolean {
        if (!Array.isArray(inputs) || inputs.length > 10) {
            return false; // Too many inputs in one batch
        }

        for (const input of inputs) {
            // Validate deltaTime is reasonable
            if (input.deltaTime < 0 || input.deltaTime > 1.0) {
                return false;
            }

            // Validate keys are reasonable
            if (!Array.isArray(input.keys.pressed) || input.keys.pressed.length > 10) {
                return false;
            }
        }

        return true;
    }

    /**
     * Store input history for debugging/replay
     */
    private storeInputHistory(actorId: string, sequence: number, inputs: InputState[]): void {
        let history = this.inputHistory.get(actorId);
        if (!history) {
            history = [];
            this.inputHistory.set(actorId, history);
        }

        history.push({ sequence, inputs });

        // Keep only recent history
        if (history.length > this.INPUT_HISTORY_SIZE) {
            history.shift();
        }
    }
}
