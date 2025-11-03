"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var http_1 = require("http");
var ws_1 = require("ws");
var PORT = Number((_a = process.env.PORT) !== null && _a !== void 0 ? _a : 3001);
// Skapa en HTTP-server (bra för hälsa/prober + proxy-terminering)
var server = http_1.default.createServer(function (_req, res) {
    if (_req.url === "/health") {
        res.writeHead(200).end("ok");
        return;
    }
    res.writeHead(404).end("not found");
});
// WS-server ovanpå HTTP-servern
var wss = new ws_1.WebSocketServer({ server: server });
// Håll koll på aktiva klienter och hjärtslag
function heartbeat() {
    this.isAlive = true;
}
wss.on("connection", function (ws, req) {
    ws.isAlive = true;
    ws.on("pong", heartbeat);
    // Exempel: välkomstmeddelande
    ws.send(JSON.stringify({ type: "welcome", ip: req.socket.remoteAddress }));
    ws.on("message", function (data) {
        // Enkel echo + broadcast
        var msg = data.toString();
        try {
            msg = JSON.parse(String(data));
        }
        catch ( /* låt vara text */_a) { /* låt vara text */ }
        // Broadcast till alla (utom avsändaren)
        wss.clients.forEach(function (client) {
            if (client !== ws && client.readyState === ws_1.WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "broadcast", payload: msg }));
            }
        });
    });
    ws.on("close", function () {
        // städa om du behöver
    });
});
// Ping-loop för att stänga döda connections
var interval = setInterval(function () {
    wss.clients.forEach(function (ws) {
        var alive = ws.isAlive;
        if (!alive)
            return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
// Graceful shutdown
function shutdown() {
    clearInterval(interval);
    wss.close(function () {
        server.close(function () {
            process.exit(0);
        });
    });
    // stäng aktiva sockets lite mjukt
    wss.clients.forEach(function (ws) { return ws.close(1001, "server shutting down"); });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.listen(PORT, function () {
    console.log("[ws-server] listening on http://localhost:".concat(PORT, " (ws path /)"));
});
