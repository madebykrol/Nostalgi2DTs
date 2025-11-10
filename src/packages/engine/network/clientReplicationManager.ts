import { Actor } from "../world/actor";
import { Vector2 } from "../math/vector2";
import { InputState, ActorState, ActorUpdateMessage, ClientInputMessage } from "./messages";

interface PredictedState {
    sequence: number;
    position: Vector2;
    rotation: number;
}

interface InputHistoryEntry {
    sequence: number;
    input: InputState;
    predictedState: PredictedState;
}

/**
 * Manages actor replication on the client
 * Handles input capture, prediction, and state reconciliation
 */
export class ClientReplicationManager {
    private ownedActor: Actor | null = null;
    private ownedActorId: string | null = null;
    private clientSequence: number = 0;
    private inputHistory: Map<number, InputHistoryEntry> = new Map();
    private currentInputBuffer: InputState[] = [];
    private pressedKeys: Set<string> = new Set();
    
    private lastSendTime: number = 0;
    private inputSendRate: number = 1000 / 60; // 60 Hz
    
    private remoteActors: Map<string, Actor> = new Map();
    
    private readonly RECONCILIATION_THRESHOLD = 0.1; // 0.1 units
    private readonly INPUT_HISTORY_SIZE = 120; // 2 seconds at 60 Hz

    /**
     * Set the owned actor for this client
     */
    setOwnedActor(actor: Actor, actorId: string): void {
        this.ownedActor = actor;
        this.ownedActorId = actorId;
        this.setupInputHandlers();
    }

    /**
     * Register a remote actor
     */
    registerRemoteActor(actorId: string, actor: Actor): void {
        this.remoteActors.set(actorId, actor);
    }

    /**
     * Unregister a remote actor
     */
    unregisterRemoteActor(actorId: string): void {
        this.remoteActors.delete(actorId);
    }

    /**
     * Setup input event handlers
     */
    private setupInputHandlers(): void {
        window.addEventListener('keydown', (e) => {
            if (!this.pressedKeys.has(e.key)) {
                this.pressedKeys.add(e.key);
            }
        });

        window.addEventListener('keyup', (e) => {
            this.pressedKeys.delete(e.key);
        });
    }

    /**
     * Capture and process input every frame
     * Returns input message to send to server if ready
     */
    captureInput(deltaTime: number, ownerId: string): ClientInputMessage | null {
        if (!this.ownedActor || !this.ownedActorId) {
            return null;
        }

        const input: InputState = {
            timestamp: performance.now(),
            deltaTime: deltaTime,
            keys: {
                pressed: Array.from(this.pressedKeys),
                released: []
            }
        };

        // Apply input locally (client prediction)
        this.applyInputToActor(this.ownedActor, input);

        // Store in buffer
        this.currentInputBuffer.push(input);

        // Try to send if it's time
        return this.trySendInputBatch(ownerId);
    }

    /**
     * Try to send input batch to server
     */
    private trySendInputBatch(ownerId: string): ClientInputMessage | null {
        const now = performance.now();

        // Send if enough time has passed or buffer is getting full
        if (now - this.lastSendTime < this.inputSendRate && 
            this.currentInputBuffer.length < 5) {
            return null;
        }

        if (this.currentInputBuffer.length === 0 || !this.ownedActor || !this.ownedActorId) {
            return null;
        }

        this.lastSendTime = now;
        this.clientSequence++;

        // Store current state for reconciliation
        this.inputHistory.set(this.clientSequence, {
            sequence: this.clientSequence,
            input: this.currentInputBuffer[this.currentInputBuffer.length - 1],
            predictedState: {
                sequence: this.clientSequence,
                position: new Vector2(this.ownedActor.getPosition().x, this.ownedActor.getPosition().y),
                rotation: this.ownedActor.getRotation()
            }
        });

        // Keep only recent history
        if (this.inputHistory.size > this.INPUT_HISTORY_SIZE) {
            const oldestKey = Math.min(...this.inputHistory.keys());
            this.inputHistory.delete(oldestKey);
        }

        // Create message
        const message: ClientInputMessage = {
            type: "client:input",
            clientTimestamp: Date.now(),
            sequence: this.clientSequence,
            actorId: this.ownedActorId,
            ownerId: ownerId,
            inputs: [...this.currentInputBuffer]
        };

        // Clear buffer
        this.currentInputBuffer = [];

        return message;
    }

    /**
     * Handle server state update and perform reconciliation
     */
    handleServerUpdate(message: ActorUpdateMessage): void {
        for (const update of message.updates) {
            const actor = this.remoteActors.get(update.actorId);
            
            // Check if this is our owned actor
            if (update.actorId === this.ownedActorId && this.ownedActor) {
                this.reconcileOwnedActor(update);
            } else if (actor) {
                // Apply update to remote actor with interpolation
                this.applyRemoteUpdate(actor, update.state);
            }
        }
    }

    /**
     * Reconcile owned actor with server state
     */
    private reconcileOwnedActor(update: { actorId: string; sequence: number; state: ActorState }): void {
        if (!this.ownedActor) return;

        const predicted = this.inputHistory.get(update.sequence);

        if (!predicted) {
            // No history for this sequence, just accept server state
            this.ownedActor.setPosition(new Vector2(update.state.position.x, update.state.position.y));
            this.ownedActor.setRotation(update.state.rotation);
            return;
        }

        // Compare with prediction
        const serverPosition = new Vector2(update.state.position.x, update.state.position.y);
        const positionError = predicted.predictedState.position.subtract(serverPosition).length();

        if (positionError > this.RECONCILIATION_THRESHOLD) {
            console.log(`Reconciliation needed: error ${positionError}`);

            // Server disagrees, reconcile
            this.ownedActor.setPosition(serverPosition);
            this.ownedActor.setRotation(update.state.rotation);

            // Replay inputs after this sequence
            const inputsToReplay = Array.from(this.inputHistory.entries())
                .filter(([seq, _]) => seq > update.sequence)
                .sort(([a, _], [b, __]) => a - b);

            for (const [_, data] of inputsToReplay) {
                this.applyInputToActor(this.ownedActor, data.input);
                // Update predicted state
                data.predictedState.position = new Vector2(
                    this.ownedActor.getPosition().x,
                    this.ownedActor.getPosition().y
                );
                data.predictedState.rotation = this.ownedActor.getRotation();
            }
        }

        // Clean up old history
        for (const [seq, _] of this.inputHistory.entries()) {
            if (seq <= update.sequence) {
                this.inputHistory.delete(seq);
            }
        }
    }

    /**
     * Apply server update to remote actor
     */
    private applyRemoteUpdate(actor: Actor, state: ActorState): void {
        // Simple direct update (could add interpolation here)
        actor.setPosition(new Vector2(state.position.x, state.position.y));
        actor.setRotation(state.rotation);
    }

    /**
     * Apply input to actor (must match server logic)
     */
    private applyInputToActor(actor: Actor, input: InputState): void {
        const speed = 5.0;
        const currentPos = actor.getPosition();
        let dx = 0;
        let dy = 0;

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

        if (dx !== 0 || dy !== 0) {
            const newPos = new Vector2(currentPos.x + dx, currentPos.y + dy);
            actor.setPosition(newPos);
        }

        if (input.mouse) {
            const angle = Math.atan2(
                input.mouse.position.y - currentPos.y,
                input.mouse.position.x - currentPos.x
            );
            actor.setRotation(angle);
        }
    }
}
