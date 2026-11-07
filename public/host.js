let S = null; // latest state
let peeking = false;
let overlayKey = null;
let joinUrl = `${location.origin}/play.html`;

const stage = $('#stage');
const nameOf = (pid) => S.players.find((p) => p.id === pid)?.name || '?';

// ----- connect / resume -----
async function connect() {
  const saved = JSON.parse(sessionStorage.getItem('mtgj-host') || 'null');
  if (saved) {
    const res = await new Promise((r) => socket.emit('host:resume', saved, r));
    if (res.ok) return;
  }
  const res = await new Promise((r) => socket.emit('host:create', {}, r));
  sessionStorage.setItem('mtgj-host', JSON.stringify({ code: res.code, hostToken: res.hostToken }));
}
socket.on('connect', connect);
fetch('/api/info').then((r) => r.json()).then((info) => {
  if (info.joinUrl && ['localhost', '127.0.0.1'].includes(location.hostname)) joinUrl = info.joinUrl;
  if (S) render();
});

socket.on('state', (state) => {
  S = state;
  render();
});

// ----- rendering -----
function render() {
  $('#code').textContent = S.code;
  $('#joinurl').innerHTML = `Join at <b>${esc(joinUrl.replace(/^https?:\/\//, ''))}</b>`;
  $('#roundname').textContent = ['board', 'clue', 'dd-wager', 'dd-clue', 'reveal', 'round-end'].includes(S.phase) ? S.roundName : '';
  $('#skipRound').classList.toggle('hidden', !['board', 'round-end'].includes(S.phase));
  $('#restart').classList.toggle('hidden', S.phase === 'lobby');
  renderScores();
  renderStage();
}

function renderScores() {
  $('#scores').innerHTML = S.phase === 'lobby' ? '' : S.players
    .map((p) => {
      const cls = [
        'podium',
        p.id === S.controller && ['board', 'clue', 'dd-wager', 'dd-clue', 'reveal'].includes(S.phase) ? 'control' : '',
        p.id === S.buzzer ? 'buzzed' : '',
        S.lockedOut.includes(p.id) ? 'locked' : '',
        p.connected ? '' : 'offline',
      ].join(' ');
      return `<div class="${cls}">
        ${p.id === S.controller && S.phase === 'board' ? '<span class="crown" title="Picks next">👑</span>' : ''}
        <div class="name">${esc(p.name)}${p.connected ? '' : ' (offline)'}</div>
        <div class="score ${p.score < 0 ? 'neg' : ''}">${fmt(p.score)}</div>
        <div class="tools">
          <button class="btn small ghost" data-adj="${p.id}" data-d="-100" title="Subtract 100">−</button>
          <button class="btn small ghost" data-adj="${p.id}" data-d="100" title="Add 100">+</button>
          <button class="btn small ghost" data-ctrl="${p.id}" title="Give this player the next pick">👑</button>
          <button class="btn small ghost" data-kick="${p.id}" title="Remove player">✕</button>
        </div>
      </div>`;
    })
    .join('');
}

function renderStage() {
  const ph = S.phase;
  const overlayPhases = ['clue', 'dd-wager', 'dd-clue', 'reveal'];
  if (overlayPhases.includes(ph)) {
    // board underneath, clue overlay on top
    const key = `${S.round}-${S.current.cat}-${S.current.row}`;
    if (!stage.querySelector('.board')) stage.innerHTML = boardHtml(S.board, { clickable: false });
    let ov = stage.querySelector('.overlay');
    if (!ov || overlayKey !== key) {
      ov?.remove();
      ov = document.createElement('div');
      ov.className = 'overlay';
      stage.appendChild(ov);
      overlayKey = key;
      peeking = false;
    }
    ov.innerHTML = overlayHtml();
    trackDeadline(S, $('.timerbar > div', ov), ph === 'clue' && !S.buzzersOpen ? readMsGuess() : 12000);
    return;
  }
  overlayKey = null;
  trackDeadline(S, null);

  if (ph === 'lobby') {
    stage.innerHTML = `<div class="center-panel"><div>
      <h2>Gather your players</h2>
      <p class="muted">On a phone, open <b style="color:var(--text)">${esc(joinUrl.replace(/^https?:\/\//, ''))}</b> and enter</p>
      <div class="lobby-code">${esc(S.code)}</div>
      <div class="lobby-players">${S.players.length ? S.players.map((p) => `<span class="chip">${esc(p.name)}</span>`).join('') : '<span class="muted">Waiting for players…</span>'}</div>
      <button class="btn big" id="start" ${S.players.length ? '' : 'disabled'}>Start game</button>
    </div></div>`;
  } else if (ph === 'board') {
    stage.innerHTML = boardHtml(S.board, { clickable: true });
  } else if (ph === 'round-end') {
    stage.innerHTML = `<div class="center-panel"><div>
      <h2>End of the first round</h2>
      ${standingsHtml(S.players)}
      <p class="muted">Values double next round. Lowest score picks first.</p>
      <button class="btn big" data-act="host:continue">Start Double Jeopardy!</button>
    </div></div>`;
  } else if (ph.startsWith('final') || ph === 'gameover') {
    stage.innerHTML = `<div class="overlay" style="animation:none">${finalHtml()}</div>`;
    if (ph === 'final-clue') trackDeadline(S, $('.timerbar > div', stage), 30000);
  }
}

