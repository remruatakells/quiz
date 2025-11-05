// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuid } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // optional simple auth

const quizzes = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data/quizzes.json'), 'utf8')
);
let activeQuizId = quizzes[0]?.id;
let currentIndex = 0;

app.use(express.static('public'));
app.use(express.json());

app.use(express.static('public'));

// Pretty routes:
app.get('/overlay', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'))
);
app.get('/control', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'control.html'))
);
app.get('/vote', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'vote.html'))
);

app.get('/api/quizzes', (_req, res) => res.json(quizzes.map(q => ({
  id: q.id,
  title: q.title,
  total: q.questions.length
}))));

// Create new quiz
app.post('/api/quizzes', (req, res) => {
  const { title, question, options, correctIndex, secondsTotal } = req.body;

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question is required' });
  }
  if (!Array.isArray(options) || options.length !== 4) {
    return res.status(400).json({ error: 'Exactly 4 options are required' });
  }

  const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (quizzes.find(q => q.id === id)) {
    return res.status(409).json({ error: 'Quiz already exists' });
  }

  const newQuiz = {
    id,
    title,
    questions: [
      {
        question,
        options,
        correctIndex: Number.isInteger(correctIndex) ? correctIndex : null,
        secondsTotal: Number.isInteger(secondsTotal) ? secondsTotal : 15
      }
    ]
  };

  quizzes.push(newQuiz);

  fs.writeFileSync(
    path.join(__dirname, 'data/quizzes.json'),
    JSON.stringify(quizzes, null, 2),
    'utf8'
  );

  res.json({ ok: true, quiz: newQuiz });
});

/** Quiz phases:
 * idle     -> waiting to start
 * running  -> timer counting, users can vote (unless locked=true)
 * reveal   -> correct answer shown, voting closed
 */
let state = {
  questionId: 1,
  question: 'What is the capital of France?',
  options: ['Paris', 'Berlin', 'Madrid', 'Rome'],
  correctIndex: 0,         // 0..3 or null
  phase: 'idle',           // 'idle' | 'running' | 'reveal'
  locked: false,           // true -> votes blocked (during running)
  secondsTotal: 15,
  secondsLeft: 15,
  votes: [0, 0, 0, 0],     // tallies
};

const voters = new Map();   // socketId -> { questionId, choice }

/** Helpers */
function broadcast() { io.emit('state', state); }
function resetVotes() { state.votes = [0, 0, 0, 0]; voters.clear(); }
function toPercentages(v) {
  const total = v.reduce((a, b) => a + b, 0) || 1;
  return v.map(x => Math.round((x / total) * 100));
}
function nextQuestion({ keepQuestion = false } = {}) {
  if (!keepQuestion) {
    state.questionId += 1;
    state.question = '';
    state.options = ['', '', '', ''];
    state.correctIndex = null;
  }
  state.phase = 'idle';
  state.locked = false;
  state.secondsLeft = state.secondsTotal;
  resetVotes();
}

let ticker = null;
function startTimer() {
  stopTimer();
  state.phase = 'running';
  state.locked = false;
  broadcast();
  ticker = setInterval(() => {
    if (state.secondsLeft > 0 && state.phase === 'running') {
      state.secondsLeft -= 1;
      broadcast();
      if (state.secondsLeft <= 0) {
        state.locked = true;
        state.phase = 'reveal';
        stopTimer();
        broadcast();
      }
    }
  }, 1000);
}
function stopTimer() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

/** Socket.IO connections */
io.on('connection', (socket) => {
  const isAdmin = ADMIN_KEY
    ? socket.handshake.auth?.adminKey === ADMIN_KEY
    : true; // if no ADMIN_KEY, allow everyone as admin


  // Send state immediately
  socket.emit('state', state);

  // USERS: cast vote
  socket.on('vote', (index) => {
    if (typeof index !== 'number') return;
    if (index < 0 || index > 3) return;
    if (state.phase !== 'running') return;
    if (state.locked) return;

    const prev = voters.get(socket.id);
    // prevent re-voting on same question
    if (prev && prev.questionId === state.questionId) return;

    state.votes[index] += 1;
    voters.set(socket.id, { questionId: state.questionId, choice: index });
    broadcast();
  });

  // ADMIN: update content
  socket.on('admin:update', (payload = {}) => {
    if (!isAdmin) return;
    const {
      question, options, correctIndex, secondsTotal
    } = payload;

    if (typeof question === 'string') state.question = question;
    if (Array.isArray(options) && options.length === 4) {
      state.options = options.map(s => String(s ?? ''));
    }
    if (Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex <= 3) {
      state.correctIndex = correctIndex;
    } else if (correctIndex === null) {
      state.correctIndex = null;
    }
    if (Number.isInteger(secondsTotal) && secondsTotal >= 3 && secondsTotal <= 300) {
      state.secondsTotal = secondsTotal;
      state.secondsLeft = secondsTotal;
    }
    broadcast();
  });

  // ADMIN: commands
  // ADMIN: commands
  socket.on('admin:command', (cmd, payload) => {
    if (!isAdmin) return;

    switch (cmd) {
      case 'switch': {
        const qz = quizzes.find(q => q.id === payload?.quizId);
        if (qz) {
          activeQuizId = qz.id;
          currentIndex = 0;
          const first = loadQuestion(activeQuizId, 0);
          if (first) state = first;
          broadcast();
        }
        break;
      }

      case 'start':
        startTimer();
        break;

      case 'lock':
        if (state.phase === 'running') {
          state.locked = true;
          broadcast();
        }
        break;

      case 'unlock':
        if (state.phase === 'running') {
          state.locked = false;
          broadcast();
        }
        break;

      case 'reveal':
        state.phase = 'reveal';
        state.locked = true;
        stopTimer();
        broadcast();
        break;

      case 'next':
        nextQuestion();
        broadcast();
        break;

      case 'reset':
        state = {
          questionId: 1,
          question: '',
          options: ['', '', '', ''],
          correctIndex: null,
          phase: 'idle',
          locked: false,
          secondsTotal: 15,
          secondsLeft: 15,
          votes: [0, 0, 0, 0],
        };
        resetVotes();
        broadcast();
        break;

      default:
        break;
    }
  });

  socket.on('disconnect', () => {
    voters.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Quiz server running: http://localhost:${PORT}`);
  console.log(`Overlay:  http://localhost:${PORT}/overlay`);
  console.log(`Control:  http://localhost:${PORT}/control`);
  console.log(`Vote:     http://localhost:${PORT}/vote`);
});

function loadQuestion(quizId, index) {
  const quiz = quizzes.find(q => q.id === quizId);
  if (!quiz || !quiz.questions[index]) return null;
  const q = quiz.questions[index];
  return {
    questionId: index + 1,
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    phase: 'idle',
    locked: false,
    secondsTotal: q.secondsTotal || 15,
    secondsLeft: q.secondsTotal || 15,
    votes: [0, 0, 0, 0],
  };
}

function nextQuestion() {
  const quiz = quizzes.find(q => q.id === activeQuizId);
  if (!quiz) return;
  currentIndex++;
  if (currentIndex >= quiz.questions.length) currentIndex = 0; // loop
  const newQ = loadQuestion(activeQuizId, currentIndex);
  if (newQ) state = newQ;
  broadcast();
}
