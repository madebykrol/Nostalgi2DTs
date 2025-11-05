var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a;
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { Engine, Level, Vector2 } from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import { Endpoint } from "../../packages/engine/network/endpoint";
import { DemoActor } from "@repo/example";
var stringify = function (obj) {
    var seen = [];
    return JSON.stringify(obj, function (key, val) {
        if (val != null && typeof val == "object") {
            if (seen.indexOf(val) >= 0) {
                return;
            }
            seen.push(val);
        }
        return val;
    });
};
var PORT = Number((_a = process.env.PORT) !== null && _a !== void 0 ? _a : 3001);
var UserSession = /** @class */ (function () {
    // Lägg till mer session-relaterad data här
    function UserSession(id, socket) {
        this.playerActor = null;
        this.id = id;
        this.socket = socket;
        this.lastSeen = Date.now();
    }
    return UserSession;
}());
var Server = /** @class */ (function (_super) {
    __extends(Server, _super);
    function Server(adress, port) {
        var _this = _super.call(this, adress, port) || this;
        _this.sessions = new Map();
        _this.physicsTickRate = 30; // ticks per second
        _this.snapshotRate = 30; // snapshots per second
        return _this;
    }
    Server.prototype.send = function (command, data) {
        throw new Error("Method not implemented.");
    };
    Server.prototype.cleanup = function () {
        throw new Error("Method not implemented.");
    };
    Server.prototype.connect = function (callback) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                this.webServer = http.createServer(function (_req, res) {
                    if (_req.url === "/health") {
                        res.writeHead(200).end("ok");
                        return;
                    }
                    res.writeHead(404).end("not found");
                });
                this.webServer.listen(this.port, function () {
                    console.log("[ws-server] listening on ".concat(_this.address, ":").concat(_this.port, ")"));
                });
                this.wss = new WebSocketServer({ server: this.webServer });
                console.log("WebSocket server starting...");
                this.wss.on("connection", callback);
                return [2 /*return*/];
            });
        });
    };
    Server.prototype.disconnect = function () {
        throw new Error("Method not implemented.");
    };
    Server.prototype.snapshotTick = function () {
        // console.log("Snapshot tick at", new Date().toISOString());
        this.sessions.forEach(function (sess) {
            if (sess.socket.readyState === WebSocket.OPEN) {
                sess.socket.send("snapshot:".concat(stringify(sess.lastSeen)));
            }
        });
    };
    Server.prototype.onConnection = function (socket, req) {
        var _this = this;
        var _a, _b;
        var params = new URL((_a = req.url) !== null && _a !== void 0 ? _a : "", "http://example.com/");
        console.log(params);
        var userId = (_b = params.searchParams.get("userId")) !== null && _b !== void 0 ? _b : "anonymous";
        // Registrera state
        var sess = { id: userId, socket: socket, lastSeen: Date.now(), playerActor: null };
        this.sessions.set(sess.id, sess);
        socket.on("message", function (data) {
            console.log("Meddelande fr\u00E5n ".concat(sess.id, ":"), data.toString());
            // Echo tillbaka
            if (socket.readyState === WebSocket.OPEN) {
                socket.send("echo:".concat(data.toString()));
            }
        });
        socket.on("pong", function () {
            sess.lastSeen = Date.now();
            console.log("Pong fr\u00E5n ".concat(sess.id));
        });
        socket.on("close", function () {
            _this.sessions.delete(sess.id);
            console.log("Anslutning st\u00E4ngd: ".concat(sess.id));
            // Städa upp speldata om nödvändigt
        });
        socket.on("error", function (err) {
            console.error("Fel p\u00E5 anslutning ".concat(sess.id, ":"), err);
        });
    };
    return Server;
}(Endpoint));
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
var server = new Server("localhost", PORT);
var engine = new Engine(new PlanckWorld({ gravity: new Vector2(0, -10), allowSleep: true }), server, "server");
engine.startup();
var level = new Level();
var demoActor = new DemoActor("DemoActor");
demoActor.addChild(new DemoActor("ChildActor1"));
demoActor.addChild(new DemoActor("ChildActor2"));
var demo2Actor = new DemoActor("DemoActor2");
demo2Actor.tickGroup = "post-physics";
level.addActor(demoActor);
level.addActor(demo2Actor);
engine.loadLevelObject(level);
var isRunning = true;
setInterval(function () {
    if (isRunning) {
        engine.tick();
    }
}, 1000 / 120); // 120 Hz main tick
var shutdown = function () {
    isRunning = false;
    server.cleanup();
    engine.shutdown();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
