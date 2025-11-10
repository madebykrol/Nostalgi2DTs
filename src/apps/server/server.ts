import http from "http";
import { WebSocketServer, WebSocket } from "ws";

import { Actor, Container, Engine, EngineBuilder, inject, Level, Url, Vector2, World } from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import { Endpoint, ServerReplicationManager, ClientInputMessage, ClientToServerMessage, ActorUpdateMessage } from "../../packages/engine/network";
import { DemoActor } from "@repo/example";

const stringify = (obj: any): string => {
  var seen: any[] = [];

  return JSON.stringify(obj, function(key, val) {
    if (val != null && typeof val == "object") {
          if (seen.indexOf(val) >= 0) {
              return;
          }
          seen.push(val);
    }
    return val;
});
}

const PORT = Number(process.env.PORT ?? 3001);

class UserSession {
  public id: string;
  public socket: WebSocket;
  public lastSeen: number;
  public playerActor: Actor | null = null;
  // Lägg till mer session-relaterad data här
  constructor(id: string, socket: WebSocket) {
    this.id = id;
    this.socket = socket;
    this.lastSeen = Date.now();
  }
}

class Server extends Endpoint<WebSocket, http.IncomingMessage>{

  private wss: WebSocketServer | undefined;
  private webServer: http.Server | undefined;
  private sessions: Map<string, UserSession> = new Map();
  private replicationManager: ServerReplicationManager = new ServerReplicationManager();

  protected physicsTickRate: number = 30; // ticks per second
  protected snapshotRate: number = 30; // snapshots per second

  constructor(adress: string, port: number) {
    super(adress, port);
  }

  getReplicationManager(): ServerReplicationManager {
    return this.replicationManager;
  }

  send(command: string, data: any): void {
    // Broadcast to all connected sessions
    const message = JSON.stringify({ command, data });
    this.sessions.forEach((session) => {
      if (session.socket.readyState === WebSocket.OPEN) {
        session.socket.send(message);
      }
    });
  }

  sendToSession(sessionId: string, message: any): void {
    const session = this.sessions.get(sessionId);
    if (session && session.socket.readyState === WebSocket.OPEN) {
      session.socket.send(JSON.stringify(message));
    }
  }

  broadcastActorUpdates(updates: ActorUpdateMessage): void {
    const message = JSON.stringify(updates);
    this.sessions.forEach((session) => {
      if (session.socket.readyState === WebSocket.OPEN) {
        session.socket.send(message);
      }
    });
  }

  cleanup(): void {
    if (this.wss) {
      this.wss.close();
    }
    if (this.webServer) {
      this.webServer.close();
    }
  }


  async connect(callback: (socket: WebSocket, req: http.IncomingMessage) => void): Promise<void> {
    this.webServer = http.createServer((_req, res) => {
        if (_req.url === "/health") {
          res.writeHead(200).end("ok");
          return;
        }
        res.writeHead(404).end("not found");
    });

    this.webServer.listen(this.port, () => {
      console.log(`[ws-server] listening on ${this.address}:${this.port})`);
    });

    this.wss = new WebSocketServer({ server: this.webServer });

    console.log("WebSocket server starting...");
   
    this.wss.on("connection", callback);
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  onConnection(socket: WebSocket, req: http.IncomingMessage): void {
    const params = new URL(req.url ?? "", "http://example.com/");
    console.log(params);
    const userId = params.searchParams.get("userId") ?? "anonymous";

    // Register session
    const sess: UserSession = { id: userId, socket, lastSeen: Date.now(), playerActor: null };
    this.sessions.set(sess.id, sess);
    
    console.log(`Client connected: ${sess.id}`);

    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientToServerMessage;
        console.log(`Message from ${sess.id}:`, message.type);
        
        if (message.type === "client:input") {
          // Handle input-based replication
          const result = this.replicationManager.processClientInput(message as ClientInputMessage);
          
          if (!result.success) {
            // Send error to client
            this.sendToSession(sess.id, {
              type: "error",
              code: result.error,
              message: `Failed to process input: ${result.error}`
            });
          }
        } else if (message.type === "client:ready") {
          console.log(`Client ${sess.id} is ready`);
          // TODO: Send world snapshot to client
        }
      } catch (error) {
        console.error(`Error parsing message from ${sess.id}:`, error);
      }
    });

    socket.on("pong", () => {
      sess.lastSeen = Date.now();
    });

    socket.on("close", () => {
      this.sessions.delete(sess.id);
      console.log(`Connection closed: ${sess.id}`);
      // TODO: Despawn player actor
    });

    socket.on("error", (err) => {
      console.error(`Error on connection ${sess.id}:`, err);
    });
  }

  snapshotTick() {
    // Broadcast actor updates for server-owned actors
    const updates = this.replicationManager.getServerOwnedActorUpdates();
    if (updates.updates.length > 0) {
      this.broadcastActorUpdates(updates);
    }
  }

}

// // Håll koll på aktiva klienter och hjärtslag
// function heartbeat(this: WebSocket) {
//   (this as any).isAlive = true;
// }


