/**
 * Network message types for actor synchronization protocol
 * Based on input-based replication with server replay and client reconciliation
 */

export interface InputState {
    timestamp: number;
    deltaTime: number;
    keys: {
        pressed: string[];
        released: string[];
    };
    mouse?: {
        position: { x: number; y: number };
        buttons: number;
        deltaX?: number;
        deltaY?: number;
    };
    actions?: string[];
}

export interface ActorState {
    position: { x: number; y: number };
    rotation: number;
    velocity?: { x: number; y: number };
}

// Server to Client Messages

export interface ActorSpawnMessage {
    type: "actor:spawn";
    timestamp: number;
    actorId: string;
    actorType: string;
    ownerId: string | null;
    initialState: ActorState & {
        layer: number;
        name: string;
        shouldReplicate: boolean;
        properties?: Record<string, any>;
    };
}

export interface ActorUpdateMessage {
    type: "actor:update";
    timestamp: number;
    updates: Array<{
        actorId: string;
        sequence: number;
        state: ActorState;
    }>;
}

export interface ActorDespawnMessage {
    type: "actor:despawn";
    timestamp: number;
    actorId: string;
    reason?: string;
}

export interface WorldSnapshotMessage {
    type: "world:snapshot";
    timestamp: number;
    actors: Array<{
        actorId: string;
        actorType: string;
        ownerId: string | null;
        state: ActorState & {
            layer: number;
            name: string;
            properties?: Record<string, any>;
        };
    }>;
}

export interface ErrorMessage {
    type: "error";
    code: string;
    message: string;
    relatedMessageId?: string;
}

// Client to Server Messages

export interface ClientInputMessage {
    type: "client:input";
    clientTimestamp: number;
    sequence: number;
    actorId: string;
    ownerId: string;
    inputs: InputState[];
}

export interface ClientReadyMessage {
    type: "client:ready";
    clientId: string;
    clientVersion: string;
}

// Union types for message handling
export type ServerToClientMessage = 
    | ActorSpawnMessage
    | ActorUpdateMessage
    | ActorDespawnMessage
    | WorldSnapshotMessage
    | ErrorMessage;

export type ClientToServerMessage =
    | ClientInputMessage
    | ClientReadyMessage;

export type NetworkMessage = ServerToClientMessage | ClientToServerMessage;
