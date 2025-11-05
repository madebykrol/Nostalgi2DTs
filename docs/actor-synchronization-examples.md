# Actor Synchronization Protocol - Implementation Examples

This document provides code examples and implementation guidance for the Actor Synchronization Protocol.

## Table of Contents

1. [Server-Side Implementation](#server-side-implementation)
2. [Client-Side Implementation](#client-side-implementation)
3. [Message Serialization](#message-serialization)
4. [Common Patterns](#common-patterns)

## Server-Side Implementation

### 1. Tracking Replicated Actors

```typescript
class Server extends Endpoint<WebSocket, http.IncomingMessage> {
  private replicatedActors: Map<string, Actor> = new Map();
  private actorSequences: Map<string, number> = new Map();
  
  // Track actors that should be replicated
  registerReplicatedActor(actor: Actor, actorId: string): void {
    if (actor.shouldReplicate) {
      this.replicatedActors.set(actorId, actor);
      this.actorSequences.set(actorId, 0);
    }
  }
  
  unregisterReplicatedActor(actorId: string): void {
    this.replicatedActors.delete(actorId);
    this.actorSequences.delete(actorId);
  }
}
```

### 2. Broadcasting Actor Spawn

```typescript
// When spawning an actor that should be replicated
function spawnAndReplicateActor(actor: Actor, actorType: string): void {
  const actorId = generateUniqueId();
  
  // Spawn locally on server
  engine.spawnActor(actor);
  
  // Register for replication
  server.registerReplicatedActor(actor, actorId);
  
  // Prepare spawn message
  const spawnMessage = {
    type: "actor:spawn",
    timestamp: Date.now(),
    actorId: actorId,
    actorType: actorType,
    ownerId: actor.possessedBy?.id ?? null,
    initialState: {
      position: { 
        x: actor.getPosition().x, 
        y: actor.getPosition().y 
      },
      rotation: actor.getRotation(),
      layer: actor.layer,
      shouldReplicate: actor.shouldReplicate,
      name: actor.name,
      properties: extractActorProperties(actor)
    }
  };
  
  // Broadcast to all connected clients
  server.broadcastToAll(spawnMessage);
}

function generateUniqueId(): string {
  return `actor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function extractActorProperties(actor: Actor): Record<string, any> {
  // Extract custom properties based on actor type
  // This should be implemented per actor class
  return {};
}
```

### 3. Periodic State Updates

```typescript
class Server extends Endpoint<WebSocket, http.IncomingMessage> {
  private lastUpdateStates: Map<string, any> = new Map();
  
  // Called every network tick (e.g., 30-60 Hz)
  sendActorUpdates(): void {
    const updates: any[] = [];
    const now = Date.now();
    
    // Collect updates for server-owned actors
    this.replicatedActors.forEach((actor, actorId) => {
      // Skip client-owned actors (they send their own updates)
      if (actor.possessedBy !== null) {
        return;
      }
      
      const currentState = {
        position: actor.getPosition(),
        rotation: actor.getRotation()
      };
      
      const lastState = this.lastUpdateStates.get(actorId);
      
      // Only send if state has changed
      if (this.hasStateChanged(currentState, lastState)) {
        const sequence = this.actorSequences.get(actorId) || 0;
        this.actorSequences.set(actorId, sequence + 1);
        
        updates.push({
          actorId: actorId,
          sequence: sequence + 1,
          position: currentState.position,
          rotation: currentState.rotation
        });
        
        this.lastUpdateStates.set(actorId, currentState);
      }
    });
    
    // Send batched updates if any
    if (updates.length > 0) {
      const updateMessage = {
        type: "actor:update",
        timestamp: now,
        updates: updates
      };
      
      this.broadcastToAll(updateMessage);
    }
  }
  
  private hasStateChanged(current: any, last: any): boolean {
    if (!last) return true;
    
    const EPSILON = 0.001;
    return (
      Math.abs(current.position.x - last.position.x) > EPSILON ||
      Math.abs(current.position.y - last.position.y) > EPSILON ||
      Math.abs(current.rotation - last.rotation) > EPSILON
    );
  }
  
  private broadcastToAll(message: any): void {
    const messageStr = JSON.stringify(message);
    this.sessions.forEach((session) => {
      if (session.socket.readyState === WebSocket.OPEN) {
        session.socket.send(messageStr);
      }
    });
  }
}
```

### 4. Handling Client Updates

```typescript
class Server extends Endpoint<WebSocket, http.IncomingMessage> {
  handleClientActorUpdate(
    session: UserSession, 
    message: any
  ): void {
    const { actorId, ownerId, state, sequence } = message;
    
    // Validate ownership
    if (!this.validateOwnership(session, actorId, ownerId)) {
      this.sendError(session, "INVALID_OWNERSHIP", 
        `Client does not own actor ${actorId}`);
      return;
    }
    
    const actor = this.replicatedActors.get(actorId);
    if (!actor) {
      this.sendError(session, "UNKNOWN_ACTOR", 
        `Actor ${actorId} not found`);
      return;
    }
    
    // Validate and apply update
    if (this.validateState(state)) {
      actor.setPosition(new Vector2(state.position.x, state.position.y));
      actor.setRotation(state.rotation);
      
      // Broadcast to OTHER clients
      this.broadcastToOthers(session, {
        type: "actor:update",
        timestamp: Date.now(),
        updates: [{
          actorId: actorId,
          sequence: sequence,
          position: state.position,
          rotation: state.rotation
        }]
      });
      
      // Send acknowledgment to sender
      this.sendAck(session, sequence);
    }
  }
  
  private validateOwnership(
    session: UserSession, 
    actorId: string, 
    ownerId: string
  ): boolean {
    const actor = this.replicatedActors.get(actorId);
    if (!actor) return false;
    
    // Check if actor is possessed by this client's controller
    return (
      actor.possessedBy !== null &&
      actor.possessedBy.id === session.id &&
      ownerId === session.id
    );
  }
  
  private validateState(state: any): boolean {
    // Validate position is within world bounds
    const MAX_COORDINATE = 10000;
    if (
      Math.abs(state.position.x) > MAX_COORDINATE ||
      Math.abs(state.position.y) > MAX_COORDINATE
    ) {
      return false;
    }
    
    // Validate rotation is within valid range
    if (state.rotation < 0 || state.rotation > Math.PI * 2) {
      return false;
    }
    
    return true;
  }
  
  private sendError(
    session: UserSession, 
    code: string, 
    message: string
  ): void {
    const errorMsg = {
      type: "error",
      code: code,
      message: message
    };
    session.socket.send(JSON.stringify(errorMsg));
  }
  
  private sendAck(session: UserSession, sequence: number): void {
    const ackMsg = {
      type: "ack",
      sequence: sequence,
      serverTimestamp: Date.now()
    };
    session.socket.send(JSON.stringify(ackMsg));
  }
  
  private broadcastToOthers(
    sender: UserSession, 
    message: any
  ): void {
    const messageStr = JSON.stringify(message);
    this.sessions.forEach((session) => {
      if (
        session.id !== sender.id &&
        session.socket.readyState === WebSocket.OPEN
      ) {
        session.socket.send(messageStr);
      }
    });
  }
}
```

### 5. Sending World Snapshot on Connect

```typescript
class Server extends Endpoint<WebSocket, http.IncomingMessage> {
  sendWorldSnapshot(session: UserSession): void {
    const actors: any[] = [];
    
    this.replicatedActors.forEach((actor, actorId) => {
      actors.push({
        actorId: actorId,
        actorType: actor.constructor.name,
        ownerId: actor.possessedBy?.id ?? null,
        state: {
          position: {
            x: actor.getPosition().x,
            y: actor.getPosition().y
          },
          rotation: actor.getRotation(),
          layer: actor.layer,
          name: actor.name,
          properties: extractActorProperties(actor)
        }
      });
    });
    
    const snapshot = {
      type: "world:snapshot",
      timestamp: Date.now(),
      actors: actors
    };
    
    session.socket.send(JSON.stringify(snapshot));
  }
}
```

## Client-Side Implementation

### 1. Receiving and Spawning Actors

```typescript
class Client {
  private remoteActors: Map<string, Actor> = new Map();
  private actorFactory: Map<string, () => Actor> = new Map();
  
  handleActorSpawn(message: any): void {
    const { actorId, actorType, ownerId, initialState } = message;
    
    // Check if we already have this actor
    if (this.remoteActors.has(actorId)) {
      console.warn(`Actor ${actorId} already exists`);
      return;
    }
    
    // Create actor instance
    const actorCtor = this.actorFactory.get(actorType);
    if (!actorCtor) {
      console.error(`Unknown actor type: ${actorType}`);
      return;
    }
    
    const actor = actorCtor();
    actor.name = initialState.name;
    actor.layer = initialState.layer;
    actor.shouldReplicate = initialState.shouldReplicate;
    
    // Apply initial state
    actor.setPosition(new Vector2(
      initialState.position.x,
      initialState.position.y
    ));
    actor.setRotation(initialState.rotation);
    
    // Apply custom properties
    this.applyActorProperties(actor, initialState.properties);
    
    // Spawn in world
    engine.spawnActor(actor, initialState.position);
    
    // Track remote actor
    this.remoteActors.set(actorId, actor);
  }
  
  registerActorType(typeName: string, factory: () => Actor): void {
    this.actorFactory.set(typeName, factory);
  }
  
  private applyActorProperties(
    actor: Actor, 
    properties: Record<string, any>
  ): void {
    // Apply custom properties based on actor type
    // This should be implemented per actor class
  }
}
```

### 2. Applying Remote Updates

```typescript
class Client {
  private actorInterpolation: Map<string, {
    from: any,
    to: any,
    startTime: number,
    duration: number
  }> = new Map();
  
  handleActorUpdate(message: any): void {
    const { timestamp, updates } = message;
    
    updates.forEach((update: any) => {
      const actor = this.remoteActors.get(update.actorId);
      if (!actor) {
        console.warn(`Unknown actor: ${update.actorId}`);
        return;
      }
      
      // Don't apply updates to our owned actors
      // (they're already updated locally)
      if (this.isOwnedByLocalPlayer(actor)) {
        return;
      }
      
      // Setup interpolation for smooth movement
      const currentPos = actor.getPosition();
      const currentRot = actor.getRotation();
      
      this.actorInterpolation.set(update.actorId, {
        from: {
          position: { x: currentPos.x, y: currentPos.y },
          rotation: currentRot
        },
        to: {
          position: update.position,
          rotation: update.rotation
        },
        startTime: performance.now(),
        duration: 100 // 100ms interpolation
      });
    });
  }
  
  // Called every frame to interpolate actor positions
  updateInterpolations(): void {
    const now = performance.now();
    
    this.actorInterpolation.forEach((interp, actorId) => {
      const actor = this.remoteActors.get(actorId);
      if (!actor) return;
      
      const elapsed = now - interp.startTime;
      const t = Math.min(elapsed / interp.duration, 1.0);
      
      // Linear interpolation
      const newPos = {
        x: lerp(interp.from.position.x, interp.to.position.x, t),
        y: lerp(interp.from.position.y, interp.to.position.y, t)
      };
      const newRot = lerp(interp.from.rotation, interp.to.rotation, t);
      
      actor.setPosition(new Vector2(newPos.x, newPos.y));
      actor.setRotation(newRot);
      
      // Remove interpolation when complete
      if (t >= 1.0) {
        this.actorInterpolation.delete(actorId);
      }
    });
  }
  
  private isOwnedByLocalPlayer(actor: Actor): boolean {
    const localPlayer = engine.getLocalPlayerState();
    return (
      actor.possessedBy !== null &&
      localPlayer !== undefined &&
      actor.possessedBy.id === localPlayer.playerId
    );
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
```

### 3. Sending Owned Actor Updates

```typescript
class Client {
  private ownedActor: Actor | null = null;
  private clientSequence: number = 0;
  private updateThrottle: number = 1000 / 60; // 60 Hz
  private lastUpdateTime: number = 0;
  
  setOwnedActor(actor: Actor): void {
    this.ownedActor = actor;
  }
  
  sendOwnedActorUpdate(actorId: string): void {
    if (!this.ownedActor) return;
    
    const now = performance.now();
    if (now - this.lastUpdateTime < this.updateThrottle) {
      return; // Throttle updates
    }
    
    this.lastUpdateTime = now;
    this.clientSequence++;
    
    const updateMessage = {
      type: "client:actor:update",
      clientTimestamp: Date.now(),
      sequence: this.clientSequence,
      actorId: actorId,
      ownerId: this.getLocalPlayerId(),
      state: {
        position: {
          x: this.ownedActor.getPosition().x,
          y: this.ownedActor.getPosition().y
        },
        rotation: this.ownedActor.getRotation()
      }
    };
    
    this.socket.send(JSON.stringify(updateMessage));
  }
  
  private getLocalPlayerId(): string {
    const localPlayer = engine.getLocalPlayerState();
    return localPlayer?.playerId ?? "";
  }
}
```

### 4. Handling World Snapshot

```typescript
class Client {
  handleWorldSnapshot(message: any): void {
    const { actors } = message;
    
    // Clear existing remote actors
    this.remoteActors.forEach((actor) => {
      engine.despawnActor(actor);
    });
    this.remoteActors.clear();
    
    // Spawn all actors from snapshot
    actors.forEach((actorData: any) => {
      this.handleActorSpawn({
        ...actorData,
        type: "actor:spawn",
        timestamp: message.timestamp,
        initialState: actorData.state
      });
    });
    
    console.log(`Loaded ${actors.length} actors from snapshot`);
  }
}
```

### 5. Message Router

```typescript
class Client {
  private socket: WebSocket;
  
  connect(url: string): void {
    this.socket = new WebSocket(url);
    
    this.socket.onopen = () => {
      console.log("Connected to server");
      this.sendReady();
    };
    
    this.socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };
    
    this.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    
    this.socket.onclose = () => {
      console.log("Disconnected from server");
    };
  }
  
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case "world:snapshot":
          this.handleWorldSnapshot(message);
          break;
        case "actor:spawn":
          this.handleActorSpawn(message);
          break;
        case "actor:update":
          this.handleActorUpdate(message);
          break;
        case "actor:despawn":
          this.handleActorDespawn(message);
          break;
        case "ack":
          this.handleAck(message);
          break;
        case "error":
          this.handleError(message);
          break;
        default:
          console.warn("Unknown message type:", message.type);
      }
    } catch (error) {
      console.error("Failed to parse message:", error);
    }
  }
  
  private sendReady(): void {
    const readyMessage = {
      type: "client:ready",
      clientId: this.getLocalPlayerId(),
      clientVersion: "1.0.0"
    };
    this.socket.send(JSON.stringify(readyMessage));
  }
  
  private handleActorDespawn(message: any): void {
    const { actorId } = message;
    const actor = this.remoteActors.get(actorId);
    
    if (actor) {
      engine.despawnActor(actor);
      this.remoteActors.delete(actorId);
    }
  }
  
  private handleAck(message: any): void {
    // Handle acknowledgment for sent updates
    // Can be used for client-side prediction reconciliation
    console.log(`Update ${message.sequence} acknowledged`);
  }
  
  private handleError(message: any): void {
    console.error(`Server error [${message.code}]: ${message.message}`);
  }
}
```

## Message Serialization

### JSON Serialization (Current)

```typescript
// Sending
const message = {
  type: "actor:update",
  timestamp: Date.now(),
  updates: [...]
};
socket.send(JSON.stringify(message));

// Receiving
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // Process message
};
```

### Future: Binary Serialization

For better performance, consider binary serialization:

```typescript
// Example using DataView
function serializeActorUpdate(update: any): ArrayBuffer {
  const buffer = new ArrayBuffer(32);
  const view = new DataView(buffer);
  
  // Message type (1 byte)
  view.setUint8(0, 1); // 1 = actor:update
  
  // Timestamp (8 bytes)
  view.setFloat64(1, update.timestamp);
  
  // Position X (4 bytes)
  view.setFloat32(9, update.position.x);
  
  // Position Y (4 bytes)
  view.setFloat32(13, update.position.y);
  
  // Rotation (4 bytes)
  view.setFloat32(17, update.rotation);
  
  return buffer;
}
```

## Common Patterns

### Rate Limiting Client Updates

```typescript
class RateLimiter {
  private lastUpdateTime: number = 0;
  private updateInterval: number;
  
  constructor(updatesPerSecond: number) {
    this.updateInterval = 1000 / updatesPerSecond;
  }
  
  shouldUpdate(): boolean {
    const now = performance.now();
    if (now - this.lastUpdateTime >= this.updateInterval) {
      this.lastUpdateTime = now;
      return true;
    }
    return false;
  }
}

// Usage
const rateLimiter = new RateLimiter(60); // 60 updates per second

function gameLoop() {
  if (rateLimiter.shouldUpdate()) {
    client.sendOwnedActorUpdate(actorId);
  }
}
```

### Priority-Based Update System

```typescript
class PriorityUpdateManager {
  private actors: Map<string, {
    actor: Actor,
    priority: number,
    lastUpdate: number
  }> = new Map();
  
  addActor(actorId: string, actor: Actor, priority: number): void {
    this.actors.set(actorId, {
      actor: actor,
      priority: priority,
      lastUpdate: 0
    });
  }
  
  getActorsToUpdate(maxUpdates: number): string[] {
    const now = performance.now();
    const candidates: Array<{
      id: string,
      score: number
    }> = [];
    
    this.actors.forEach((data, id) => {
      // Calculate update score based on priority and time since last update
      const timeSinceUpdate = now - data.lastUpdate;
      const score = data.priority * timeSinceUpdate;
      candidates.push({ id, score });
    });
    
    // Sort by score and take top N
    candidates.sort((a, b) => b.score - a.score);
    const toUpdate = candidates.slice(0, maxUpdates).map(c => c.id);
    
    // Update last update time
    toUpdate.forEach(id => {
      const data = this.actors.get(id);
      if (data) {
        data.lastUpdate = now;
      }
    });
    
    return toUpdate;
  }
}
```

### Connection State Management

```typescript
enum ConnectionState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  READY
}

