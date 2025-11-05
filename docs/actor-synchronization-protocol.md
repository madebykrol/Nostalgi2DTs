# Actor Synchronization Protocol

**Version:** 1.0 (Draft)  
**Date:** 2025-11-05  
**Status:** Initial Draft

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
3. **Client Ownership**: Clients can only send synchronization data for actors they own
4. **Optimistic Updates**: Clients may update their owned actors locally and send updates to the server
5. **Server Reconciliation**: The server validates and reconciles client updates with its authoritative state

## Actor Ownership Model

### Server-Owned Actors
- Owned and controlled by the server
- State is replicated from server to all clients
- Clients cannot send updates for these actors
- Examples: NPCs, environment actors, projectiles spawned by the server

### Client-Owned Actors
- Possessed by a player's controller (identified by `Actor.possessedBy`)
- Client sends state updates to the server
- Server validates and broadcasts to other clients
- Only the owning client can send updates
- Examples: player characters, player-spawned projectiles

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

#### 2.1. Owned Actor State Update (`client:actor:update`)

Sent by clients to update their owned actor state.

```typescript
{
  type: "client:actor:update",
  clientTimestamp: number,  // Client's local timestamp
  sequence: number,         // Client sequence number for reconciliation
  actorId: string,
  ownerId: string,         // Must match the client's controller ID
  state: {
    position: { x: number, y: number },
    rotation: number,
    // Additional changed properties
    deltaState?: Record<string, any>
  },
  inputs?: {               // Optional input state that led to this update
    keys: string[],
    mousePosition?: { x: number, y: number }
  }
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

### Actor Update Flow (Client-Owned)

```
1. Client updates owned actor locally
   └─> Based on local input
   └─> Optimistic update immediately

2. Client sends to server: client:actor:update
   └─> actorId: owned actor ID
   └─> ownerId: client's controller ID
   └─> sequence: client's sequence number
   └─> Include input state for replay

3. Server validates update
   ├─> Check: client owns this actor (possessedBy matches)
   ├─> Check: sequence number is valid
   └─> Apply or reject update

4. Server broadcasts to OTHER clients: actor:update
   └─> Authoritative state from server
   └─> Other clients apply update

5. Server sends to owning client: ack
   └─> Include server timestamp
   └─> Client can reconcile with prediction
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

The server MUST validate all client update requests:

1. **Ownership Check**: Verify `ownerId` in message matches `Actor.possessedBy`
2. **Sequence Check**: Ensure sequence numbers are monotonically increasing
3. **Rate Limiting**: Prevent flooding with too many updates
4. **Bounds Check**: Validate position and other values are within acceptable ranges

**Rejection Behavior:**
- Send `error` message to client
- Do NOT apply the update
- Do NOT broadcast to other clients
- Log the violation for potential anti-cheat

## Update Frequency and Optimization

### Server Update Rates
- **High Priority Actors** (player characters): 60-120 Hz
- **Medium Priority Actors** (nearby NPCs): 30-60 Hz
- **Low Priority Actors** (distant objects): 10-30 Hz

### Client Update Rates
- **Owned Actor Updates**: Send on input change or every 60-120 Hz
- **Throttling**: Limit to prevent network saturation

### Bandwidth Optimization
- **Delta Compression**: Only send changed fields
- **Batching**: Combine multiple actor updates in single message
- **Culling**: Don't send updates for actors outside client's view
- **Interest Management**: Prioritize nearby/relevant actors

## Error Handling

### Client Errors
- **Unknown Actor**: Client receives update for unknown actorId
  - Request re-sync with `world:snapshot`
- **Ownership Mismatch**: Client receives ownership update for non-owned actor
  - Reject and log warning
- **Desync Detected**: Client state diverges significantly from server
  - Request full `world:snapshot`

### Server Errors
- **Invalid Ownership**: Client attempts to update non-owned actor
  - Send `error` with code "INVALID_OWNERSHIP"
  - Potential kick for repeated violations
- **Malformed Message**: Invalid JSON or missing required fields
  - Send `error` with code "MALFORMED_MESSAGE"
  - Close connection on repeated occurrences

## Future Enhancements

This initial draft may be extended with:

1. **Component Replication**: Synchronize individual actor components
2. **RPC System**: Remote procedure calls for actions/events
3. **Snapshot Interpolation**: Smoother state updates
4. **Server Reconciliation**: Server-side replay of client inputs
5. **Network Prediction**: Client-side prediction for owned actors
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
- [ ] Implement update batching
- [ ] Validate client ownership on every update
- [ ] Broadcast server-owned actor updates
- [ ] Handle client disconnection (despawn owned actors)
- [ ] Implement snapshot generation for new clients

### Client Implementation Checklist
- [ ] Handle world snapshot on connect
- [ ] Instantiate actors from spawn messages
- [ ] Apply server updates to non-owned actors
- [ ] Send updates only for owned actors
- [ ] Implement client-side prediction (optional)
- [ ] Handle actor despawn messages

## References

- Engine Network Modes: `EngineNetworkMode` type in `engine.ts`
- Actor Base Class: `src/packages/engine/world/actor.ts`
- Network Endpoint: `src/packages/engine/network/endpoint.ts`
- Server Implementation: `src/apps/server/server.ts`

## Change Log

- **2025-11-05**: Initial draft created based on issue #35
