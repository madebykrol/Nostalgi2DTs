# Actor Synchronization Protocol

**Version:** 2.0 (Draft)  
**Date:** 2025-11-10  
**Status:** Revised Draft - Input-Based Replication

## Overview

This document defines the network protocol for synchronizing actors between the server and clients in the Nostalgi2D game engine. The protocol is designed to support a client-server architecture where the server is the authoritative source of truth for all game state.

## Terminology

- **Server**: The authoritative game instance that manages the game world and all non-player-owned actors
- **Client**: A player's game instance that connects to the server
- **Actor**: A game object that can be synchronized over the network
- **Owned Actor**: An actor that is possessed by a specific player's controller
- **Server Actor**: An actor owned and controlled by the server
- **Replication**: The process of synchronizing actor state from server to clients

## Core Principles

1. **Server Authority**: The server is the authoritative source for all actor state
2. **Unidirectional Server Broadcast**: Server actors are only sent FROM server TO clients (never the reverse)
3. **Input-Based Replication**: For client-owned actors, clients send **input batches** instead of state updates
4. **Server Simulation**: The server replays client inputs to compute authoritative state
5. **Client Prediction**: Clients simulate locally using inputs for immediate feedback
6. **State Reconciliation**: Server sends authoritative state back; clients verify and correct if different

## Actor Ownership Model

### Server-Owned Actors
- Owned and controlled by the server
- State is replicated from server to all clients
- Clients cannot send updates for these actors
- Examples: NPCs, environment actors, projectiles spawned by the server

### Client-Owned Actors
- Possessed by a player's controller (identified by `Actor.possessedBy`)
- Client sends **input batches** to the server, not state directly
- Server replays inputs to compute authoritative state
- Server broadcasts authoritative state to all clients
- Client verifies received state and corrects local simulation if different
- Only the owning client can send inputs
- Examples: player characters, player-controlled vehicles

## Message Types

### 1. Server-to-Client Messages

#### 1.1. Actor Spawn (`actor:spawn`)

Sent when a new actor is spawned in the world that clients need to know about.

```typescript
{
  type: "actor:spawn",
  timestamp: number,        // Server timestamp
  actorId: string,         // Unique identifier for the actor
  actorType: string,       // Class/type name for instantiation
  ownerId: string | null,  // Controller ID if player-owned, null if server-owned
  initialState: {
    position: { x: number, y: number },
    rotation: number,      // Radians
    layer: number,
    shouldReplicate: boolean,
    name: string,
    // Additional actor-specific properties
    properties: Record<string, any>
  }
}
```

#### 1.2. Actor State Update (`actor:update`)

Sent periodically to synchronize actor state changes.

```typescript
{
  type: "actor:update",
  timestamp: number,
  updates: Array<{
    actorId: string,
    sequence: number,        // Monotonically increasing per actor
    position?: { x: number, y: number },
    rotation?: number,
    // Additional changed properties
    deltaState?: Record<string, any>
  }>
}
```

#### 1.3. Actor Despawn (`actor:despawn`)

Sent when an actor is removed from the world.

```typescript
{
  type: "actor:despawn",
  timestamp: number,
  actorId: string,
  reason?: string          // Optional reason (e.g., "killed", "cleanup")
}
```

#### 1.4. Full World Snapshot (`world:snapshot`)

Sent when a client first connects or needs a full state refresh.

```typescript
{
  type: "world:snapshot",
  timestamp: number,
  actors: Array<{
    actorId: string,
    actorType: string,
    ownerId: string | null,
    state: {
      position: { x: number, y: number },
      rotation: number,
      layer: number,
      name: string,
      properties: Record<string, any>
    }
  }>
}
```

### 2. Client-to-Server Messages

#### 2.1. Input Batch (`client:input`)

Sent by clients to update their owned actor using input commands.

```typescript
{
  type: "client:input",
  clientTimestamp: number,  // Client's local timestamp when input was captured
  sequence: number,         // Client sequence number for reconciliation
  actorId: string,
  ownerId: string,         // Must match the client's controller ID
  inputs: Array<{
    timestamp: number,     // When this input occurred (client time)
    deltaTime: number,     // Time since last input
    keys: {                // Keyboard state
      pressed: string[],   // Keys currently pressed (e.g., ["w", "a", "d"])
      released: string[],  // Keys released this frame
    },
    mouse?: {              // Optional mouse input
      position: { x: number, y: number },
      buttons: number,     // Bitmask of pressed mouse buttons
      deltaX?: number,     // Mouse movement delta
      deltaY?: number
    },
    actions?: string[]     // Optional high-level actions (e.g., ["jump", "shoot"])
  }>
}
```

#### 2.2. Client Ready (`client:ready`)

Sent by client to indicate it's ready to receive world state.