class NetworkManager {
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  
  connect(url: string): void {
    if (this.state !== ConnectionState.DISCONNECTED) {
      return;
    }
    
    this.state = ConnectionState.CONNECTING;
    this.socket = new WebSocket(url);
    
    this.socket.onopen = () => {
      this.state = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      this.sendReady();
    };
    
    this.socket.onclose = () => {
      this.state = ConnectionState.DISCONNECTED;
      this.attemptReconnect(url);
    };
  }
  
  private attemptReconnect(url: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnect attempts reached");
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect(url);
    }, delay);
  }
  
  private sendReady(): void {
    // Wait for snapshot before marking as ready
    this.socket.send(JSON.stringify({ type: "client:ready" }));
  }
  
  onWorldSnapshot(): void {
    this.state = ConnectionState.READY;
  }
}
```

## Testing

### Unit Test Example

```typescript
describe("Actor Synchronization", () => {
  it("should validate actor ownership", () => {
    const server = new Server("localhost", 3001);
    const actor = new DemoActor("test");
    const controller = new Controller();
    controller.id = "player1";
    actor.possessedBy = controller;
    
    const session = {
      id: "player1",
      socket: mockSocket
    };
    
    const isValid = server.validateOwnership(
      session,
      "actor1",
      "player1"
    );
    
    expect(isValid).toBe(true);
  });
  
  it("should reject updates for non-owned actors", () => {
    // Similar test for rejection case
  });
});
```

## Performance Considerations

1. **Batch Updates**: Send multiple actor updates in a single message
2. **Delta Compression**: Only send changed properties
3. **Spatial Culling**: Don't send updates for actors outside view
4. **Update Frequency**: Adjust based on distance/importance
5. **Binary Protocol**: Consider for production (reduced bandwidth)

## Security Considerations

1. **Validate All Input**: Never trust client data
2. **Rate Limiting**: Prevent update flooding
3. **Ownership Verification**: Always check on server
4. **Bounds Checking**: Validate positions/values are reasonable
5. **Anti-Cheat**: Log suspicious behavior
