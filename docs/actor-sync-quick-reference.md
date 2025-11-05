# Actor Synchronization Protocol - Quick Reference

Quick reference guide for implementing actor synchronization in Nostalgi2D.

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Server-Owned Actor** | Actor with `possessedBy = null`, controlled by server |
| **Client-Owned Actor** | Actor with `possessedBy = Controller`, controlled by client |
| **Replication** | Syncing actor state from server to clients |
| **Authority** | Server is the authoritative source of truth |

## Message Types Quick Reference

### Server → Client

| Message Type | When to Send | Purpose |
|--------------|--------------|---------|
| `world:snapshot` | Client connects | Full world state |
| `actor:spawn` | New actor created | Notify clients to spawn actor |
| `actor:update` | Periodic (30-120Hz) | Sync actor state changes |
| `actor:despawn` | Actor removed | Notify clients to remove actor |
| `ack` | Client update received | Acknowledge client update |
| `error` | Validation fails | Notify client of error |

### Client → Server

| Message Type | When to Send | Purpose |
|--------------|--------------|---------|
| `client:ready` | Connection established | Request world state |
| `client:actor:update` | Actor state changes | Update owned actor |

## Rules

### ✅ Allowed

- ✅ Server sends updates for ALL replicated actors
- ✅ Server sends spawn/despawn messages for ALL actors
- ✅ Client sends updates for OWNED actors only
- ✅ Client applies updates for NON-OWNED actors

### ❌ Not Allowed

- ❌ Client sends updates for server-owned actors
- ❌ Client sends updates for other players' actors
- ❌ Client sends spawn/despawn messages
- ❌ Client applies updates for owned actors (already updated locally)

## Implementation Checklist

### Server Setup

```typescript
// 1. Track replicated actors
private replicatedActors: Map<string, Actor> = new Map();

// 2. Register actors for replication
if (actor.shouldReplicate) {
  this.replicatedActors.set(actorId, actor);
}

// 3. Send spawn message to all clients
broadcast({ type: "actor:spawn", actorId, ... });

// 4. Periodic update loop (30-120 Hz)
setInterval(() => {
  const updates = collectUpdates(); // Server-owned only
  broadcast({ type: "actor:update", updates });
}, 1000 / 60);

// 5. Handle client updates
socket.on("message", (msg) => {
  if (msg.type === "client:actor:update") {
    validateOwnership(); // CRITICAL
    applyUpdate();
    broadcastToOthers();
  }
});

// 6. Send snapshot on connect
socket.on("client:ready", () => {
  sendWorldSnapshot(socket);
});
```

### Client Setup

```typescript
// 1. Connect and request state
socket.send({ type: "client:ready" });

// 2. Handle snapshot
socket.on("world:snapshot", (msg) => {
  spawnAllActors(msg.actors);
});

// 3. Handle actor spawn
socket.on("actor:spawn", (msg) => {
  spawnActor(msg.actorId, msg.actorType, msg.initialState);
});

// 4. Handle updates (non-owned actors only)
socket.on("actor:update", (msg) => {
  msg.updates.forEach(update => {
    if (!isOwnedByMe(update.actorId)) {
      applyUpdate(update);
    }
  });
});

// 5. Send owned actor updates
setInterval(() => {
  if (ownedActor) {
    socket.send({
      type: "client:actor:update",
      actorId: ownedActor.id,
      state: getCurrentState()
    });
  }
}, 1000 / 60);

// 6. Handle despawn
socket.on("actor:despawn", (msg) => {
  removeActor(msg.actorId);
});
```

## Common Patterns

### Pattern: Spawn Actor (Server)

```typescript
function spawnReplicatedActor(actor: Actor, actorType: string) {
  const actorId = generateId();
  actor.shouldReplicate = true;
  
  // 1. Spawn locally
  engine.spawnActor(actor);
  
  // 2. Track for replication
  replicatedActors.set(actorId, actor);
  
  // 3. Broadcast spawn
  broadcast({
    type: "actor:spawn",
    actorId,
    actorType,
    ownerId: actor.possessedBy?.id ?? null,
    initialState: extractState(actor)
  });
}
```

