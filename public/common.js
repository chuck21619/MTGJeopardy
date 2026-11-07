/* Shared helpers for host and player pages */
const socket = io();
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PIP_COLORS = ['w', 'u', 'b', 'r', 'g', 'c'];
const CAT_COLORS = ['var(--w)', 'var(--u)', 'var(--b)', 'var(--r)', 'var(--g)', 'var(--c)'];

function emit(event, data) {
  return new Promise((resolve) => {
    socket.emit(event, data || {}, (res) => {
      if (res && res.ok === false && res.error) toast(res.error);
      resolve(res || {});
    });
  });
}

let toastTimer;
function toast(msg) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

const fmt = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString();
const pipsHtml = () => `<span class="pips">${['w', 'u', 'b', 'r', 'g'].map((c) => `<span class="pip ${c}"></span>`).join('')}</span>`;

// Countdown bar driven by the server's deadline, corrected for clock skew.
let clockOffset = 0;
let timerLoop = null;
function trackDeadline(state, barEl, totalMs) {
  clockOffset = state.serverNow - Date.now();
  cancelAnimationFrame(timerLoop);
  if (!barEl) return;
  if (!state.deadline) {
    barEl.style.width = '0';
    return;
  }
  const tick = () => {
    const left = Math.max(0, state.deadline - (Date.now() + clockOffset));
    barEl.style.width = `${Math.min(100, (left / totalMs) * 100)}%`;
    if (left > 0) timerLoop = requestAnimationFrame(tick);
  };
  tick();
}

function boardHtml(board, { clickable }) {
  const cats = board.map((c, i) => `<div class="cat" style="border-top-color:${CAT_COLORS[i % 6]}">${esc(c.name)}</div>`).join('');
  let cells = '';
  for (let row = 0; row < 5; row++) {
    board.forEach((c, cat) => {
      const cl = c.clues[row];
      cells += `<button class="cell" data-cat="${cat}" data-row="${row}" ${cl.used ? 'disabled' : ''}>${cl.used ? '' : cl.value}</button>`;
    });
  }
  return `<div class="board ${clickable ? '' : 'locked'}">${cats}${cells}</div>`;
}

function standingsHtml(players) {
  return `<div class="standings">${players
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((p, i) => `<div class="standing"><span>${i === 0 ? '👑 ' : ''}${esc(p.name)}</span><span class="s">${fmt(p.score)}</span></div>`)
    .join('')}</div>`;
}