// wss.on("connection", (ws, req) => {
//   (ws as any).isAlive = true;
//   ws.on("pong", heartbeat);
//   // Exempel: välkomstmeddelande
//   ws.send(JSON.stringify({ type: "welcome", ip: req.socket.remoteAddress }));

//   ws.on("message", (data) => {
//     // Enkel echo + broadcast
//     let msg: unknown = data.toString();
//     try { msg = JSON.parse(String(data)); } catch { /* låt vara text */ }

//     console.log("Meddelande från klient:", msg);
//     // Broadcast till alla (utom avsändaren)
//     wss.clients.forEach((client) => {
//       if (client !== ws && client.readyState === WebSocket.OPEN) {
//         client.send(JSON.stringify({ type: "broadcast", payload: msg }));
//       }
//     });
//   });

//   ws.on("close", () => {
//     // städa om du behöver
//   });
// });

// const tickRate = 30;

// var serverFrame = 0;
// var snapshot = 0;

// const serverLoop = async () => {  
//   while (true) {

//     engine.tick();

//     serverFrame++;

//     await new Promise((resolve) => setTimeout(resolve, 10)); // 2s delay
//   }
// };

// const snapshotInterval = setInterval(() => {
//   snapshot++;
//   wss.clients.forEach(client => {
//       if (client.readyState === client.OPEN) {
//         client.send(`snapshot:#${snapshot}:${client.url}`);
//       }
//     });
// }, Math.round((1000 / tickRate))); // Skicka snapshot var 10:e tick

// const calculatePlayerSnapshot = () => {

// }

// serverLoop(); // Start message loop

// // Ping-loop för att stänga döda connections
// const interval = setInterval(() => {
//   wss.clients.forEach((ws) => {
//     const alive = (ws as any).isAlive;
//     if (!alive) return ws.terminate();
//     (ws as any).isAlive = false;
//     ws.ping();
//   });
// }, 30_000);

// // Graceful shutdown
// function shutdown() {
//   clearInterval(interval);
//   wss.close(() => {
//     server.close(() => {
//       process.exit(0);
//     });
//   });
//   // stäng aktiva sockets lite mjukt
//   wss.clients.forEach((ws) => ws.close(1001, "server shutting down"));
// }
// process.on("SIGINT", shutdown);
// process.on("SIGTERM", shutdown);

// server.listen(PORT, () => {
//   console.log(`[ws-server] listening on http://localhost:${PORT} (ws path /)`);
// });



const server = new Server("localhost", PORT);

class ServerEngine extends Engine<WebSocket, http.IncomingMessage> {
  private replicationManager: ServerReplicationManager;
  private networkTickInterval: NodeJS.Timeout | null = null;
  private networkTickRate = 60; // 60 Hz

  constructor(@inject(World)world: World, @inject(Endpoint<WebSocket, http.IncomingMessage>) endpoint: Endpoint<WebSocket, http.IncomingMessage> | undefined, @inject(Container)container: Container) {
    super(world, endpoint, "server", container);
    
    // Get replication manager from server
    if (endpoint && endpoint instanceof Server) {
      this.replicationManager = endpoint.getReplicationManager();
    } else {
      this.replicationManager = new ServerReplicationManager();
    }
  }

  startup(): void {
    super.startup();
    
    // Start network tick for broadcasting updates
    this.networkTickInterval = setInterval(() => {
      this.networkTick();
    }, 1000 / this.networkTickRate);
  }

  shutdown(): void {
    super.shutdown();
    if (this.networkTickInterval) {
      clearInterval(this.networkTickInterval);
    }
  }

  private networkTick(): void {
    // Broadcast all actor updates
    const updates = this.replicationManager.getActorUpdates();
    if (updates.updates.length > 0 && this.netEndpoint instanceof Server) {
      this.netEndpoint.broadcastActorUpdates(updates);
    }
  }

  // Override spawnActor to register actors for replication
  async spawnActor(actor: Actor, parent?: Actor, position?: Vector2): Promise<void> {
    await super.spawnActor(actor, parent, position);
    
    // Register for replication if needed
    if (actor.shouldReplicate) {
      const actorId = `actor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.replicationManager.registerActor(actor, actorId);
    }
  }
}

var builder = new EngineBuilder<WebSocket, http.IncomingMessage>();
builder
  .withWorldInstance(new PlanckWorld())
  .withEndpointInstance(server)
  .withActor(DemoActor)
  .withDebugLogging()
  .asServer("ServerEngine");

const engine = builder.build(ServerEngine);

engine.startup();
const level = new Level();
const demoActor = new DemoActor();

demoActor.addChild(new DemoActor());
demoActor.addChild(new DemoActor());

const demo2Actor = new DemoActor();
demo2Actor.tickGroup = "post-physics";

level.addActor(demoActor);
level.addActor(demo2Actor);

engine.loadLevelObject(level);

let isRunning = true;

setInterval(() => {
  if(isRunning) {
    engine.tick();
  }
}, 1000 / 120); // 120 Hz main tick


const shutdown = () => {
  isRunning = false;
  server.cleanup();
  engine.shutdown();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);