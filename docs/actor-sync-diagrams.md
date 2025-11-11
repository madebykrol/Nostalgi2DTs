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

## Data Flow - Client Actor Update (Input-Based)

```
┌───────────┐                              ┌────────────┐
│ Client 1  │                              │   SERVER   │
│           │                              │            │
│ My Actor  │                              │ Client1's  │
│ (Owned)   │                              │   Actor    │
└─────┬─────┘                              └─────┬──────┘
      │                                          │
      │ 1. Input captured (WASD press)           │
      │    Store in input buffer                 │
      │                                          │
      │ 2. Predict movement locally              │
      │    Apply input to actor                  │
      │    pos: (5, 10) -> (6, 10)              │
      │    (instant feedback)                    │
      │                                          │
      │ 3. Send input batch to server            │
      ├─────────────────────────────────────────>│
      │    client:input                          │
      │    {                                     │
      │      actorId: "player_123",             │
      │      ownerId: "client1",                │ 4. Validate ownership
      │      sequence: 42,                      │    ✓ possessedBy matches
      │      inputs: [                          │
      │        {keys: ["w"], deltaTime: 0.016}  │ 5. Replay inputs
      │      ]                                   │    Apply same logic as client
      │    }                                     │    pos: (5, 10) -> (6, 10)
      │                                          │
      │                                          │ 6. Broadcast to ALL
      │ 7. Receive authoritative state           │    (including sender)
      │<─────────────────────────────────────────┤────────────┐
      │    actor:update                          │            │
      │    {                                     │            ▼
      │      sequence: 42,                       │      ┌──────────┐
      │      position: {x: 6, y: 10}             │      │ Client 2 │
      │    }                                     │      │          │
      │                                          │      │ Remote   │
      │ 8. Reconcile                             │      │ Actor    │
      │    Compare predicted vs server           │      │ (Client1)│
      │    If match: continue                    │      └────┬─────┘
      │    If mismatch:                          │           │
      │      - Snap to server state              │           │ 9. Apply update
      │      - Replay remaining inputs           │           │    pos: (6, 10)
      │                                          │           │    (interpolate)
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
     │ client:input (for owned actors)                │
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

Client Tick (60 Hz example) - Input-Based
│
├─ Frame 1 (T=0ms)
│  └─> Capture input (W pressed)
│      └─> Apply input locally (predict)
│      └─> Buffer input
│      └─> Send: client:input
│
├─ Frame 2 (T=16ms)
│  └─> Capture input (W still pressed)
│      └─> Apply input locally (predict)
│      └─> Receive: actor:update (server)
│          └─> Reconcile owned actor
│          └─> Apply to remote actors
│
├─ Frame 3 (T=33ms)
│  └─> Capture input (W, A pressed)
│      └─> Apply input locally (predict)
│      └─> Buffer input
│      └─> Send: client:input
│
└─ Frame 4 (T=50ms)
   └─> ...
```

## State Reconciliation (Input-Based)

```
Client-Side Prediction with Server Reconciliation

Client Timeline:
T0    T1    T2    T3    T4    T5
│     │     │     │     │     │
├─────┼─────┼─────┼─────┼─────┤
│     │     │     │     │     │
│  Input   Input   Input  Server    Input
│   W      W,A      D     Update    A,D
│ (pred)  (pred)  (pred)  (seq:T2) (pred)
│  Seq:1   Seq:2   Seq:3    │      Seq:4
│                           │
│   ┌───────────────────────┘
│   │ Reconciliation:
│   │ 1. Receive state for Seq:2
│   │ 2. Compare with predicted state at T2
│   │ 3. Server pos != predicted pos (mismatch!)
│   │ 4. Snap to server state
│   │ 5. Replay inputs Seq:3, Seq:4
│   └──────────────────────────> Corrected
│                                position

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