### Pattern: Handle Spawn (Client)

```typescript
function handleActorSpawn(msg: any) {
  // 1. Create actor instance
  const actor = createActorByType(msg.actorType);
  
  // 2. Apply initial state
  actor.setPosition(msg.initialState.position);
  actor.setRotation(msg.initialState.rotation);
  
  // 3. Spawn in world
  engine.spawnActor(actor);
  
  // 4. Track remote actor
  remoteActors.set(msg.actorId, actor);
}
```

### Pattern: Send Updates (Server)

```typescript
function sendUpdates() {
  const updates = [];
  
  replicatedActors.forEach((actor, actorId) => {
    // Only server-owned actors
    if (actor.possessedBy === null && hasChanged(actor)) {
      updates.push({
        actorId,
        position: actor.getPosition(),
        rotation: actor.getRotation()
      });
    }
  });
  
  if (updates.length > 0) {
    broadcast({ type: "actor:update", updates });
  }
}
```

### Pattern: Validate Client Update (Server)

```typescript
function handleClientUpdate(session: Session, msg: any) {
  const actor = replicatedActors.get(msg.actorId);
  
  // 1. Validate actor exists
  if (!actor) {
    sendError(session, "UNKNOWN_ACTOR");
    return;
  }
  
  // 2. Validate ownership (CRITICAL!)
  if (actor.possessedBy?.id !== session.id) {
    sendError(session, "INVALID_OWNERSHIP");
    return;
  }
  
  // 3. Validate state
  if (!isValidState(msg.state)) {
    sendError(session, "INVALID_STATE");
    return;
  }
  
  // 4. Apply update
  actor.setPosition(msg.state.position);
  actor.setRotation(msg.state.rotation);
  
  // 5. Broadcast to others
  broadcastToOthers(session, {
    type: "actor:update",
    updates: [{ actorId: msg.actorId, ...msg.state }]
  });
}
```

## Validation Checklist

### Server Validation (CRITICAL)

- [ ] ✅ Verify actor exists
- [ ] ✅ Verify ownership matches session
- [ ] ✅ Verify state values are in bounds
- [ ] ✅ Rate limit updates per client
- [ ] ✅ Log suspicious activity

### Client Validation

- [ ] ✅ Verify actor type is known
- [ ] ✅ Don't apply updates to owned actors
- [ ] ✅ Handle missing actors gracefully
- [ ] ✅ Request re-sync on desync

## Debugging Tips

### Enable Debug Logging

```typescript
// Server
const DEBUG_NETWORK = true;
if (DEBUG_NETWORK) {
  console.log(`[NET] Actor ${actorId} updated:`, state);
}

// Client
const DEBUG_NETWORK = true;
if (DEBUG_NETWORK) {
  console.log(`[NET] Received update for ${actorId}:`, update);
}
```

### Monitor Update Frequency

```typescript
class UpdateMonitor {
  private counts = new Map<string, number>();
  
  logUpdate(actorId: string) {
    this.counts.set(actorId, (this.counts.get(actorId) || 0) + 1);
  }
  
  printStats() {
    console.log("Updates per actor:");
    this.counts.forEach((count, id) => {
      console.log(`  ${id}: ${count} updates`);
    });
    this.counts.clear();
  }
}

// Call printStats every second
setInterval(() => monitor.printStats(), 1000);
```

### Detect Desync

```typescript
// Client-side desync detection for owned actor
function detectDesync(actorId: string, serverState: any) {
  const localState = getLocalState(actorId);
  const distance = Vector2.distance(
    localState.position,
    serverState.position
  );
  
  if (distance > DESYNC_THRESHOLD) {
    console.warn(`Desync detected for ${actorId}: ${distance}`);
    // Request re-sync or apply server correction
  }
}
```

