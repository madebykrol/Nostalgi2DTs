# Actor Synchronization Protocol - Visual Diagrams

This document contains visual diagrams to help understand the actor synchronization protocol.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER (Authoritative)                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    Engine (Server Mode)                 │    │
│  │                                                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │    │
│  │  │Server Actors │  │Server Actors │  │Client Actors │ │    │
│  │  │    (NPCs)    │  │ (Environment)│  │  (Players)   │ │    │
│  │  │              │  │              │  │              │ │    │
│  │  │possessedBy:  │  │possessedBy:  │  │possessedBy:  │ │    │
│  │  │    null      │  │    null      │  │  Controller  │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │            Network Endpoint (WebSocket Server)          │    │
│  │                                                          │    │
│  │  Sessions: [Session1, Session2, Session3, ...]         │    │
│  └────────────────────────────────────────────────────────┘    │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        │ WebSocket
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼───────┐ ┌─────▼──────┐ ┌─────▼──────┐
│   CLIENT 1    │ │  CLIENT 2  │ │  CLIENT 3  │
│               │ │            │ │            │
│ ┌───────────┐ │ │┌──────────┐│ │┌──────────┐│
│ │My Actor   │ │ ││My Actor  ││ ││Remote    ││
│ │(Owned)    │ │ ││(Owned)   ││ ││Actors    ││
│ │           │ │ ││          ││ ││(Others)  ││
│ └───────────┘ │ │└──────────┘│ │└──────────┘│
│ ┌───────────┐ │ │┌──────────┐│ │┌──────────┐│
│ │Remote     │ │ ││Remote    ││ ││Remote    ││
│ │Actors     │ │ ││Actors    ││ ││Actors    ││
│ └───────────┘ │ │└──────────┘│ │└──────────┘│
└───────────────┘ └────────────┘ └────────────┘
```

## Data Flow - Actor Spawn (Server-Owned)

```
┌────────────┐
│   SERVER   │
└─────┬──────┘
      │
      │ 1. New actor spawned
      │    actor.shouldReplicate = true
      │    actor.possessedBy = null
      │
      ├──────────────────────────────────────┐
      │                                      │
      │ 2. Broadcast: actor:spawn            │
      │    {                                 │
      │      actorId: "npc_123",            │
      │      actorType: "Enemy",            │
      │      ownerId: null,                 │
      │      initialState: {...}            │
      │    }                                │
      │                                      │
      ▼                                      ▼
┌──────────┐                          ┌──────────┐
│ Client 1 │                          │ Client 2 │
└────┬─────┘                          └────┬─────┘
     │                                     │
     │ 3. Receive spawn message            │ 3. Receive spawn message
     │                                     │
     │ 4. Create actor locally             │ 4. Create actor locally
     │    const npc = new Enemy()          │    const npc = new Enemy()
     │                                     │
     │ 5. Apply initial state              │ 5. Apply initial state
     │    npc.setPosition(...)             │    npc.setPosition(...)
     │                                     │
     │ 6. Add to world                     │ 6. Add to world
     │    engine.spawnActor(npc)           │    engine.spawnActor(npc)
     │                                     │
     ▼                                     ▼
```

## Data Flow - Actor Update (Server-Owned)

```
Time: T=0                    T=16ms                  T=32ms
┌────────────┐            ┌────────────┐         ┌────────────┐
│   SERVER   │            │   SERVER   │         │   SERVER   │
│            │            │            │         │            │
│ Actor NPC  │  Tick -->  │ Actor NPC  │  Tick  │ Actor NPC  │
│ pos: (0,0) │            │ pos: (1,0) │  --->  │ pos: (2,0) │
└─────┬──────┘            └─────┬──────┘         └─────┬──────┘
      │                         │                      │
      │                         │ Update msg           │ Update msg
      │                         │                      │
      ▼                         ▼                      ▼
