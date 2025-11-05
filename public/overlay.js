const socket = io({ auth: {} });

const qEl = document.getElementById('q');
const optsEl = document.getElementById('opts');
const timeEl = document.getElementById('time');
const ringEl = document.querySelector('.ring');
const statusEl = document.getElementById('status');

function renderOptions(options, votes, phase, correctIndex) {
  optsEl.innerHTML = '';
  const totals = votes.reduce((a,b)=>a+b,0);
  const perc = totals ? votes.map(v => Math.round(v*100/totals)) : [0,0,0,0];

  options.forEach((text, i) => {
    const row = document.createElement('div');
    row.className = 'option';
    if (phase === 'reveal' && Number.isInteger(correctIndex)) {
      if (i === correctIndex) row.classList.add('correct');
      else if (votes[i] > 0) row.classList.add('wrong');
    }

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = `${perc[i]}%`;
    row.appendChild(bar);

    const letter = document.createElement('div');
    letter.className = 'letter';
    letter.textContent = String.fromCharCode(65 + i);

    const txt = document.createElement('div');
    txt.className = 'text';
    txt.textContent = text || '—';

    const met = document.createElement('div');
    met.className = 'metric';
    met.textContent = totals ? `${votes[i]} • ${perc[i]}%` : '';

    row.appendChild(letter);
    row.appendChild(txt);
    row.appendChild(met);
    optsEl.appendChild(row);
  });
}

socket.on('state', (s) => {
  qEl.textContent = s.question || '—';
  timeEl.textContent = s.secondsLeft ?? 0;

  // timer ring
  const total = 276; // 2πr, r=44
  const p = Math.max(0, Math.min(1, (s.secondsLeft || 0) / (s.secondsTotal || 1)));
  ringEl.style.strokeDashoffset = String(total - total * p);

  renderOptions(s.options, s.votes, s.phase, s.correctIndex);

  statusEl.textContent =
    `Q${s.questionId} • ${s.phase.toUpperCase()} • ${s.locked ? 'LOCKED' : 'UNLOCKED'} • ${s.secondsLeft}s`;
});

function renderOptions(options, votes, phase, correctIndex) {
  optsEl.innerHTML = '';
  const total = votes.reduce((a,b)=>a+b,0) || 1;
  const percentages = votes.map(v => Math.round(v*100/total));
  const maxVote = Math.max(...votes);
  const topWrong = votes.findIndex((v, i) => v === maxVote && i !== correctIndex);

  options.forEach((text, i) => {
    const row = document.createElement('div');
    row.className = 'option';

    if (phase === 'reveal' && Number.isInteger(correctIndex)) {
      if (i === correctIndex) row.classList.add('correct');
      else if (i === topWrong) row.classList.add('wrong');
    }

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = percentages[i] + '%';
    row.appendChild(bar);

    const letter = document.createElement('div');
    letter.className = 'letter';
    letter.textContent = String.fromCharCode(65 + i);

    const txt = document.createElement('div');
    txt.className = 'text';
    txt.textContent = text || '—';

    const met = document.createElement('div');
    met.className = 'metric';
    met.textContent = total ? `${votes[i]} • ${percentages[i]}%` : '';

    row.appendChild(letter);
    row.appendChild(txt);
    row.appendChild(met);
    optsEl.appendChild(row);
  });
}
