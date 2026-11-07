const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { categories: CATEGORY_BANK, finals: FINAL_BANK } = require('./clues');

const PORT = process.env.PORT || 3000;
const ROUND_VALUES = [
  [200, 400, 600, 800, 1000],
  [400, 800, 1200, 1600, 2000],
];
const ROUND_NAMES = ['Jeopardy!', 'Double Jeopardy!'];
const DAILY_DOUBLES = [1, 2];
const BUZZ_WINDOW_MS = 12000; // how long buzzers stay open before the clue times out
const EARLY_BUZZ_PENALTY_MS = 250; // lockout for buzzing before buzzers open
const FINAL_ANSWER_MS = 30000;
const ROOM_IDLE_MS = 60 * 60 * 1000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

app.get('/api/info', (req, res) => {
  const ips = lanAddresses();
  res.json({ joinUrl: ips.length ? `http://${ips[0]}:${PORT}/play.html` : null });
});

// ---------- helpers ----------
const rooms = new Map();
const id = (n = 8) => crypto.randomBytes(n).toString('hex');

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function buildBoard(round, cats) {
  const values = ROUND_VALUES[round];
  const board = cats.map((c) => ({
    name: c.name,
    clues: c.clues.map((cl, row) => ({ q: cl.q, a: cl.a, value: values[row], used: false, dd: false })),
  }));
  // Daily doubles: different categories, never the top row, weighted toward lower rows.
  const catIdx = shuffle(board.map((_, i) => i)).slice(0, DAILY_DOUBLES[round]);
  const rowWeights = [0, 1, 2, 3, 3];
  for (const ci of catIdx) {
    const pool = rowWeights.flatMap((w, r) => Array(w).fill(r));
    board[ci].clues[pool[Math.floor(Math.random() * pool.length)]].dd = true;
  }
  return board;
}

function newRoom() {
  const room = {
    code: makeCode(),
    hostToken: id(),
    hostSocket: null,
    players: new Map(), // token -> player
    phase: 'lobby',
    round: 0,
    rounds: [],
    board: null,
    finalClue: null,
    current: null,
    controller: null,
    buzzer: null,
    buzzersOpen: false,
    lockedOut: new Set(),
    earlyUntil: {},
    final: null,
    timer: null,
    deadline: null,
    lastActive: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

const playerList = (room) => [...room.players.values()];
const byId = (room, pid) => playerList(room).find((p) => p.id === pid);

function clearTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.deadline = null;
}

function setTimer(room, ms, fn) {
  clearTimer(room);
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(() => {
    room.timer = null;
    room.deadline = null;
    fn();
    broadcast(room);
  }, ms);
}

// ---------- views ----------
function view(room, forHost) {
  const cur = room.current;
  const showQ = cur && room.phase !== 'dd-wager';
  const revealed = room.phase === 'reveal';
  const f = room.final;
  let final = null;
  if (f) {
    final = {
      category: room.finalClue.category,
      q: ['final-clue', 'final-judge', 'gameover'].includes(room.phase) ? room.finalClue.q : null,
      a: forHost || ['final-judge', 'gameover'].includes(room.phase) ? room.finalClue.a : null,
      eligible: f.eligible,
      wagered: Object.keys(f.wagers),
      answered: Object.keys(f.answers),
      results: f.results, // revealed one at a time by the host
    };
    if (forHost) {
      final.wagers = f.wagers;
      final.answers = f.answers;
    }
  }
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    roundName: ROUND_NAMES[room.round],
    players: playerList(room).map(({ id, name, score, connected }) => ({ id, name, score, connected })),
    controller: room.controller,
    board: room.board && room.board.map((c) => ({ name: c.name, clues: c.clues.map((cl) => ({ value: cl.value, used: cl.used })) })),
    current: cur && {
      cat: cur.cat,
      row: cur.row,
      category: room.board[cur.cat].name,
      value: cur.value,
      dd: cur.dd,
      wager: cur.wager,
      q: showQ ? cur.q : null,
      a: forHost || revealed ? cur.a : null,
      result: cur.result || null,
    },
    buzzer: room.buzzer,
    buzzersOpen: room.buzzersOpen,
    lockedOut: [...room.lockedOut],
    deadline: room.deadline,
    serverNow: Date.now(),
    final,
  };
}