┌──────────┐            ┌──────────┐             ┌──────────┐
│ Client 1 │            │ Client 1 │             │ Client 1 │
│          │            │          │             │          │
│ NPC      │ Interpolate│ NPC      │ Interpolate │ NPC      │
│ (0,0)    │   ---->    │ (0.5,0)  │   ---->     │ (1.5,0)  │
└──────────┘            └──────────┘             └──────────┘
                        Apply update             Apply update
                        Target: (1,0)            Target: (2,0)
```

## Data Flow - Client Actor Update (Player-Owned)

```
┌───────────┐                              ┌────────────┐
│ Client 1  │                              │   SERVER   │
│           │                              │            │
│ My Actor  │                              │ Client1's  │
│ (Owned)   │                              │   Actor    │
└─────┬─────┘                              └─────┬──────┘
      │                                          │
      │ 1. Input received (WASD)                 │
      │    Update locally (optimistic)           │
      │    pos: (5, 10) -> (6, 10)              │
      │                                          │
      │ 2. Send update to server                 │
      ├─────────────────────────────────────────>│
      │    client:actor:update                   │
      │    {                                     │
      │      actorId: "player_123",             │
      │      ownerId: "client1",                │ 3. Validate ownership
      │      state: {pos: (6,10)},              │    ✓ possessedBy matches
      │      sequence: 42                       │
      │    }                                     │ 4. Apply update
      │                                          │    pos: (6, 10)
      │                                          │
      │ 5. Send ACK                              │ 6. Broadcast to others
      │<─────────────────────────────────────────┤────────────┐
      │    ack: { sequence: 42 }                 │            │
      │                                          │            ▼
      │                                          │      ┌──────────┐
      │                                          │      │ Client 2 │
      │                                          │      │          │
      │                                          │      │ Remote   │
      │                                          │      │ Actor    │
      │                                          │      │ (Client1)│
      │                                          │      └────┬─────┘
      │                                          │           │
      │                                          │           │ 7. Apply update
      │                                          │           │    pos: (6, 10)
      ▼                                          ▼           ▼
```

## Connection Flow

```
┌──────────┐                                    ┌────────────┐
│  Client  │                                    │   Server   │
└────┬─────┘                                    └─────┬──────┘
     │                                                │
     │ 1. WebSocket Connect                           │
     ├───────────────────────────────────────────────>│
     │                                                │
     │                                                │ 2. Create Session
     │                                                │    userId, socket
     │                                                │
     │ 3. Send client:ready                           │
     ├───────────────────────────────────────────────>│
     │    { clientId, clientVersion }                 │
     │                                                │
     │                                                │ 4. Generate world
     │                                                │    snapshot
     │                                                │
     │ 5. Receive world:snapshot                      │
     │<───────────────────────────────────────────────┤
     │    { actors: [...] }                           │
     │                                                │
     │ 6. Spawn all actors                            │
     │    from snapshot                               │
     │                                                │
     │ 7. Send ACK                                    │
     ├───────────────────────────────────────────────>│
     │                                                │
     │                                                │ 8. Mark client ready
     │                                                │    Start sending updates
     │                                                │
     │ ═══════════════════════════════════════════════│
     │          Normal Operation Begins               │
     │ ═══════════════════════════════════════════════│
     │                                                │
     │ Periodic actor:update (30-120 Hz)              │
     │<───────────────────────────────────────────────┤
     │                                                │
     │ client:actor:update (for owned actors)         │
     ├───────────────────────────────────────────────>│
     │                                                │
     ▼                                                ▼
