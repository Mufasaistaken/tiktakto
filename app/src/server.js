const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const crypto = require("crypto");
const proxyaddr = require("proxy-addr");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = process.env.PUBLIC_DIR
  ? path.resolve(process.env.PUBLIC_DIR)
  : path.join(__dirname, "..", "public");
const TRUST_PROXY = process.env.TRUST_PROXY || "loopback";
const CLIENT_ORIGINS = String(process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
const ALLOW_NO_ORIGIN = String(process.env.ALLOW_NO_ORIGIN || "false") === "true";
const MAX_ACTIVE_ROOMS = Number(process.env.MAX_ACTIVE_ROOMS || 2000);
const STALE_ROOM_MS = Number(process.env.STALE_ROOM_MS || 60 * 60 * 1000);
const MAX_SOCKETS_TOTAL = Number(process.env.MAX_SOCKETS_TOTAL || 5000);
const MAX_SOCKETS_PER_CLIENT = Number(process.env.MAX_SOCKETS_PER_CLIENT || 25);
const MAX_SCORE = Number(process.env.MAX_SCORE || 999);
const rateBuckets = new Map();
const socketCountsByClient = new Map();
let activeSocketCount = 0;
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];
const rooms = new Map();
const trustProxy = proxyaddr.compile(TRUST_PROXY);

function isAllowedHandshake(req) {
  const origin = req.headers.origin;
  if (!origin) {
    return ALLOW_NO_ORIGIN;
  }

  if (CLIENT_ORIGINS.length > 0) {
    return CLIENT_ORIGINS.includes(origin);
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === req.headers.host;
  } catch {
    return false;
  }
}

const io = new Server(server, {
  maxHttpBufferSize: 1e5,
  allowRequest: (req, callback) => {
    callback(null, isAllowedHandshake(req));
  }
});

app.disable("x-powered-by");
app.set("trust proxy", TRUST_PROXY);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://cdn.socket.io; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';"
  );
  next();
});
app.use(express.static(PUBLIC_DIR));

function nowMs() {
  return Date.now();
}

function touchRoom(room) {
  room.lastActivity = nowMs();
}

function roomHasAnyPlayer(room) {
  return Boolean(room.players.X || room.players.O);
}

function isRateLimited(key, limit, windowMs) {
  const now = nowMs();
  const entry = rateBuckets.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    rateBuckets.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > limit) {
    return true;
  }
  return false;
}

function clientKey(socket) {
  let ip = "unknown";
  try {
    ip = String(proxyaddr(socket.request, trustProxy) || "unknown");
  } catch {
    ip = String(socket.handshake.address || "unknown");
  }
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function isValidRoomCode(roomCode) {
  return /^[A-Z0-9]{8}$/.test(roomCode);
}

function incrementSocketCounters(cKey) {
  activeSocketCount += 1;
  const current = socketCountsByClient.get(cKey) || 0;
  socketCountsByClient.set(cKey, current + 1);
}

function decrementSocketCounters(cKey) {
  activeSocketCount = Math.max(0, activeSocketCount - 1);
  const current = socketCountsByClient.get(cKey) || 0;
  if (current <= 1) {
    socketCountsByClient.delete(cKey);
    return;
  }
  socketCountsByClient.set(cKey, current - 1);
}

function createRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";

  do {
    code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));

  return code;
}

function createRoom(socketId) {
  const roomCode = createRoomCode();
  const timestamp = nowMs();
  const room = {
    code: roomCode,
    players: {
      X: socketId,
      O: null
    },
    board: Array(9).fill(""),
    turn: "X",
    active: false,
    scores: { X: 0, O: 0, D: 0 },
    winner: null,
    winningLine: [],
    createdAt: timestamp,
    lastActivity: timestamp
  };
  rooms.set(roomCode, room);
  return room;
}

function findRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.X === socketId || room.players.O === socketId) {
      return room;
    }
  }
  return null;
}