function readMsGuess() {
  return Math.min(8000, Math.max(2500, (S.current.q || '').length * 55));
}

function overlayHtml() {
  const c = S.current;
  const ph = S.phase;
  const head = `<div class="overlay-head"><span>${esc(c.category)}</span><span>${c.dd && c.wager ? 'Wager ' + fmt(c.wager) : fmt(c.value)}</span></div>`;
  let body = '';
  let status = '';
  let controls = '';

  if (ph === 'dd-wager') {
    const p = S.players.find((x) => x.id === S.controller);
    const max = Math.max(p ? p.score : 0, S.round === 0 ? 1000 : 2000);
    body = `<div><div class="dd-banner">Daily Double!</div></div>`;
    status = `<span class="who">${esc(nameOf(S.controller))}</span>, make your wager (5 – ${fmt(max)})`;
    controls = `<input type="number" id="ddAmount" min="5" max="${max}" placeholder="Wager"><button class="btn" id="ddSubmit">Set wager for them</button>`;
  } else {
    body = `<div><div class="clue-text">${esc(c.q)}</div>${ph === 'reveal' ? `<div class="answer-text">${esc(c.a)}</div>` : ''}</div>`;
  }

  if (ph === 'clue') {
    if (S.buzzer) {
      status = `<span class="who">${esc(nameOf(S.buzzer))}</span> buzzed in!`;
      controls = `<button class="btn good big" data-judge="1">Correct (C)</button><button class="btn bad big" data-judge="0">Wrong (W)</button>`;
    } else if (S.buzzersOpen) {
      status = S.lockedOut.length ? 'Buzzers open for everyone else!' : 'Buzzers are open!';
      controls = `<button class="btn ghost" data-act="host:reveal">Nobody knows — reveal (R)</button>`;
    } else {
      status = '<span class="muted">Read the clue aloud… buzzers open soon</span>';
      controls = `<button class="btn" data-act="host:openBuzzers">Open buzzers now (Space)</button><button class="btn ghost" data-act="host:reveal">Reveal (R)</button>`;
    }
  } else if (ph === 'dd-clue') {
    status = `<span class="who">${esc(nameOf(S.controller))}</span>, your answer?`;
    controls = `<button class="btn good big" data-judge="1">Correct (C)</button><button class="btn bad big" data-judge="0">Wrong (W)</button>`;
  } else if (ph === 'reveal') {
    const r = c.result || {};
    if (r.player && r.correct) status = `<span class="who">${esc(nameOf(r.player))}</span> got it! ${c.dd ? '+' + fmt(c.wager) : '+' + fmt(c.value)}`;
    else if (r.player && c.dd) status = `<span class="who">${esc(nameOf(r.player))}</span> loses ${fmt(c.wager)}`;
    else status = '<span class="muted">The correct response was…</span>';
    controls = `<button class="btn big" data-act="host:continue">Back to the board (Space)</button>`;
  }

  const peek = ph !== 'reveal' && ph !== 'dd-wager'
    ? `<div class="peek">Host only: <button class="btn small ghost" id="peekBtn">${peeking ? 'Hide' : 'Peek'} answer</button><span class="secret ${peeking ? 'show' : ''}">${esc(c.a)}</span></div>`
    : '';

  return `${head}<div class="overlay-body">${body}</div>
    <div class="timerbar"><div></div></div>
    <div class="status">${status}</div>
    <div class="controls">${controls}</div>${peek}`;
}