function broadcast(room) {
  room.lastActive = Date.now();
  if (room.hostSocket) io.to(room.hostSocket).emit('state', view(room, true));
  io.to(`players:${room.code}`).emit('state', view(room, false));
}

// ---------- game flow ----------
function startRound(room, round) {
  room.round = round;
  room.board = buildBoard(round, room.rounds[round]);
  room.current = null;
  room.phase = 'board';
  const ps = playerList(room);
  if (round === 0) {
    room.controller = ps.length ? ps[Math.floor(Math.random() * ps.length)].id : null;
  } else {
    // lowest score picks first in Double Jeopardy
    const sorted = ps.slice().sort((a, b) => a.score - b.score);
    room.controller = sorted.length ? sorted[0].id : null;
  }
}

function openBuzzers(room) {
  room.buzzersOpen = true;
  room.buzzer = null;
  setTimer(room, BUZZ_WINDOW_MS, () => revealClue(room, { timeout: true }));
}

function revealClue(room, result) {
  clearTimer(room);
  room.buzzersOpen = false;
  room.buzzer = null;
  room.current.result = result || null;
  room.phase = 'reveal';
}

function boardDone(room) {
  return room.board.every((c) => c.clues.every((cl) => cl.used));
}

function startFinal(room) {
  clearTimer(room);
  room.current = null;
  const eligible = playerList(room).filter((p) => p.score > 0).map((p) => p.id);
  room.final = { eligible, wagers: {}, answers: {}, results: [] };
  room.phase = eligible.length ? 'final-wager' : 'gameover';
}

function lockFinal(room) {
  clearTimer(room);
  room.phase = 'final-judge';
}

function maxDDWager(room, p) {
  return Math.max(p.score, ROUND_VALUES[room.round][4]);
}

function allActiveLockedOut(room) {
  return playerList(room)
    .filter((p) => p.connected)
    .every((p) => room.lockedOut.has(p.id));
}

