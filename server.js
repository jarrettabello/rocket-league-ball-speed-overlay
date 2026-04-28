const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");

const host = "127.0.0.1";
const appPort = Number(process.env.PORT || 5173);
const rocketLeaguePort = Number(process.env.RL_STATS_PORT || 49123);
const root = __dirname;
const clients = new Set();

let rlSocket = null;
let rlBuffer = "";
let reconnectTimer = null;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendFile(response, requestPath) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(root, safePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  });
}

function createWebSocketAccept(key) {
  return crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}

function frameWebSocketMessage(payload) {
  const body = Buffer.from(payload);
  const length = body.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), body]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, body]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, body]);
}

function broadcast(message) {
  const frame = frameWebSocketMessage(JSON.stringify(message));

  for (const client of clients) {
    if (!client.destroyed) {
      client.write(frame);
    }
  }
}

function normalizeMessage(message) {
  if (typeof message.Data === "string") {
    try {
      return { ...message, Data: JSON.parse(message.Data) };
    } catch {
      return message;
    }
  }

  return message;
}

function consumeRocketLeagueBuffer() {
  for (;;) {
    const start = rlBuffer.indexOf("{");

    if (start === -1) {
      rlBuffer = "";
      return;
    }

    if (start > 0) {
      rlBuffer = rlBuffer.slice(start);
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let index = 0; index < rlBuffer.length; index += 1) {
      const char = rlBuffer[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }

    if (end === -1) {
      return;
    }

    const chunk = rlBuffer.slice(0, end);
    rlBuffer = rlBuffer.slice(end);

    try {
      broadcast(normalizeMessage(JSON.parse(chunk)));
    } catch {
      // Keep the bridge resilient if Rocket League emits a partial or malformed packet.
    }
  }
}

function scheduleRocketLeagueReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRocketLeague();
  }, 1200);
}

function connectRocketLeague() {
  if (rlSocket && !rlSocket.destroyed) {
    return;
  }

  rlSocket = net.connect(rocketLeaguePort, host);

  rlSocket.on("connect", () => {
    rlBuffer = "";
    broadcast({ Event: "BridgeStatus", Data: { Status: "RocketLeagueConnected" } });
  });

  rlSocket.on("data", (data) => {
    rlBuffer += data.toString("utf8");
    consumeRocketLeagueBuffer();
  });

  rlSocket.on("close", () => {
    broadcast({ Event: "BridgeStatus", Data: { Status: "RocketLeagueDisconnected" } });
    scheduleRocketLeagueReconnect();
  });

  rlSocket.on("error", () => {
    broadcast({ Event: "BridgeStatus", Data: { Status: "RocketLeagueUnavailable" } });
  });
}

const server = http.createServer((request, response) => {
  sendFile(response, new URL(request.url, `http://${host}:${appPort}`).pathname);
});

server.on("upgrade", (request, socket) => {
  if (request.url !== "/rl") {
    socket.destroy();
    return;
  }

  const key = request.headers["sec-websocket-key"];

  if (!key) {
    socket.destroy();
    return;
  }

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
      "",
      "",
    ].join("\r\n"),
  );

  clients.add(socket);
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  socket.on("data", () => {});
});

server.listen(appPort, host, () => {
  console.log(`Ball speed app: http://${host}:${appPort}`);
  console.log(`Rocket League Stats API TCP: ${host}:${rocketLeaguePort}`);
  connectRocketLeague();
});