```

## Ownership Model

```
┌─────────────────────────────────────────────────────────┐
│                    Actor Ownership                       │
└─────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│   Server-Owned       │         │   Client-Owned       │
│                      │         │                      │
│ possessedBy: null    │         │ possessedBy:         │
│                      │         │   Controller         │
│ ┌──────────────┐    │         │                      │
│ │ Who Controls │    │         │ ┌──────────────┐    │
│ │   • SERVER   │    │         │ │ Who Controls │    │
│ └──────────────┘    │         │ │  • CLIENT    │    │
│                      │         │ │    (owning)  │    │
│ ┌──────────────┐    │         │ └──────────────┘    │
│ │ Who Updates  │    │         │                      │
│ │   • SERVER   │    │         │ ┌──────────────┐    │
│ └──────────────┘    │         │ │ Who Updates  │    │
│                      │         │ │  • CLIENT    │    │
│ ┌──────────────┐    │         │ │    (sends)   │    │
│ │ Replication  │    │         │ │  • SERVER    │    │
│ │  SERVER → *  │    │         │ │    (validates│    │
│ │  (broadcast) │    │         │ │    & relays) │    │
│ └──────────────┘    │         │ └──────────────┘    │
│                      │         │                      │
│ Examples:            │         │ Examples:            │
│ • NPCs               │         │ • Player Characters  │
│ • Environment        │         │ • Player Projectiles │
│ • Server Projectiles │         │ • Player Vehicles    │
└──────────────────────┘         └──────────────────────┘
```

## Message Flow Timing

```
Server Tick (30 Hz example)
│
├─ Tick 1 (T=0ms)
│  └─> Collect changed server actors
│      └─> Broadcast: actor:update
│
├─ Tick 2 (T=33ms)
│  └─> Collect changed server actors
│      └─> Broadcast: actor:update
│      └─> Receive client update
│          └─> Validate & apply
│          └─> Broadcast to others
│
├─ Tick 3 (T=66ms)
│  └─> Collect changed server actors
│      └─> Broadcast: actor:update
│
└─ Tick 4 (T=100ms)
   └─> ...

Client Tick (60 Hz example)
│
├─ Frame 1 (T=0ms)
│  └─> Process input
│      └─> Update owned actor
│      └─> Send: client:actor:update
│
├─ Frame 2 (T=16ms)
│  └─> Process input
│      └─> Update owned actor
│      └─> Receive: actor:update (server)
│          └─> Apply to remote actors
│
├─ Frame 3 (T=33ms)
│  └─> Process input
│      └─> Update owned actor
│      └─> Send: client:actor:update
│
└─ Frame 4 (T=50ms)
   └─> ...
```

## State Reconciliation

```
Client-Side Prediction with Server Reconciliation

Client Timeline:
T0    T1    T2    T3    T4    T5
│     │     │     │     │     │
├─────┼─────┼─────┼─────┼─────┤
│     │     │     │     │     │
│  Input   Input   │   Server
│   W     W,A      │    ACK
│ (pred)  (pred)   │   (T2)
│                  │     │
│   ┌──────────────┘     │
│   │ Reconcile:         │
│   │ • Server pos != client pos
│   │ • Replay inputs T2-T4
│   └──────────────────> │
│                        │
                    Corrected
                    position

Server sees:
T0    T1    T2    T3    T4    T5
│     │     │     │     │     │
├─────┼─────┼─────┼─────┼─────┤
│     │     │     │     │     │
│    Recv  Recv         │
│   Input  Input        │
│    W     W,A          │
│   Apply  Apply     Send
│    │     │          ACK
└────┴─────┴───────────>│
```

## Priority-Based Updates

```
┌─────────────────────────────────────────────────────┐
│            Actor Update Priority System             │
└─────────────────────────────────────────────────────┘

Distance from player's view:

Close (< 100 units)           Medium (100-500)         Far (> 500)
     │                              │                      │
     ├─> Priority: HIGH             ├─> Priority: MED     ├─> Priority: LOW
     ├─> Frequency: 60 Hz           ├─> Frequency: 30 Hz ├─> Frequency: 10 Hz
     ├─> Always send                ├─> Throttle          ├─> Heavy throttle
     │                              │                      │
