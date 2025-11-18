const params2 = new URLSearchParams(location.search);
const adminKey2 = params2.get('key') || '';
const socket = io({ auth: { adminKey: adminKey2 } });

let manualEditing = false;

let quizData = null;               // full JSON payload
let tableIndex = 0;                // active table
let roundIndex = 0;                // active round inside table
let questionIndex = 0;             // active question inside round

const $ = (s) => document.querySelector(s);

const q = $('#question');
const o0 = $('#o0'), o1 = $('#o1'), o2 = $('#o2'), o3 = $('#o3');
const correct = $('#correct');
const seconds = $('#seconds');

const applyBtn = $('#apply');
const nextBtn = $('#next');
const prevBtn = $('#prev');
const resetBtn = $('#reset');

const startBtn = $('#start');
const lockBtn = $('#lock');
const unlockBtn = $('#unlock');
const revealBtn = $('#reveal');
const refreshBtn = $('#refresh');
const copyBtn = $('#copy-vote-url');

const liveStatus = $('#liveStatus');

const roundSelect = document.getElementById('roundSelect');
const questionSelect = document.getElementById('questionSelect');

const quizSelect = document.getElementById('quizSelect');

const addQuizBtn = document.getElementById('addQuizBtn');
const quizModal = document.getElementById('quizModal');
const newQuizTitle = document.getElementById('newQuizTitle');
const cancelAdd = document.getElementById('cancelAdd');
const saveQuiz = document.getElementById('saveQuiz');

function loadQuizList() {
  fetch('/qapi/quizzes')
    .then(r => r.json())
    .then(data => {
      quizData = data; // { roundTypes, tables }

      if (!quizData.tables || !Array.isArray(quizData.tables) || quizData.tables.length === 0) {
        console.error("No tables in quiz data");
        return;
      }

      // dropdown of tables
      quizSelect.innerHTML = quizData.tables.map((table, i) => {
        const totalQuestions = table.rounds?.reduce(
          (sum, round) => sum + (round.questions?.length || 0),
          0
        ) || 0;

        return `<option value="${i}">${table.title} (${totalQuestions})</option>`;
      }).join('');

      quizSelect.value = tableIndex;

      // NEW: fill round + question dropdowns
      populateRoundSelect();
      populateQuestionSelect();

      // show first question
      renderEditor();

      // optional: notify server which table index is active
      // if your server expects quizId (not index) you may remove this:
      // socket.emit('admin:command', 'switch', { quizId: quizSelect.value });
    })
    .catch(err => console.error("Failed to refresh quiz list", err));
}

// Initial load
loadQuizList();

// Render editor UI based on current table/round/question
function renderEditor() {
  manualEditing = true;
  if (!quizData || !quizData.tables) return;

  const table = quizData.tables[tableIndex];
  const round = table.rounds[roundIndex];
  const qData = round.questions[questionIndex];

  liveStatus.textContent =
    `${table.title} • Round: ${round.roundType.toUpperCase()} • Q${questionIndex + 1}`;

  // Shared
  q.value = qData.question || '';
  seconds.value = qData.seconds || 15;

  if (round.roundType === 'multiple_choice') {
    document.querySelectorAll('.mcq').forEach(e => e.style.display = 'block');
    document.querySelectorAll('.non-mcq').forEach(e => e.style.display = 'none');

    o0.value = qData.options?.[0] || '';
    o1.value = qData.options?.[1] || '';
    o2.value = qData.options?.[2] || '';
    o3.value = qData.options?.[3] || '';
    correct.value = Number.isInteger(qData.correctIndex) ? qData.correctIndex : '';

  } else {
    document.querySelectorAll('.mcq').forEach(e => e.style.display = 'none');
    document.querySelectorAll('.non-mcq').forEach(e => e.style.display = 'block');

    const answerEl = document.getElementById('answer');
    const mediaEl = document.getElementById('mediaUrl');
    if (answerEl) answerEl.value = qData.correctAnswer || '';
    if (mediaEl) mediaEl.value = qData.mediaUrl || '';
  }
}
function populateRoundSelect() {
  if (!quizData || !quizData.tables) return;
  const table = quizData.tables[tableIndex];

  roundSelect.innerHTML = table.rounds.map((round, i) => {
    const qCount = round.questions?.length || 0;
    return `<option value="${i}">Round ${i + 1} – ${round.roundType} (${qCount})</option>`;
  }).join('');

  roundSelect.value = roundIndex;
}

function populateQuestionSelect() {
  if (!quizData || !quizData.tables) return;
  const table = quizData.tables[tableIndex];
  const round = table.rounds[roundIndex];

  questionSelect.innerHTML = round.questions.map((q, i) => {
    return `<option value="${i}">Q${i + 1}</option>`;
  }).join('');

  questionSelect.value = questionIndex;
}