```typescript
{
  type: "client:ready",
  clientId: string,
  clientVersion: string
}
```

### 3. Bidirectional Messages

#### 3.1. Acknowledgment (`ack`)

Sent to acknowledge receipt of messages.

```typescript
{
  type: "ack",
  messageId: string,       // ID of the acknowledged message
  sequence: number,        // Sequence number being acknowledged
  serverTimestamp?: number // Server's current timestamp (server-to-client only)
}
```

#### 3.2. Error (`error`)

Sent when a message is rejected or an error occurs.

```typescript
{
  type: "error",
  code: string,
  message: string,
  relatedMessageId?: string
}
```

## Protocol Flow

### Client Connection Flow

```
1. Client connects to server WebSocket
   └─> Client sends: client:ready

2. Server authenticates client and creates session
   └─> Server sends: world:snapshot (full world state)

3. Client spawns actors from snapshot
   └─> Client sends: ack

4. Normal operation begins
   ├─> Server sends periodic: actor:update (for all actors)
   └─> Client sends periodic: client:actor:update (for owned actors only)
```

### Actor Spawn Flow (Server-Owned)

```
1. Server spawns new actor
   └─> Actor.shouldReplicate = true
   └─> Actor.possessedBy = null

2. Server sends to all clients: actor:spawn
   └─> actorId: unique ID
   └─> ownerId: null (server-owned)

3. Clients instantiate actor locally
   └─> Clients send: ack
```

### Actor Update Flow (Server-Owned)

```
1. Server updates actor state
   └─> Every network tick (30-120 Hz)

2. Server collects all changed actors
   └─> Filter: shouldReplicate = true
   └─> Filter: possessedBy = null (server-owned)

3. Server sends to all clients: actor:update
   └─> Batch multiple actor updates together
   └─> Include sequence number per actor

4. Clients apply updates
   └─> Interpolate between old and new state
   └─> Send ack (optional, for reliability)
```

### Actor Update Flow (Client-Owned) - Input-Based

```
1. Client captures input
   └─> Keyboard, mouse, or controller input
   └─> Store in local input buffer with timestamp

2. Client predicts movement locally
   └─> Apply input to owned actor immediately
   └─> Store predicted state with sequence number
   └─> Provides instant feedback

3. Client sends input batch to server: client:input
   └─> actorId: owned actor ID
   └─> ownerId: client's controller ID
   └─> sequence: client's sequence number
   └─> inputs: array of input events since last send
   └─> Send every network tick or when input changes

4. Server validates input batch
   ├─> Check: client owns this actor (possessedBy matches)
   ├─> Check: sequence number is valid (monotonically increasing)
   └─> Reject if validation fails

5. Server replays inputs
   └─> Apply each input to actor in order
   └─> Compute new authoritative state
   └─> Uses same physics/logic as client

6. Server broadcasts to ALL clients: actor:update
   └─> Authoritative state from server
   └─> Include sequence number for reconciliation
   └─> All clients (including sender) receive update

7. Owning client performs reconciliation
   └─> Compare server state with predicted state
   └─> If different: 
       ├─> Rewind to last confirmed state
       ├─> Replay all inputs since sequence number
       └─> Correct local state to match server
   └─> If same: continue with current prediction

8. Other clients apply state
   └─> Interpolate between current and received state
   └─> No reconciliation needed (they don't predict)
```

### Actor Despawn Flow

```
1. Server marks actor for despawn
   └─> Actor.isMarkedForDespawn = true

2. Server sends to all clients: actor:despawn
   └─> actorId: actor to remove

3. Clients remove actor from world
   └─> Call actor.onDespawned()
   └─> Remove from scene graph
```

## Ownership Validation

The server MUST validate all client input requests:

1. **Ownership Check**: Verify `ownerId` in message matches `Actor.possessedBy`
2. **Sequence Check**: Ensure sequence numbers are monotonically increasing
3. **Rate Limiting**: Prevent flooding with too many input batches
4. **Input Validation**: Verify inputs are reasonable (e.g., no impossible key combinations)
5. **Timestamp Check**: Ensure timestamps are within acceptable range

**Rejection Behavior:**
- Send `error` message to client
- Do NOT apply the inputs
- Do NOT broadcast to other clients
- Log the violation for potential anti-cheat

## Update Frequency and Optimization

### Server Update Rates
- **High Priority Actors** (player characters): 60-120 Hz
- **Medium Priority Actors** (nearby NPCs): 30-60 Hz
- **Low Priority Actors** (distant objects): 10-30 Hz

### Client Input Rates
- **Input Capture**: Every frame (60 Hz typical)
- **Input Send Rate**: 30-60 Hz (batch multiple inputs if needed)
- **Throttling**: Send immediately on input change, or at fixed rate
- **Owned Actor Updates**: Send on input change or every 60-120 Hz
- **Throttling**: Limit to prevent network saturation

