const app = $('#app');
const STORE = 'mtgj-player';
let S = null;
let me = null; // { id, name, code, token }
let myFinalWager = null;
let finalSubmitted = '';
let earlyUntil = 0;
let lastHtml = '';

// ----- joining -----
function saved() {
  try { return JSON.parse(sessionStorage.getItem(STORE) || 'null'); } catch { return null; }
}

async function join(code, name, token) {
  const res = await new Promise((r) => socket.emit('player:join', { code, name, token }, r));
  if (!res.ok) return res;
  me = { id: res.id, name: res.name, code: res.code, token: res.token };
  sessionStorage.setItem(STORE, JSON.stringify({ code: res.code, token: res.token }));
  history.replaceState(null, '', `?code=${res.code}`);
  return res;
}

socket.on('connect', async () => {
  const s = saved();
  const urlCode = new URLSearchParams(location.search).get('code');
  if (s && (!urlCode || urlCode.toUpperCase() === s.code)) {
    const res = await join(s.code, null, s.token);
    if (res.ok) return;
    sessionStorage.removeItem(STORE);
  }
  me = null;
  renderJoin();
});

socket.on('kicked', () => {
  sessionStorage.removeItem(STORE);
  me = null;
  S = null;
  renderJoin();
  toast('The host removed you from the game');
});

socket.on('state', (state) => {
  if (S && S.phase !== state.phase && state.phase === 'final-wager') { myFinalWager = null; finalSubmitted = ''; }
  if (state.phase === 'lobby') { myFinalWager = null; finalSubmitted = ''; }
  S = state;
  if (me) render();
});

function renderJoin() {
  lastHtml = '';
  const code = new URLSearchParams(location.search).get('code') || '';
  app.innerHTML = `<div class="landing" style="min-height:90vh"><div class="landing-card">
    <h1 class="logo">MTG Jeopardy</h1>
    <div>${pipsHtml()}</div>
    <form class="form" id="joinForm" style="margin-top:24px">
      <label>Room code<input id="jcode" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(code.toUpperCase())}" placeholder="ABCD" style="text-transform:uppercase;letter-spacing:.2em;font-size:1.4rem"></label>
      <label>Your name<input id="jname" maxlength="16" autocomplete="nickname" placeholder="Planeswalker name"></label>
      <button class="btn big" type="submit">Join game</button>
    </form>
  </div></div>`;
  $(code ? '#jname' : '#jcode').focus();
}

// ----- rendering -----
function render() {
  const p = S.players.find((x) => x.id === me.id);
  if (!p) return;
  const html = `
    <div class="p-head">
      <span class="nm">${esc(p.name)}</span>
      <span class="muted serif">Room ${esc(S.code)}</span>
      <span class="sc ${p.score < 0 ? 'neg' : ''}">${fmt(p.score)}</span>
    </div>
    <div class="p-main">${mainHtml(p)}</div>`;
  if (html === lastHtml) return;
  lastHtml = html;
  // keep whatever the player is typing across re-renders
  const active = document.activeElement;
  const keep = active && active.id && active.matches('input, textarea') ? { id: active.id, value: active.value, pos: active.selectionStart } : null;
  app.innerHTML = html;
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      el.value = keep.value;
      el.focus();
      try { el.setSelectionRange(keep.pos, keep.pos); } catch {}
    }
  }
}

const nameOf = (pid) => S.players.find((x) => x.id === pid)?.name || '?';
const clueCard = (c, extra = '') => `<div class="p-clue"><div class="meta">${esc(c.category)} · ${c.dd && c.wager ? 'Wager ' + fmt(c.wager) : fmt(c.value)}</div>${esc(c.q)}${extra}</div>`;