┌────▼────┐                   ┌─────▼─────┐         ┌─────▼─────┐
│ Player  │                   │  Nearby   │         │  Distant  │
│ Actors  │                   │  Actors   │         │  Actors   │
│         │                   │           │         │           │
│ Full    │                   │ Delta     │         │ Sparse    │
│ State   │                   │ Updates   │         │ Updates   │
└─────────┘                   └───────────┘         └───────────┘

Bandwidth allocation:
████████████ (High priority)
██████ (Medium priority)  
██ (Low priority)
```

## Error Handling Flow

```
┌──────────┐                                ┌────────────┐
│  Client  │                                │   Server   │
└────┬─────┘                                └─────┬──────┘
     │                                            │
     │ Invalid actor update                       │
     │ (non-owned actor)                          │
     ├───────────────────────────────────────────>│
     │                                            │
     │                                            │ Validate
     │                                            │  ✗ Ownership fail
     │                                            │
     │ Receive error                              │
     │<───────────────────────────────────────────┤
     │  {                                         │
     │    type: "error",                         │
     │    code: "INVALID_OWNERSHIP",             │
     │    message: "..."                         │
     │  }                                         │
     │                                            │
     │ Log error                                  │ Log violation
     │ • Display warning (dev mode)               │ • Track attempts
     │ • Don't retry                              │ • Consider kick
     │                                            │   if repeated
     ▼                                            ▼

Desync Detected:
┌──────────┐                                ┌────────────┐
│  Client  │                                │   Server   │
└────┬─────┘                                └─────┬──────┘
     │                                            │
     │ Detect large position difference           │
     │ between local and server state             │
     │                                            │
     │ Request re-sync                            │
     ├───────────────────────────────────────────>│
     │  { type: "request_snapshot" }             │
     │                                            │
     │                                            │ Generate
     │                                            │ snapshot
     │ Receive full snapshot                      │
     │<───────────────────────────────────────────┤
     │  { type: "world:snapshot", ... }          │
     │                                            │
     │ Re-spawn all actors                        │
     │                                            │
     ▼                                            ▼
```

## Bandwidth Optimization

```
Before Optimization:
┌────────────────────────────────────────────┐
│  Separate messages for each actor          │
│                                            │
│  Message 1: actor:update { actor1 }   →   │ 500 bytes
│  Message 2: actor:update { actor2 }   →   │ 500 bytes
│  Message 3: actor:update { actor3 }   →   │ 500 bytes
│  Message 4: actor:update { actor4 }   →   │ 500 bytes
│  Message 5: actor:update { actor5 }   →   │ 500 bytes
│                                            │
│  Total: 2500 bytes                         │
└────────────────────────────────────────────┘

After Batching:
┌────────────────────────────────────────────┐
│  Batched update message                    │
│                                            │
│  Message: actor:update {                   │
│    updates: [                              │
│      actor1,                               │
│      actor2,                               │
│      actor3,                               │
│      actor4,                               │
│      actor5                                │
│    ]                                       │
│  }                                         │
│                                            │
│  Total: 1200 bytes (52% reduction)         │
└────────────────────────────────────────────┘

Delta Compression:
┌────────────────────────────────────────────┐
│  Full State (before):                      │
│  {                                         │
│    position: {x: 100, y: 200},            │
│    rotation: 1.57,                        │
│    velocity: {x: 5, y: 0},                │
│    health: 100,                           │
│    name: "Player1",                       │
│    layer: 1                               │
│  }                                         │
│  Size: ~150 bytes                          │
└────────────────────────────────────────────┘
               ↓
┌────────────────────────────────────────────┐
│  Delta State (after):                      │
│  {                                         │
│    position: {x: 101, y: 200}             │
│  }                                         │
│  Size: ~35 bytes (77% reduction)           │
└────────────────────────────────────────────┘
```

## References

See also:
- [actor-synchronization-protocol.md](./actor-synchronization-protocol.md) - Full protocol specification
- [actor-synchronization-examples.md](./actor-synchronization-examples.md) - Code examples
- [actor-sync-quick-reference.md](./actor-sync-quick-reference.md) - Quick reference guide
