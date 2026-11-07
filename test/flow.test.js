// End-to-end game flow test: host + 2 players through both rounds and Final.
// Run with: npm test
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const assert = require('assert');

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const s = io(URL, { forceNew: true, transports: ['websocket'] });
  s.last = null;
  s.on('state', (st) => (s.last = st));
  s.call = (ev, data) => new Promise((r) => s.emit(ev, data || {}, r));
  return s;
}
async function until(fn, ms = 3000) {
  const t = Date.now();
  while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout waiting for condition'); await wait(20); }
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  try {
    await wait(600);
    const host = client(), a = client(), b = client();
    const { code } = await host.call('host:create');
    const ja = await a.call('player:join', { code, name: 'Alice' });
    const jb = await b.call('player:join', { code, name: 'Bob' });
    assert(ja.ok && jb.ok);
    assert.strictEqual((await b.call('player:join', { code, name: 'alice' })).ok, false, 'duplicate names rejected');
    assert((await host.call('host:start')).ok);
    await until(() => a.last?.phase === 'board');
    assert.strictEqual(a.last.current, null);
    assert(a.last.board[0].clues[0].q === undefined, 'players never see clue text on the board');

    let ddSeen = 0, clueCount = 0;
    for (let round = 0; round < 2; round++) {
      for (let cat = 0; cat < 6; cat++) for (let row = 0; row < 5; row++) {
        const ctrl = host.last.controller;
        const picker = ctrl === ja.id ? a : b;
        assert((await picker.call('pick', { cat, row })).ok, 'controller can pick');
        await until(() => host.last.current && host.last.current.cat === cat && host.last.current.row === row);
        clueCount++;
        if (host.last.phase === 'dd-wager') {
          ddSeen++;
          assert.strictEqual(a.last.current.q, null, 'DD clue hidden until wager');
          assert((await picker.call('dd:wager', { amount: 5 })).ok);
          await until(() => host.last.phase === 'dd-clue');
          assert((await host.call('host:judge', { correct: true })).ok);
        } else {
          assert.strictEqual(a.last.current.a, null, 'players do not see the answer');
          assert(host.last.current.a, 'host sees the answer');
          const early = await a.call('buzz');
          assert(early.early, 'early buzz flagged');
          await host.call('host:openBuzzers');
          await wait(300); // let Alice's early-buzz penalty expire
          const [ra, rb] = await Promise.all([a.call('buzz'), b.call('buzz')]);
          assert(ra.ok !== rb.ok, 'exactly one player wins the buzz');
          const winner = ra.ok ? a : b;
          if (row === 0) {
            // wrong then other player correct
            await host.call('host:judge', { correct: false });
            await until(() => host.last.buzzersOpen);
            const other = winner === a ? b : a;
            assert.strictEqual((await winner.call('buzz')).ok, false, 'locked out player cannot rebuzz');
            assert((await other.call('buzz')).ok);
            await host.call('host:judge', { correct: true });
          } else {
            await host.call('host:judge', { correct: true });
          }
        }
        await until(() => host.last.phase === 'reveal');
        await until(() => a.last.phase === 'reveal' && a.last.current.a); // answer revealed to players
        assert((await host.call('host:continue')).ok);
        await until(() => host.last.phase !== 'reveal');
      }
      if (round === 0) {
        assert.strictEqual(host.last.phase, 'round-end');
        await host.call('host:continue');
        await until(() => host.last.phase === 'board' && host.last.round === 1);
        assert.strictEqual(host.last.board[0].clues[4].value, 2000);
      }
    }
    assert.strictEqual(ddSeen, 3, 'three daily doubles total');
    assert.strictEqual(clueCount, 60);
    assert.strictEqual(host.last.phase, 'final-wager');
    const scores = Object.fromEntries(host.last.players.map((p) => [p.id, p.score]));
    assert((await a.call('final:wager', { amount: scores[ja.id] })).ok);
    assert.strictEqual((await b.call('final:wager', { amount: scores[jb.id] + 1 })).ok, false, 'cannot overbet');
    assert((await b.call('final:wager', { amount: 0 })).ok);
    await until(() => b.last.final.wagered.length === 2);
    assert.strictEqual(b.last.final.wagers, undefined, 'players cannot see wagers');
    await host.call('host:finalClue');
    await until(() => a.last.phase === 'final-clue' && a.last.final.q);
    await a.call('final:answer', { text: 'What is RoboRally?' });
    await b.call('final:answer', { text: 'idk' });
    await until(() => host.last.final.answered.length === 2);
    assert.strictEqual(a.last.final.answers, undefined, 'players cannot see answers');
    await host.call('host:finalLock');
    await host.call('host:finalJudge', { playerId: ja.id, correct: true });
    await host.call('host:finalJudge', { playerId: jb.id, correct: false });
    await until(() => host.last.phase === 'gameover');
    const fin = Object.fromEntries(host.last.players.map((p) => [p.id, p.score]));
    assert.strictEqual(fin[ja.id], scores[ja.id] * 2);
    assert.strictEqual(fin[jb.id], scores[jb.id]);

    // reconnect with token keeps score
    a.close();
    const a2 = client();
    const re = await a2.call('player:join', { code, token: ja.token });
    assert(re.ok && re.id === ja.id);
    await until(() => a2.last);
    assert.strictEqual(a2.last.players.find((p) => p.id === ja.id).score, fin[ja.id]);

    await host.call('host:restart');
    await until(() => host.last.phase === 'lobby' && host.last.players.every((p) => p.score === 0));
    console.log('PASS: full game flow (60 clues, 3 daily doubles, final, reconnect, restart)');
    srv.kill();
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e);
    srv.kill();
    process.exit(1);
  }
})();