// ---------- sockets ----------
io.on('connection', (socket) => {
  let room = null;
  let isHost = false;
  let me = null; // player object

  const fail = (cb, msg) => cb && cb({ ok: false, error: msg });

  socket.on('host:create', (_, cb) => {
    room = newRoom();
    isHost = true;
    room.hostSocket = socket.id;
    cb({ ok: true, code: room.code, hostToken: room.hostToken });
    broadcast(room);
  });

  socket.on('host:resume', ({ code, hostToken } = {}, cb) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r || r.hostToken !== hostToken) return fail(cb, 'Room not found');
    room = r;
    isHost = true;
    room.hostSocket = socket.id;
    cb({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on('player:join', ({ code, name, token } = {}, cb) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) return fail(cb, 'No game with that code');
    let p = token && r.players.get(token);
    if (!p) {
      name = String(name || '').trim().slice(0, 16);
      if (!name) return fail(cb, 'Enter a name');
      if (playerList(r).some((x) => x.name.toLowerCase() === name.toLowerCase())) return fail(cb, 'That name is taken');
      if (r.players.size >= 12) return fail(cb, 'Game is full');
      token = id();
      p = { id: id(4), token, name, score: 0, connected: true, socket: null };
      r.players.set(token, p);
    }
    room = r;
    me = p;
    p.connected = true;
    p.socket = socket.id;
    socket.join(`players:${r.code}`);
    cb({ ok: true, code: r.code, token: p.token, id: p.id, name: p.name });
    broadcast(r);
  });

  // --- host-only actions ---
  const host = (event, fn) =>
    socket.on(event, (data = {}, cb) => {
      if (!room || !isHost) return fail(cb, 'Not the host');
      const err = fn(data);
      if (err) return fail(cb, err);
      cb && cb({ ok: true });
      broadcast(room);
    });

  host('host:start', () => {
    if (room.phase !== 'lobby') return 'Already started';
    if (!room.players.size) return 'Wait for at least one player';
    const cats = shuffle(CATEGORY_BANK).slice(0, 12);
    room.rounds = [cats.slice(0, 6), cats.slice(6, 12)];
    room.finalClue = shuffle(FINAL_BANK)[0];
    startRound(room, 0);
  });

  host('host:openBuzzers', () => {
    if (room.phase !== 'clue' || room.buzzersOpen) return 'Not now';
    openBuzzers(room);
  });

  host('host:judge', ({ correct }) => {
    const cur = room.current;
    if (!cur) return 'No clue';
    if (room.phase === 'dd-clue') {
      const p = byId(room, room.controller);
      if (p) p.score += correct ? cur.wager : -cur.wager;
      revealClue(room, { player: room.controller, correct: !!correct });
      return;
    }
    if (room.phase !== 'clue' || !room.buzzer) return 'Nobody has buzzed';
    const p = byId(room, room.buzzer);
    if (correct) {
      p.score += cur.value;
      room.controller = p.id;
      revealClue(room, { player: p.id, correct: true });
    } else {
      p.score -= cur.value;
      room.lockedOut.add(p.id);
      room.buzzer = null;
      if (allActiveLockedOut(room)) revealClue(room, { player: p.id, correct: false });
      else openBuzzers(room);
    }
  });

  host('host:reveal', () => {
    if (!['clue', 'dd-clue'].includes(room.phase)) return 'Not now';
    revealClue(room, { timeout: true });
  });

  host('host:continue', () => {
    if (room.phase === 'reveal') {
      room.current = null;
      room.lockedOut.clear();
      room.phase = boardDone(room) ? (room.round === 0 ? 'round-end' : 'final-intro') : 'board';
      if (room.phase === 'final-intro') startFinal(room);
    } else if (room.phase === 'round-end') {
      startRound(room, 1);
    } else return 'Not now';
  });

  host('host:skipRound', () => {
    if (!['board', 'round-end'].includes(room.phase)) return 'Finish the current clue first';
    if (room.round === 0) startRound(room, 1);
    else startFinal(room);
  });

  host('host:finalClue', () => {
    if (room.phase !== 'final-wager') return 'Not now';
    for (const pid of room.final.eligible) if (!(pid in room.final.wagers)) room.final.wagers[pid] = 0;
    room.phase = 'final-clue';
    setTimer(room, FINAL_ANSWER_MS, () => lockFinal(room));
  });

  host('host:finalLock', () => {
    if (room.phase !== 'final-clue') return 'Not now';
    lockFinal(room);
  });

  host('host:finalJudge', ({ playerId, correct }) => {
    const f = room.final;
    if (room.phase !== 'final-judge' || !f.eligible.includes(playerId)) return 'Not now';
    if (f.results.some((r) => r.id === playerId)) return 'Already judged';
    const p = byId(room, playerId);
    const wager = f.wagers[playerId] || 0;
    if (p) p.score += correct ? wager : -wager;
    f.results.push({ id: playerId, answer: f.answers[playerId] || '', wager, correct: !!correct });
    if (f.results.length === f.eligible.length) room.phase = 'gameover';
  });

  host('host:adjust', ({ playerId, delta }) => {
    const p = byId(room, playerId);
    if (!p || !Number.isFinite(delta)) return 'Bad request';
    p.score += Math.trunc(delta);
  });

  host('host:setController', ({ playerId }) => {
    if (!byId(room, playerId)) return 'No such player';
    room.controller = playerId;
  });

  host('host:kick', ({ playerId }) => {
    const p = byId(room, playerId);
    if (!p) return 'No such player';
    room.players.delete(p.token);
    if (p.socket) {
      io.to(p.socket).emit('kicked');
      io.sockets.sockets.get(p.socket)?.leave(`players:${room.code}`);
    }
    if (room.controller === p.id) room.controller = playerList(room)[0]?.id || null;
  });

  host('host:restart', () => {
    clearTimer(room);
    for (const p of room.players.values()) p.score = 0;
    Object.assign(room, { phase: 'lobby', round: 0, board: null, current: null, final: null, buzzer: null, buzzersOpen: false });
    room.lockedOut.clear();
  });

  // --- shared: pick a clue (host or controlling player) ---
  socket.on('pick', ({ cat, row } = {}, cb) => {
    if (!room || room.phase !== 'board') return fail(cb, 'Not now');
    if (!isHost && (!me || me.id !== room.controller)) return fail(cb, "It's not your pick");
    const clue = room.board[cat]?.clues[row];
    if (!clue || clue.used) return fail(cb, 'Clue unavailable');
    clue.used = true;
    room.current = { cat, row, q: clue.q, a: clue.a, value: clue.value, dd: clue.dd, wager: null };
    room.lockedOut.clear();
    room.earlyUntil = {};
    room.buzzer = null;
    room.buzzersOpen = false;
    if (clue.dd) {
      room.phase = 'dd-wager';
    } else {
      room.phase = 'clue';
      // give the host time to read the clue aloud, then open buzzers automatically
      const readMs = Math.min(8000, Math.max(2500, clue.q.length * 55));
      setTimer(room, readMs, () => openBuzzers(room));
    }
    cb && cb({ ok: true });
    broadcast(room);
  });

  // --- daily double wager (controller or host on their behalf) ---
  socket.on('dd:wager', ({ amount } = {}, cb) => {
    if (!room || room.phase !== 'dd-wager') return fail(cb, 'Not now');
    if (!isHost && (!me || me.id !== room.controller)) return fail(cb, 'Not your Daily Double');
    const p = byId(room, room.controller);
    if (!p) return fail(cb, 'No controlling player');
    const max = maxDDWager(room, p);
    amount = Math.trunc(Number(amount));
    if (!Number.isFinite(amount) || amount < 5 || amount > max) return fail(cb, `Wager must be between 5 and ${max}`);
    room.current.wager = amount;
    room.phase = 'dd-clue';
    cb && cb({ ok: true });
    broadcast(room);
  });

  // --- buzz ---
  socket.on('buzz', (_, cb) => {
    if (!room || !me || room.phase !== 'clue') return;
    const now = Date.now();
    if (!room.buzzersOpen && !room.buzzer && !room.lockedOut.has(me.id)) {
      // buzzed while the clue was still being read
      room.earlyUntil[me.id] = now + EARLY_BUZZ_PENALTY_MS;
      return cb && cb({ ok: false, early: true });
    }
    if (room.buzzer || room.lockedOut.has(me.id) || (room.earlyUntil[me.id] || 0) > now) return cb && cb({ ok: false });
    room.buzzer = me.id;
    room.buzzersOpen = false;
    clearTimer(room);
    cb && cb({ ok: true });
    broadcast(room);
  });

  // --- final jeopardy ---
  socket.on('final:wager', ({ amount } = {}, cb) => {
    if (!room || !me || room.phase !== 'final-wager' || !room.final.eligible.includes(me.id)) return fail(cb, 'Not now');
    amount = Math.trunc(Number(amount));
    if (!Number.isFinite(amount) || amount < 0 || amount > me.score) return fail(cb, `Wager must be between 0 and ${me.score}`);
    room.final.wagers[me.id] = amount;
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on('final:answer', ({ text } = {}, cb) => {
    if (!room || !me || room.phase !== 'final-clue' || !room.final.eligible.includes(me.id)) return fail(cb, 'Not now');
    room.final.answers[me.id] = String(text || '').slice(0, 120);
    cb && cb({ ok: true });
    broadcast(room);
  });

  socket.on('disconnect', () => {
    if (!room) return;
    if (isHost && room.hostSocket === socket.id) room.hostSocket = null;
    if (me && me.socket === socket.id) {
      me.connected = false;
      me.socket = null;
      // if the buzzed-in player drops, let others try
      if (room.phase === 'clue' && room.buzzer === me.id) {
        room.lockedOut.add(me.id);
        if (allActiveLockedOut(room)) revealClue(room, { timeout: true });
        else openBuzzers(room);
      }
    }
    broadcast(room);
  });
});

// clean up abandoned rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const anyone = r.hostSocket || playerList(r).some((p) => p.connected);
    if (!anyone && now - r.lastActive > ROOM_IDLE_MS) {
      clearTimer(r);
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`MTG Jeopardy running at http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  Players on your network can join at http://${ip}:${PORT}/play.html`);
});
