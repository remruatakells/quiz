const socket = io();
const qEl = document.getElementById('q');
const btns = document.getElementById('btns');
const statusEl = document.getElementById('status');

let chosenIndex = null;
let lastQuestionId = null;

// preload sounds
const soundCorrect = new Audio('/sounds/correct.wav');
const soundWrong   = new Audio('/sounds/wrong.wav');
const soundTimeUp  = new Audio('/sounds/timeup.wav');
soundCorrect.volume = 0.8;
soundWrong.volume   = 0.8;
soundTimeUp.volume  = 0.6;

function renderChoices(options, locked, phase, correctIndex, secondsLeft) {
  btns.innerHTML = '';

  options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.textContent = `${String.fromCharCode(65 + i)}. ${opt || '—'}`;

    if (i === chosenIndex) b.classList.add('selected');
    b.disabled = locked || phase !== 'running';

    // vote click
    b.onclick = () => {
      if (b.disabled || chosenIndex !== null) return;
      chosenIndex = i;
      b.classList.add('selected');
      socket.emit('vote', i);
    };

    btns.appendChild(b);
  });

  // reveal phase: play sound & show animation only for chosen
  if (phase === 'reveal' && chosenIndex !== null) {
    const buttons = btns.querySelectorAll('button');
    buttons.forEach((btn, i) => {
      if (i === chosenIndex) {
        if (i === correctIndex) {
          btn.classList.add('correct');
          soundCorrect.currentTime = 0;
          soundCorrect.play().catch(()=>{});
        } else {
          btn.classList.add('wrong');
          soundWrong.currentTime = 0;
          soundWrong.play().catch(()=>{});
        }
      }
    });
  }

  // optional: play "time up" sound
  if (secondsLeft === 0 && phase === 'reveal') {
    soundTimeUp.currentTime = 0;
    soundTimeUp.play().catch(()=>{});
  }
}

socket.on('state', (s) => {
  // new question → reset
  if (lastQuestionId !== s.questionId) {
    chosenIndex = null;
    lastQuestionId = s.questionId;
  }

  qEl.textContent = s.question || '—';
  statusEl.textContent =
    `Q${s.questionId} • ${s.phase.toUpperCase()} • ${s.secondsLeft}s`;

  renderChoices(s.options, s.locked, s.phase, s.correctIndex, s.secondsLeft);
});