function finalHtml() {
  const f = S.final;
  const ph = S.phase;
  const head = `<div class="overlay-head"><span>Final Jeopardy!</span><span>${f ? esc(f.category) : ''}</span></div>`;
  if (ph === 'gameover') {
    return `${head}<div class="overlay-body"><div style="width:100%">
      <h2 style="color:var(--gold);font-size:clamp(2rem,5vw,3.5rem);margin:0">Game over</h2>
      ${f && f.a ? `<p class="muted">Final answer: <b style="color:var(--gold)">${esc(f.a)}</b></p>` : ''}
      ${standingsHtml(S.players)}
      <button class="btn big" id="restartBig">Play again</button>
    </div></div>`;
  }
  const eligible = f.eligible.map((pid) => S.players.find((p) => p.id === pid)).filter(Boolean);
  if (ph === 'final-wager') {
    return `${head}<div class="overlay-body"><div>
      <div class="muted" style="font-size:1.2rem">The category is</div>
      <div class="dd-banner" style="font-size:clamp(2rem,6vw,4.5rem)">${esc(f.category)}</div>
      <p>Players with money, lock in your wagers.</p>
      <div class="lobby-players">${eligible.map((p) => `<span class="chip">${f.wagered.includes(p.id) ? '✅' : '⏳'} ${esc(p.name)}</span>`).join('')}</div>
    </div></div>
    <div class="controls"><button class="btn big" data-act="host:finalClue">${f.wagered.length >= eligible.length ? 'Reveal the clue' : 'Reveal now (missing wagers = $0)'}</button></div>`;
  }
  if (ph === 'final-clue') {
    return `${head}<div class="overlay-body"><div><div class="clue-text">${esc(f.q)}</div>
      <div class="lobby-players">${eligible.map((p) => `<span class="chip">${f.answered.includes(p.id) ? '✍️' : '⏳'} ${esc(p.name)}</span>`).join('')}</div></div></div>
      <div class="timerbar"><div></div></div>
      <div class="controls"><button class="btn" data-act="host:finalLock">Lock answers now</button></div>
      <div class="peek">Host only: <button class="btn small ghost" id="peekBtn">${peeking ? 'Hide' : 'Peek'} answer</button><span class="secret ${peeking ? 'show' : ''}">${esc(f.a)}</span></div>`;
  }
  // final-judge
  const judged = Object.fromEntries(f.results.map((r) => [r.id, r]));
  return `${head}<div class="overlay-body"><div style="width:100%">
    <div class="clue-text" style="font-size:clamp(1rem,2vw,1.6rem)">${esc(f.q)}</div>
    <div class="answer-text">${esc(f.a)}</div>
    <div class="final-list">${eligible
      .map((p) => {
        const r = judged[p.id];
        const ans = f.answers[p.id];
        if (r) {
          return `<div class="final-row"><span class="nm">${esc(p.name)}</span><span class="ans">${esc(r.answer || '—')}</span>
            <span class="res ${r.correct ? 'good' : 'bad'}">${r.correct ? '+' : '−'}${fmt(r.wager)}</span></div>`;
        }
        return `<div class="final-row"><span class="nm">${esc(p.name)}</span><span class="ans muted">(hidden — judge to reveal)</span>
          <span class="secret ${peeking ? 'show' : ''}" title="Host only">“${esc(ans || '—')}” · ${fmt(f.wagers[p.id] || 0)}</span>
          <button class="btn small good" data-fj="${p.id}" data-c="1">Correct</button>
          <button class="btn small bad" data-fj="${p.id}" data-c="0">Wrong</button></div>`;
      })
      .join('')}</div>
    <div class="peek"><button class="btn small ghost" id="peekBtn">${peeking ? 'Hide' : 'Peek at'} answers &amp; wagers</button></div>
  </div></div>`;
}

// ----- input -----
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.id === 'start') return emit('host:start');
  if (t.id === 'skipRound') {
    if (confirm(S.round === 0 ? 'End this round and go to Double Jeopardy?' : 'End this round and go to Final Jeopardy?')) emit('host:skipRound');
    return;
  }
  if (t.id === 'restart' || t.id === 'restartBig') {
    if (t.id === 'restartBig' || confirm('Start a new game? Scores reset; players stay.')) emit('host:restart');
    return;
  }
  if (t.id === 'peekBtn') {
    peeking = !peeking;
    return render();
  }
  if (t.id === 'ddSubmit') return emit('dd:wager', { amount: Number($('#ddAmount').value) });
  if (t.classList.contains('cell') && S.phase === 'board') return emit('pick', { cat: +t.dataset.cat, row: +t.dataset.row });
  if (t.dataset.act) return emit(t.dataset.act);
  if (t.dataset.judge) return emit('host:judge', { correct: t.dataset.judge === '1' });
  if (t.dataset.fj) return emit('host:finalJudge', { playerId: t.dataset.fj, correct: t.dataset.c === '1' });
  if (t.dataset.adj) return emit('host:adjust', { playerId: t.dataset.adj, delta: Number(t.dataset.d) });
  if (t.dataset.ctrl) return emit('host:setController', { playerId: t.dataset.ctrl });
  if (t.dataset.kick) {
    if (confirm(`Remove ${nameOf(t.dataset.kick)} from the game?`)) emit('host:kick', { playerId: t.dataset.kick });
  }
});

document.addEventListener('keydown', (e) => {
  if (!S || e.target.matches('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (S.phase === 'clue' && S.buzzer && (k === 'c' || k === 'w')) emit('host:judge', { correct: k === 'c' });
  else if (S.phase === 'dd-clue' && (k === 'c' || k === 'w')) emit('host:judge', { correct: k === 'c' });
  else if (k === 'r' && ['clue', 'dd-clue'].includes(S.phase) && !S.buzzer) emit('host:reveal');
  else if (k === ' ' && S.phase === 'clue' && !S.buzzersOpen && !S.buzzer) { e.preventDefault(); emit('host:openBuzzers'); }
  else if (k === ' ' && S.phase === 'reveal') { e.preventDefault(); emit('host:continue'); }
});