function mainHtml(p) {
  const c = S.current;
  const mine = S.controller === me.id;
  switch (S.phase) {
    case 'lobby':
      return `<h2>You're in!</h2><p class="muted">Waiting for the host to start the game.</p>
        <div class="lobby-players">${S.players.map((x) => `<span class="chip">${esc(x.name)}</span>`).join('')}</div>`;

    case 'board':
      return mine
        ? `<h2>Your pick!</h2><p class="muted">Choose a clue, or call it out to the host.</p>${boardHtml(S.board, { clickable: true }).replace('class="board', 'class="board p-board')}`
        : `<h2>${esc(nameOf(S.controller))} is choosing…</h2><p class="muted">Get your finger on the buzzer.</p>`;

    case 'clue': {
      const locked = S.lockedOut.includes(me.id);
      let label = 'BUZZ';
      let cls = '';
      let msg = '';
      let disabled = false;
      if (S.buzzer === me.id) { label = "YOU'RE IN"; cls = 'won'; msg = 'Answer out loud, in the form of a question!'; disabled = true; }
      else if (S.buzzer) { disabled = true; msg = `<b>${esc(nameOf(S.buzzer))}</b> buzzed in`; }
      else if (locked) { disabled = true; label = 'LOCKED'; msg = "You've already answered this one"; }
      else if (S.buzzersOpen) { cls = 'armed'; msg = 'Buzzers open!'; }
      else { msg = 'Wait for it… buzzing early locks you out briefly'; }
      return `${clueCard(c)}<button class="buzzer ${cls}" id="buzz" ${disabled ? 'disabled' : ''}>${label}</button><div class="muted">${msg}</div>`;
    }

    case 'dd-wager': {
      if (!mine) return `<div class="dd-banner" style="font-size:2.6rem">Daily Double!</div><p><b>${esc(nameOf(S.controller))}</b> is making a wager…</p>`;
      const max = Math.max(p.score, S.round === 0 ? 1000 : 2000);
      return `<div class="dd-banner" style="font-size:2.6rem">Daily Double!</div>
        <p class="muted">Category: <b style="color:var(--text)">${esc(c.category)}</b></p>
        <form class="form" id="ddForm"><label>Your wager (5 – ${fmt(max)})<input type="number" id="ddAmt" min="5" max="${max}" inputmode="numeric" required></label>
        <div style="display:flex;gap:8px"><button class="btn ghost" type="button" id="ddMax" data-max="${max}">True Daily Double</button><button class="btn" type="submit" style="flex:1">Lock it in</button></div></form>`;
    }

    case 'dd-clue':
      return `${clueCard(c)}<p>${mine ? '<b>Answer out loud to the host!</b>' : `<b>${esc(nameOf(S.controller))}</b> is answering…`}</p>`;

    case 'reveal': {
      const r = c.result || {};
      let res = '';
      if (r.player === me.id) res = r.correct ? `<h2 style="color:var(--good)">Correct!</h2>` : `<h2 style="color:var(--bad)">Not quite</h2>`;
      else if (r.player && r.correct) res = `<p><b>${esc(nameOf(r.player))}</b> got it</p>`;
      return `${clueCard(c, `<div class="answer-text" style="font-size:1.2rem;margin-top:14px">${esc(c.a)}</div>`)}${res}`;
    }

    case 'round-end':
      return `<h2>End of round one</h2>${standingsHtml(S.players)}<p class="muted">Double Jeopardy is next. Values double!</p>`;

    case 'final-wager': {
      const f = S.final;
      if (!f.eligible.includes(me.id)) return `<h2>Final Jeopardy!</h2><p class="muted">Only players with money can play Final. Sit back and enjoy!</p><p>Category: <b>${esc(f.category)}</b></p>`;
      if (myFinalWager !== null && f.wagered.includes(me.id)) return `<h2>Final Jeopardy!</h2><p>Category: <b>${esc(f.category)}</b></p><p>Your wager: <b class="serif" style="color:var(--gold)">${fmt(myFinalWager)}</b></p><p class="muted">Waiting for the clue…</p>`;
      return `<h2>Final Jeopardy!</h2><p>Category: <b>${esc(f.category)}</b></p>
        <form class="form" id="fwForm"><label>Secret wager (0 – ${fmt(p.score)})<input type="number" id="fwAmt" min="0" max="${p.score}" inputmode="numeric" required></label>
        <button class="btn big" type="submit">Lock in wager</button></form>`;
    }

    case 'final-clue': {
      const f = S.final;
      const card = `<div class="p-clue"><div class="meta">Final · ${esc(f.category)}</div>${esc(f.q)}</div>`;
      if (!f.eligible.includes(me.id)) return `${card}<p class="muted">Players are writing their responses…</p>`;
      return `${card}<form class="form" id="faForm"><label>Your response<input id="faText" maxlength="120" autocomplete="off" placeholder="What is…"></label>
        <button class="btn big" type="submit">${finalSubmitted ? 'Update response' : 'Submit response'}</button></form>
        ${finalSubmitted ? `<p class="muted">Submitted: “${esc(finalSubmitted)}”</p>` : ''}`;
    }

    case 'final-judge': {
      const f = S.final;
      return `<h2>The answer is…</h2><div class="p-clue" style="text-align:center;color:var(--gold)">${esc(f.a)}</div>
        <div class="final-list">${f.results.map((r) => `<div class="final-row"><span class="nm">${esc(nameOf(r.id))}</span><span class="ans">${esc(r.answer || '—')}</span><span class="res ${r.correct ? 'good' : 'bad'}">${r.correct ? '+' : '−'}${fmt(r.wager)}</span></div>`).join('')}</div>
        <p class="muted">The host is revealing responses…</p>`;
    }

    case 'gameover': {
      const top = S.players.slice().sort((a, b) => b.score - a.score)[0];
      return `<h2>${top && top.id === me.id ? 'You win! 🏆' : 'Game over'}</h2>${standingsHtml(S.players)}`;
    }
  }
  return '';
}

// ----- input -----
function buzz() {
  if (!S || S.phase !== 'clue' || S.buzzer || S.lockedOut.includes(me.id)) return;
  if (navigator.vibrate) navigator.vibrate(30);
  socket.emit('buzz', {}, (res) => {
    if (res && res.early) {
      earlyUntil = Date.now() + 250;
      toast('Too early!');
    }
  });
}

app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#buzz')) { e.preventDefault(); buzz(); }
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.matches('input, textarea')) { e.preventDefault(); buzz(); }
});

app.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.classList.contains('cell')) emit('pick', { cat: +t.dataset.cat, row: +t.dataset.row });
  if (t.id === 'ddMax') $('#ddAmt').value = t.dataset.max;
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'joinForm') {
    const res = await join($('#jcode').value.trim().toUpperCase(), $('#jname').value.trim());
    if (!res.ok) toast(res.error);
    else if (S) render();
  } else if (f.id === 'ddForm') {
    emit('dd:wager', { amount: Number($('#ddAmt').value) });
  } else if (f.id === 'fwForm') {
    const amount = Number($('#fwAmt').value);
    const res = await emit('final:wager', { amount });
    if (res.ok) { myFinalWager = amount; lastHtml = ''; render(); }
  } else if (f.id === 'faForm') {
    const text = $('#faText').value.trim();
    if (!text) return;
    const res = await emit('final:answer', { text });
    if (res.ok) { finalSubmitted = text; $('#faText').value = ''; lastHtml = ''; document.activeElement.blur(); render(); }
  }
});
