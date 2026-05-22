import http from "http";
import { WebSocketServer, WebSocket } from "ws";

import { Actor, Container, DefaultResourceManager, Engine, EngineBuilder, inject, TimerManager, World } from "@nostalgi2d/engine";
import { PlanckWorld } from "@nostalgi2d/planckphysics";
import { Endpoint, ClientInputMessage, ClientSetUsernameMessage, ClientPostScoreMessage } from "../../packages/engine/network";
import { DemoActor, ExampleTopDownRPGGameMode, GameTileMapActor} from "@nostalgi2d-projects/grasslands-demo";
import { Parser } from "../../packages/tiler/parser";

import { DOMParser } from "@xmldom/xmldom";

const PORT = Number(process.env.PORT ?? 3001);

class UserSession {
  public id: string;
  public socket: WebSocket;
  public lastSeen: number;
  public playerActor: Actor | null = null;
  
  constructor(id: string, socket: WebSocket) {
    this.id = id;
    this.socket = socket;
    this.lastSeen = Date.now();
  }
}

class Server extends Endpoint{
  private wss: WebSocketServer | undefined;
  private webServer: http.Server | undefined;
  private sessions: Map<string, UserSession> = new Map();
  private messageHandlers: Map<string, (sessionId: string, data: any) => void> = new Map();

  constructor(address: string, port: number) {
    super(address, port);
  }

  getSessions(): Map<string, UserSession> {
    return this.sessions;
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

  broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    this.sessions.forEach((session) => {
      if (session.socket.readyState === WebSocket.OPEN) {
        session.socket.send(messageStr);
      }
    });
  }

  // Register a handler for a specific message type
  onMessage<T>(messageType: string, callback: (sessionId: string, data: T) => void): void {
    this.messageHandlers.set(messageType, callback as any);
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
   
    this.wss.on("connection", (socket, req) => {
      this.handleConnection(socket, req);
      callback(socket, req);
    });
  }

  private handleConnection(socket: WebSocket, req: http.IncomingMessage): void {
    const params = new URL(req.url ?? "", "http://example.com/");
    const userId = params.searchParams.get("userId") ?? "anonymous";

    // Register session
    const sess: UserSession = { id: userId, socket, lastSeen: Date.now(), playerActor: null };
    this.sessions.set(sess.id, sess);
    
    console.log(`Client connected: ${sess.id}`);

    socket.on("message", (data) => {
      try {
        console.log(data.toString());
        const message = JSON.parse(data.toString());
        const messageType = message.type;
        
        // Route to registered handler
        const handler = this.messageHandlers.get(messageType);
        if (handler) {
          handler(sess.id, message);
        } else {
          console.log(`No handler for message type: ${messageType}`);
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
      this.onDisconnection();
    });

    socket.on("error", (err) => {
      console.error(`Error on connection ${sess.id}:`, err);
    });
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
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

class ServerEngine extends Engine {
  private networkTickInterval: NodeJS.Timeout | null = null;
  private networkTickRate = 60; // 60 Hz

  constructor(@inject(World)world: World, @inject(Endpoint) endpoint: Endpoint | undefined, @inject(Container)container: Container, @inject(TimerManager) timerManager: TimerManager) {
    super(world, endpoint, "server", container, timerManager);
    
    this.setupNetworkHandlers();
  }

  private setupNetworkHandlers(): void {
    const endpoint = this.netEndpoint;
    if (!endpoint || !(endpoint instanceof Server)) {
      return;
    }

    // Register message handlers using the Endpoint pattern
    endpoint.onMessage<ClientSetUsernameMessage>("username:set", (sessionId, message) => {
      console.log(`Client ${sessionId} set username to ${message.username}`);
    });

    endpoint.onMessage<ClientPostScoreMessage>("client:score", (sessionId, message) => {
      console.log(`Client ${sessionId} posted score ${message.score}`);
    });

    endpoint.onMessage<any>("client:ready", (sessionId, _message) => {
      console.log(`Client ${sessionId} is ready`);
      // TODO: Send world snapshot
    });
  }

 

  run(): void {
    super.run();
    
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
  }

}

var builder = new EngineBuilder<WebSocket, http.IncomingMessage>();
builder
  .withWorldInstance(new PlanckWorld(undefined, builder.container))
  .withEndpointInstance(server)
  .withActor(DemoActor)
  .withServiceInstance(DOMParser, new DOMParser())
  .withGameMode(ExampleTopDownRPGGameMode)
  .withResourceManager(DefaultResourceManager)
  .withService(Parser)
  .withActor(GameTileMapActor)
  .withDebugLogging()
  .asServer("ServerEngine");

const engine = builder.build(ServerEngine);

engine.run();

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