### Bandwidth Optimization
- **Input Batching**: Combine multiple input frames in single message
- **Delta Compression**: Only send changed input state
- **State Batching**: Combine multiple actor updates in single message
- **Culling**: Don't send updates for actors outside client's view
- **Interest Management**: Prioritize nearby/relevant actors

## Error Handling

### Client Errors
- **Unknown Actor**: Client receives update for unknown actorId
  - Request re-sync with `world:snapshot`
- **Ownership Mismatch**: Client receives ownership update for non-owned actor
  - Reject and log warning
- **Desync Detected**: Client state diverges significantly from server
  - Can self-correct via reconciliation
  - If persistent, request full `world:snapshot`

### Server Errors
- **Invalid Ownership**: Client attempts to send input for non-owned actor
  - Send `error` with code "INVALID_OWNERSHIP"
  - Potential kick for repeated violations
- **Malformed Message**: Invalid JSON or missing required fields
  - Send `error` with code "MALFORMED_MESSAGE"
  - Close connection on repeated occurrences
- **Invalid Input**: Input contains impossible or suspicious values
  - Send `error` with code "INVALID_INPUT"
  - Log for anti-cheat analysis

## Input Replay and Reconciliation

### Server Input Replay

The server must maintain deterministic simulation:

1. **Store Input History**: Keep recent inputs for each client actor
2. **Apply Inputs in Order**: Process inputs by sequence number
3. **Use Same Physics**: Apply identical movement/physics logic as client
4. **Compute State**: Generate authoritative position, rotation, etc.
5. **Broadcast Result**: Send state to all clients with sequence number

### Client Reconciliation

The owning client must reconcile predictions:

1. **Receive Server State**: Get authoritative state with sequence number
2. **Compare with Prediction**: Check local predicted state at that sequence
3. **If Match**: Continue with current prediction (common case)
4. **If Mismatch**:
   - Snap to server state
   - Discard inputs up to sequence number
   - Replay remaining inputs from buffer
   - Update visual state with corrected position

### Input Buffer Management

Clients must maintain input history:

```typescript
interface InputHistoryEntry {
  sequence: number;
  timestamp: number;
  input: InputState;
  predictedState: ActorState;
}

// Keep last N inputs (e.g., 1-2 seconds worth)
const INPUT_HISTORY_SIZE = 120; // 2 seconds at 60 Hz
```

## Future Enhancements

This revised draft may be extended with:

1. **Component Replication**: Synchronize individual actor components
2. **RPC System**: Remote procedure calls for actions/events
3. **Lag Compensation**: Server-side rewind for hit detection
4. **Adaptive Send Rates**: Adjust input/state send rates based on network conditions
5. **Input Compression**: Binary encoding for input data
6. **Lag Compensation**: Handling of network latency
7. **Bandwidth Budgets**: Dynamic quality based on connection
8. **Compression**: Binary protocol for reduced bandwidth

## Implementation Notes

### Required Actor Properties

For replication to work, actors must have:
- `shouldReplicate: boolean` - Enable network replication
- `possessedBy: Controller | null` - Ownership tracking
- Unique identifier (actorId) - Generated by server

### Server Implementation Checklist
- [ ] Track all replicated actors
- [ ] Implement state update batching
- [ ] **Implement input replay system for client-owned actors**
- [ ] **Maintain input history per client actor**
- [ ] Validate client ownership on every input batch
- [ ] **Use deterministic physics/simulation for input replay**
- [ ] Broadcast server-owned actor updates
- [ ] **Broadcast authoritative state for client-owned actors after input replay**
- [ ] Handle client disconnection (despawn owned actors)
- [ ] Implement snapshot generation for new clients

### Client Implementation Checklist
- [ ] Handle world snapshot on connect
- [ ] Instantiate actors from spawn messages
- [ ] Apply server updates to non-owned actors with interpolation
- [ ] **Implement input capture and buffering**
- [ ] **Send input batches for owned actors (not state)**
- [ ] **Implement client-side prediction for owned actors**
- [ ] **Maintain input history with predicted states**
- [ ] **Implement state reconciliation when receiving server updates**
- [ ] **Replay inputs after reconciliation if needed**
- [ ] Handle actor despawn messages

## References

- Engine Network Modes: `EngineNetworkMode` type in `engine.ts`
- Actor Base Class: `src/packages/engine/world/actor.ts`
- Network Endpoint: `src/packages/engine/network/endpoint.ts`
- Server Implementation: `src/apps/server/server.ts`
- Input Manager: `src/packages/engine/input/inputmanager.ts`
- Controller: `src/packages/engine/game/controller.ts`

## Change Log

- **2025-11-10**: Revised to use input-based replication with server replay and client reconciliation
- **2025-11-05**: Initial draft created based on issue #35