function getWinner(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

function gameState(room) {
  return {
    roomCode: room.code,
    board: room.board,
    turn: room.turn,
    active: room.active,
    scores: room.scores,
    winner: room.winner,
    winningLine: room.winningLine
  };
}

function emitState(room) {
  touchRoom(room);
  io.to(room.code).emit("state_update", gameState(room));
}

function emitError(socket, message) {
  socket.emit("action_error", { message });
}

function isInitiator(room, socketId) {
  return room.players.X === socketId;
}

function safeIncrementScore(room, mark) {
  const current = Number(room.scores[mark] || 0);
  room.scores[mark] = Math.min(MAX_SCORE, current + 1);
}

function teardownRoom(room, message) {
  io.to(room.code).emit("session_ended", { message });
  io.in(room.code).socketsLeave(room.code);
  rooms.delete(room.code);
}

function removePlayerFromRoom(socket, room) {
  if (!room) {
    return;
  }

  if (room.players.X === socket.id) {
    room.players.X = null;
  } else if (room.players.O === socket.id) {
    room.players.O = null;
  }

  socket.leave(room.code);
  io.to(room.code).emit("player_left");
  room.active = false;
  room.board = Array(9).fill("");
  room.winner = null;
  room.winningLine = [];
  emitState(room);

  if (!roomHasAnyPlayer(room)) {
    rooms.delete(room.code);
  }
}

io.on("connection", (socket) => {
  const cKey = clientKey(socket);
  const clientSocketCount = socketCountsByClient.get(cKey) || 0;

  if (activeSocketCount >= MAX_SOCKETS_TOTAL || clientSocketCount >= MAX_SOCKETS_PER_CLIENT) {
    socket.disconnect(true);
    return;
  }

  incrementSocketCounters(cKey);
  let countedSocket = true;

  function releaseSocketCounter() {
    if (!countedSocket) {
      return;
    }
    decrementSocketCounters(cKey);
    countedSocket = false;
  }

  if (isRateLimited(`${cKey}:connect`, 60, 60_000)) {
    releaseSocketCounter();
    socket.disconnect(true);
    return;
  }

  socket.on("create_room", () => {
    if (isRateLimited(`${cKey}:create_room`, 20, 60_000)) {
      emitError(socket, "Too many room creation attempts. Please wait.");
      return;
    }
    const existingRoom = findRoomBySocketId(socket.id);
    if (existingRoom) {
      emitError(socket, "You are already in a room.");
      return;
    }
    if (rooms.size >= MAX_ACTIVE_ROOMS) {
      emitError(socket, "Server is busy. Try again shortly.");
      return;
    }

    const room = createRoom(socket.id);
    socket.join(room.code);
    socket.emit("room_joined", { roomCode: room.code, mark: "X" });
    emitState(room);
  });

  socket.on("join_room", (payload = {}) => {
    if (isRateLimited(`${cKey}:join_room`, 40, 60_000)) {
      emitError(socket, "Too many join attempts. Please wait.");
      return;
    }
    const existingRoom = findRoomBySocketId(socket.id);
    if (existingRoom) {
      emitError(socket, "You are already in a room.");
      return;
    }

    const roomCode = String(payload.roomCode || "").trim().toUpperCase();
    if (!isValidRoomCode(roomCode)) {
      emitError(socket, "Enter a valid room code.");
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      emitError(socket, "Room not found.");
      return;
    }
    if (room.players.X && room.players.O) {
      emitError(socket, "Room is full.");
      return;
    }

    const joiningAsX = !room.players.X;
    if (joiningAsX) {
      room.players.X = socket.id;
    } else {
      room.players.O = socket.id;
    }
    room.active = true;
    room.turn = "X";
    room.board = Array(9).fill("");
    room.winner = null;
    room.winningLine = [];

    socket.join(room.code);
    socket.emit("room_joined", { roomCode: room.code, mark: joiningAsX ? "X" : "O" });
    io.to(room.code).emit("player_ready");
    emitState(room);
  });

  socket.on("make_move", (payload = {}) => {
    if (isRateLimited(`${cKey}:make_move`, 120, 60_000)) {
      emitError(socket, "Too many move requests. Please slow down.");
      return;
    }
    const room = findRoomBySocketId(socket.id);
    if (!room) {
      emitError(socket, "Join a room first.");
      return;
    }

    const mark = room.players.X === socket.id ? "X" : room.players.O === socket.id ? "O" : null;
    if (!mark) {
      emitError(socket, "You are not part of this room.");
      return;
    }

    if (!room.active) {
      emitError(socket, "Waiting for second player.");
      return;
    }

    if (room.winner || room.board.every(Boolean)) {
      emitError(socket, "Round ended. Start a new round.");
      return;
    }

    if (room.turn !== mark) {
      emitError(socket, "Not your turn.");
      return;
    }

    const index = Number(payload.index);
    if (!Number.isInteger(index) || index < 0 || index > 8) {
      emitError(socket, "Invalid move.");
      return;
    }
    if (room.board[index]) {
      emitError(socket, "Cell already used.");
      return;
    }

    room.board[index] = mark;
    const winResult = getWinner(room.board);
    if (winResult) {
      room.winner = winResult.winner;
      room.winningLine = winResult.line;
      safeIncrementScore(room, room.winner);
    } else if (room.board.every(Boolean)) {
      safeIncrementScore(room, "D");
    } else {
      room.turn = room.turn === "X" ? "O" : "X";
    }

    emitState(room);
  });

  socket.on("new_round", () => {
    if (isRateLimited(`${cKey}:new_round`, 40, 60_000)) {
      emitError(socket, "Too many requests. Please wait.");
      return;
    }
    const room = findRoomBySocketId(socket.id);
    if (!room) {
      emitError(socket, "Join a room first.");
      return;
    }
    if (!isInitiator(room, socket.id)) {
      emitError(socket, "Only the initiator can start a new round.");
      return;
    }

    room.board = Array(9).fill("");
    room.turn = "X";
    room.winner = null;
    room.winningLine = [];
    room.active = Boolean(room.players.X && room.players.O);
    emitState(room);
  });

  socket.on("reset_score", () => {
    if (isRateLimited(`${cKey}:reset_score`, 20, 60_000)) {
      emitError(socket, "Too many requests. Please wait.");
      return;
    }
    const room = findRoomBySocketId(socket.id);
    if (!room) {
      emitError(socket, "Join a room first.");
      return;
    }
    if (!isInitiator(room, socket.id)) {
      emitError(socket, "Only the initiator can reset score.");
      return;
    }

    room.scores = { X: 0, O: 0, D: 0 };
    room.board = Array(9).fill("");
    room.turn = "X";
    room.winner = null;
    room.winningLine = [];
    room.active = Boolean(room.players.X && room.players.O);
    emitState(room);
  });

  socket.on("leave_room", () => {
    if (isRateLimited(`${cKey}:leave_room`, 20, 60_000)) {
      return;
    }
    const room = findRoomBySocketId(socket.id);
    if (!room) {
      return;
    }
    if (room.players.X === socket.id) {
      teardownRoom(room, "Initiator left. Session ended.");
      return;
    }
    removePlayerFromRoom(socket, room);
  });

  socket.on("forfeit_game", () => {
    if (isRateLimited(`${cKey}:forfeit_game`, 20, 60_000)) {
      return;
    }
    const room = findRoomBySocketId(socket.id);
    if (!room) {
      return;
    }

    const forfeiterMark = room.players.X === socket.id ? "X" : room.players.O === socket.id ? "O" : null;
    if (!forfeiterMark) {
      return;
    }

    const opponentMark = forfeiterMark === "X" ? "O" : "X";
    const opponentConnected = Boolean(room.players[opponentMark]);
    const roundInProgress = room.active && !room.winner && !room.board.every(Boolean);

    if (opponentConnected && roundInProgress) {
      safeIncrementScore(room, opponentMark);
      io.to(room.code).emit("forfeit_notice", {
        forfeited: forfeiterMark,
        winner: opponentMark
      });
    }

    if (forfeiterMark === "X") {
      teardownRoom(room, "Initiator forfeited. Session ended.");
      return;
    }

    removePlayerFromRoom(socket, room);
  });

  socket.on("disconnect", () => {
    releaseSocketCounter();
    const room = findRoomBySocketId(socket.id);
    if (!room) {
      return;
    }
    if (room.players.X === socket.id) {
      teardownRoom(room, "Initiator disconnected. Session ended.");
      return;
    }
    removePlayerFromRoom(socket, room);
  });
});

setInterval(() => {
  const cutoff = nowMs() - STALE_ROOM_MS;
  for (const room of rooms.values()) {
    if (!room.active && room.lastActivity < cutoff) {
      rooms.delete(room.code);
    }
  }

  const bucketCutoff = nowMs() - 5 * 60_000;
  for (const [key, value] of rateBuckets.entries()) {
    if (value.windowStart < bucketCutoff) {
      rateBuckets.delete(key);
    }
  }
}, 5 * 60_000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`TikTakTo server running on http://0.0.0.0:${PORT}`);
});
