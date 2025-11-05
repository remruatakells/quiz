// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');

const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const MASTER_API_KEY = process.env.MASTER_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Verify API key using external Zo Stream API
async function verifyApiKey(key) {
  try {
    const response = await fetch(`https://apis.zostream.in/api/quiz/verify?api_key=${encodeURIComponent(key)}`, {

      headers: { 'X-Master-Key': MASTER_API_KEY },
    });
    const data = await response.json();
    return data.status === 'ok';
  } catch (err) {
    console.error('API key check failed:', err);
    return false;
  }
}

// ✅ Homepage route
app.get('/', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// ✅ Secure routes (check API key before serving pages)
app.get('/control/:key', async (req, res) => {
  const valid = await verifyApiKey(req.params.key);
  if (!valid)
    return res
      .status(403)
      .send('<h1>403 Forbidden</h1><p>Invalid API key</p>');
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

app.get('/overlay/:key', async (req, res) => {
  const valid = await verifyApiKey(req.params.key);
  if (!valid)
    return res
      .status(403)
      .send('<h1>403 Forbidden</h1><p>Invalid API key</p>');
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get('/vote/:key', async (req, res) => {
  const valid = await verifyApiKey(req.params.key);
  if (!valid)
    return res
      .status(403)
      .send('<h1>403 Forbidden</h1><p>Invalid API key</p>');
  res.sendFile(path.join(__dirname, 'public', 'vote.html'));
});

// ✅ Public API endpoint for verifying key from frontend
app.get('/check-key/:key', async (req, res) => {
  const key = req.params.key;
  const valid = await verifyApiKey(key);
  if (valid) return res.json({ status: 'ok', user: { name: 'Authorized User' } });
  res.json({ status: 'error', message: 'Invalid key' });
});

// ✅ Quiz data
const quizzes = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data/quizzes.json'), 'utf8')
);
let activeQuizId = quizzes[0]?.id;
let currentIndex = 0;

// ✅ Quiz state
let state = {
  questionId: 1,
  question: 'What is the capital of France?',
  options: ['Paris', 'Berlin', 'Madrid', 'Rome'],
  correctIndex: 0,
  phase: 'idle',
  locked: false,
  secondsTotal: 15,
  secondsLeft: 15,
  votes: [0, 0, 0, 0],
};

const voters = new Map();
function broadcast() {
  io.emit('state', state);
}
function resetVotes() {
  state.votes = [0, 0, 0, 0];
  voters.clear();
}

// ✅ Quiz helpers
function loadQuestion(quizId, index) {
  const quiz = quizzes.find((q) => q.id === quizId);
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
  const quiz = quizzes.find((q) => q.id === activeQuizId);
  if (!quiz) return;
  currentIndex++;
  if (currentIndex >= quiz.questions.length) currentIndex = 0;
  const newQ = loadQuestion(activeQuizId, currentIndex);
  if (newQ) state = newQ;
  broadcast();
}

// ✅ Timer
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

// ✅ Socket.IO connections
io.on('connection', (socket) => {
  const isAdmin = ADMIN_KEY
    ? socket.handshake.auth?.adminKey === ADMIN_KEY
    : true;

  socket.emit('state', state);

  socket.on('vote', (index) => {
    if (typeof index !== 'number' || state.locked || state.phase !== 'running')
      return;
    if (index < 0 || index > 3) return;

    const prev = voters.get(socket.id);
    if (prev && prev.questionId === state.questionId) return;

    state.votes[index] += 1;
    voters.set(socket.id, { questionId: state.questionId, choice: index });
    broadcast();
  });

  socket.on('admin:update', (payload = {}) => {
    if (!isAdmin) return;
    const { question, options, correctIndex, secondsTotal } = payload;
    if (typeof question === 'string') state.question = question;
    if (Array.isArray(options) && options.length === 4)
      state.options = options.map((s) => String(s ?? ''));
    if (Number.isInteger(correctIndex)) state.correctIndex = correctIndex;
    if (Number.isInteger(secondsTotal)) {
      state.secondsTotal = secondsTotal;
      state.secondsLeft = secondsTotal;
    }
    broadcast();
  });

  socket.on('admin:command', (cmd, payload) => {
    if (!isAdmin) return;
    switch (cmd) {
      case 'start':
        startTimer();
        break;
      case 'lock':
        state.locked = true;
        broadcast();
        break;
      case 'unlock':
        state.locked = false;
        broadcast();
        break;
      case 'reveal':
        state.phase = 'reveal';
        stopTimer();
        broadcast();
        break;
      case 'next':
        nextQuestion();
        break;
      case 'reset':
        state = loadQuestion(activeQuizId, 0);
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
  console.log(`✅ Quiz server running on: http://localhost:${PORT}`);
  console.log(`Overlay:  /overlay/:api_key`);
  console.log(`Control:  /control/:api_key`);
  console.log(`Vote:     /vote/:api_key`);
});