function fillEditorFromState(s) {
  q.value = s.question || '';
  o0.value = s.options?.[0] || '';
  o1.value = s.options?.[1] || '';
  o2.value = s.options?.[2] || '';
  o3.value = s.options?.[3] || '';
  correct.value = Number.isInteger(s.correctIndex) ? s.correctIndex : '';
  seconds.value = s.secondsTotal || 15;
}

socket.on('state', (s) => {
  liveStatus.textContent = `Q${s.questionId} • ${s.phase.toUpperCase()} • ${s.locked ? 'LOCKED' : 'UNLOCKED'} • ${s.secondsLeft}s • Votes: ${s.votes.reduce((a, b) => a + b, 0)}`;

  if (!manualEditing) {
    fillEditorFromState(s);
  }
});

applyBtn.onclick = () => {
  manualEditing = false;
  socket.emit('admin:update', {
    question: q.value.trim(),
    options: [o0.value, o1.value, o2.value, o3.value],
    correctIndex: correct.value === '' ? null : Number(correct.value),
    secondsTotal: Number(seconds.value || 15)
  });
};

nextBtn.onclick = () => {
  manualEditing = true;
  socket.emit('admin:command', 'next');
};

prevBtn.onclick = () => {
  manualEditing = true;
  socket.emit('admin:command', 'prev');
};

resetBtn.onclick = () => {
  if (confirm('Reset the entire quiz?')) socket.emit('admin:command', 'reset');
};

startBtn.onclick = () => socket.emit('admin:command', 'start');
lockBtn.onclick = () => socket.emit('admin:command', 'lock');
unlockBtn.onclick = () => socket.emit('admin:command', 'unlock');
revealBtn.onclick = () => socket.emit('admin:command', 'reveal');
refreshBtn.onclick = () => socket.emit('admin:command', 'noop');

copyBtn.onclick = async () => {
  const url = `${location.origin.replace(/\/control.*/, '')}/vote`;
  await navigator.clipboard.writeText(url);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => copyBtn.textContent = 'Copy Vote URL', 1200);
};

fetch('/qapi/quizzes').then(r => r.json()).then(list => {
  quizSelect.innerHTML = list.map(q =>
    `<option value="${q.id}">${q.title} (${q.total})</option>`
  ).join('');
  quizSelect.value = list[0]?.id;
});

quizSelect.onchange = () => {
  manualEditing = true;
  // Clear old editor fields
  q.value = o0.value = o1.value = o2.value = o3.value = '';
  correct.value = '';
  seconds.value = 15;
  liveStatus.textContent = 'Loading new quiz...';

  // Request server to switch quiz
  socket.emit('admin:command', 'switch', { quizId: quizSelect.value });

  // Force refresh after short delay (server will broadcast new state)
  setTimeout(() => {
    // When the new state arrives, fillEditorFromState will populate it
    // But just in case the server broadcast is slightly delayed:
    socket.emit('admin:command', 'noop');
  }, 300);

  tableIndex = Number(quizSelect.value);
  roundIndex = 0;
  questionIndex = 0;

  populateRoundSelect();
  populateQuestionSelect();
  renderEditor();
};

addQuizBtn.onclick = () => {
  newQuizTitle.value = '';
  quizModal.style.display = 'flex';
  newQuizTitle.focus();
};

cancelAdd.onclick = () => quizModal.style.display = 'none';

saveQuiz.onclick = async () => {
  const title = newQuizTitle.value.trim();
  const question = newQuestion.value.trim();
  const options = [
    newO0.value.trim(),
    newO1.value.trim(),
    newO2.value.trim(),
    newO3.value.trim()
  ];
  const correctIndex = newCorrect.value === '' ? null : Number(newCorrect.value);
  const secondsTotal = Number(newSeconds.value || 15);

  if (!title) return alert('Please enter a quiz title');
  if (!question) return alert('Please enter a question');
  if (options.some(o => !o)) return alert('All options are required');

  const res = await fetch('/qapi/quizzes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, question, options, correctIndex, secondsTotal })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to add quiz');
    return;
  }

  quizModal.style.display = 'none';
  alert(`Quiz "${title}" created successfully!`);
  loadQuizList();
};

// Hotkeys
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') socket.emit('admin:command', 'reveal');
  if (e.key.toLowerCase() === 'n') socket.emit('admin:command', 'next');
  if (e.key.toLowerCase() === 's') socket.emit('admin:command', 'start');
  if (e.key.toLowerCase() === 'l') socket.emit('admin:command', 'lock');
  if (e.key.toLowerCase() === 'u') socket.emit('admin:command', 'unlock');
  if (e.key.toLowerCase() === 'p') socket.emit('admin:command', 'prev');
});