## Performance Optimization

### Update Frequency by Distance

```typescript
function getUpdateFrequency(actor: Actor, camera: Camera): number {
  const distance = Vector2.distance(
    actor.getPosition(),
    camera.getPosition()
  );
  
  if (distance < 100) return 60; // Close: 60 Hz
  if (distance < 500) return 30; // Medium: 30 Hz
  return 10; // Far: 10 Hz
}
```

### Batch Updates

```typescript
// Bad: Send individual updates
updates.forEach(update => {
  socket.send(JSON.stringify({ type: "actor:update", ...update }));
});

// Good: Batch updates
socket.send(JSON.stringify({
  type: "actor:update",
  updates: updates
}));
```

### Delta Compression

```typescript
function getDelta(previous: State, current: State): State {
  const delta: any = {};
  
  if (previous.position.x !== current.position.x ||
      previous.position.y !== current.position.y) {
    delta.position = current.position;
  }
  
  if (previous.rotation !== current.rotation) {
    delta.rotation = current.rotation;
  }
  
  return delta;
}
```

## Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `INVALID_OWNERSHIP` | Client updating non-owned actor | Only send updates for owned actors |
| `UNKNOWN_ACTOR` | Update for non-existent actor | Request world snapshot |
| Desync | Prediction mismatch | Implement server reconciliation |
| High latency | Too many updates | Reduce update frequency |
| Jumpy movement | No interpolation | Add interpolation on client |

## Testing

### Unit Test Template

```typescript
describe("Actor Synchronization", () => {
  let server: Server;
  let client: Client;
  
  beforeEach(() => {
    server = new Server("localhost", 3001);
    client = new Client();
  });
  
  it("should spawn actor on all clients", async () => {
    // 1. Server spawns actor
    const actor = new DemoActor("test");
    server.spawnReplicatedActor(actor);
    
    // 2. Verify broadcast
    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "actor:spawn" })
    );
  });
  
  it("should reject non-owned actor updates", () => {
    // 1. Client tries to update server-owned actor
    const result = server.handleClientUpdate(session, {
      actorId: "server-actor",
      ownerId: "client1"
    });
    
    // 2. Verify rejection
    expect(result).toBe(false);
    expect(mockSendError).toHaveBeenCalledWith(
      session, "INVALID_OWNERSHIP"
    );
  });
});
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                        SERVER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Server Actor │  │ Server Actor │  │Client Actor 1│  │
│  │   (NPC)      │  │ (Environment)│  │(Owned by C1) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                  │                  │          │
│         └──────────────────┴──────────────────┘          │
│                            │                             │
│                     ┌──────▼──────┐                      │
│                     │  Broadcast  │                      │
│                     │   Updates   │                      │
│                     └──────┬──────┘                      │
└────────────────────────────┼────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐  ┌──▼──────────┐ ┌─▼─────────────┐
     │   CLIENT 1     │  │  CLIENT 2   │ │   CLIENT 3    │
     │                │  │             │ │               │
     │ ┌────────────┐ │  │┌───────────┐│ │┌────────────┐ │
     │ │Own Actor 1 │ │  ││Own Actor 2││ ││Remote      │ │
     │ │(Controlled)│ │  ││           ││ ││Actors      │ │
     │ └────┬───────┘ │  │└─────┬─────┘│ │└────────────┘ │
     │      │Updates  │  │      │      │ │               │
     └──────┼─────────┘  └──────┼──────┘ └───────────────┘
            │                   │
            └───────┬───────────┘
                    │
            ┌───────▼────────┐
            │ Client Updates │
            │  to Server     │
            └────────────────┘
```

## References

- Main Protocol Document: `docs/actor-synchronization-protocol.md`
- Implementation Examples: `docs/actor-synchronization-examples.md`
- Actor Base Class: `src/packages/engine/world/actor.ts`
- Network Endpoint: `src/packages/engine/network/endpoint.ts`
