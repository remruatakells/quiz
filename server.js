require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');

// Fetch compatible for any Node version + PM2
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const MASTER_API_KEY = process.env.MASTER_API_KEY;

// Load quiz data
const dataPath = path.join(__dirname, 'data', 'quizzes.json');
const quizzes = fs.existsSync(dataPath)
  ? JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  : [];

let activeQuizId = quizzes[0]?.id || null;
let currentIndex = 0;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Verify ZoStream Key
async function verifyApiKey(key) {
  try {
    if (!key) return false;
    const url = `https://apis.zostream.in/api/quiz/verify?api_key=${encodeURIComponent(key)}`;
    const response = await fetch(url);
    if (!response.ok) return false;
    const data = await response.json();
    return data.status?.toLowerCase() === 'ok';
  } catch (err) {
    console.error('API key check failed:', err);
    return false;
  }
}

// Fix qapi route rewriting for nested pages
app.use((req, _res, next) => {
  const m = req.path.match(/\/(control|overlay|vote)\/[^/]+\/qapi(\/.*)?$/);
  if (m) req.url = req.url.replace(/\/(control|overlay|vote)\/[^/]+\/qapi/, '/qapi');
  next();
});

// Homepage
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Secure frontend pages
async function serveSecurePage(file, req, res) {
  const key = req.params.key;
  const valid = await verifyApiKey(key);
  if (!valid)
    return res.status(403).send('<h1>403 Forbidden</h1><p>Invalid API key</p>');
  res.sendFile(path.resolve(`./public/${file}`));
}

app.get('/control/:key', (req, res) => serveSecurePage('control.html', req, res));
app.get('/overlay/:key', (req, res) => serveSecurePage('overlay.html', req, res));
app.get('/vote/:key', (req, res) => serveSecurePage('vote.html', req, res));

// Public check key endpoint
app.get('/check-key/:key', async (req, res) => {
  const valid = await verifyApiKey(req.params.key);
  if (valid) return res.json({ status: 'ok', user: { name: 'Authorized User' } });
  res.json({ status: 'error', message: 'Invalid key' });
});

// ========== QUIZ API ==========
app.get('/qapi/quizzes', (_req, res) => {
  res.json(quizzes.map(q => ({
    id: q.id,
    title: q.title,
    total: q.questions.length
  })));
});

app.post('/qapi/quizzes', (req, res) => {
  const { title, question, options, correctIndex, secondsTotal } = req.body;

  if (!title) return res.status(400).json({ error: 'Title required' });
  if (!question) return res.status(400).json({ error: 'Question required' });
  if (!Array.isArray(options) || options.length !== 4)
    return res.status(400).json({ error: 'Exactly 4 options required' });

  const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (quizzes.find(q => q.id === id))
    return res.status(409).json({ error: 'Quiz already exists' });

  const newQuiz = {
    id,
    title,
    questions: [
      {
        question,
        options,
        correctIndex: Number.isInteger(correctIndex) ? correctIndex : null,
        secondsTotal: Number.isInteger(secondsTotal) ? secondsTotal : 15,
      },
    ],
  };

  quizzes.push(newQuiz);
  fs.writeFileSync(dataPath, JSON.stringify(quizzes, null, 2));
  res.json({ ok: true, quiz: newQuiz });
});

// ========== STATE & TIMER ==========
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

// Initial state
let state = quizzes.length ? loadQuestion(activeQuizId, 0) : {
  questionId: 1,
  question: 'Sample Question',
  options: ['A', 'B', 'C', 'D'],
  correctIndex: null,
  phase: 'idle',
  locked: false,
  secondsTotal: 15,
  secondsLeft: 15,
  votes: [0, 0, 0, 0]
};

const voters = new Map();
function broadcast() { io.emit('state', state); }
function resetVotes() { state.votes = [0, 0, 0, 0]; voters.clear(); }

function prevQuestion() {
  const quiz = quizzes.find(q => q.id === activeQuizId);
  if (!quiz) return;

  currentIndex--;
  if (currentIndex < 0) currentIndex = quiz.questions.length - 1;

  const newQ = loadQuestion(activeQuizId, currentIndex);
  if (newQ) {
    state = newQ;
    state.phase = 'idle';
    state.locked = false;
    resetVotes();
    broadcast();
  }
}

function nextQuestion() {
  const quiz = quizzes.find(q => q.id === activeQuizId);
  if (!quiz) return;

  currentIndex++;
  if (currentIndex >= quiz.questions.length) currentIndex = 0;

  const newQ = loadQuestion(activeQuizId, currentIndex);
  if (newQ) {
    state = newQ;
    state.phase = 'idle';
    state.locked = false;
    resetVotes();
    broadcast();
  }
}

// ========== TIMER ==========
let ticker = null;
function startTimer() {
  stopTimer();
  state.phase = 'running';
  state.locked = false;
  broadcast();
  ticker = setInterval(() => {
    if (state.secondsLeft > 0 && state.phase === 'running') {
      state.secondsLeft--;
      broadcast();
      if (state.secondsLeft <= 0) {
        state.phase = 'reveal';
        state.locked = true;
        stopTimer();
        broadcast();
      }
    }
  }, 1000);
}
function stopTimer() { if (ticker) clearInterval(ticker), ticker = null; }

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  const isAdmin = ADMIN_KEY ? socket.handshake.auth?.adminKey === ADMIN_KEY : true;

  socket.emit('state', state);

  socket.on('vote', (i) => {
    if (typeof i !== 'number' || state.phase !== 'running' || state.locked) return;
    if (i < 0 || i > 3) return;
    const prev = voters.get(socket.id);
    if (prev && prev.questionId === state.questionId) return;
    state.votes[i]++;
    voters.set(socket.id, { questionId: state.questionId, choice: i });
    broadcast();
  });

  socket.on('admin:update', (payload = {}) => {
    if (!isAdmin) return;
    const { question, options, correctIndex, secondsTotal } = payload;
    if (typeof question === 'string') state.question = question;
    if (Array.isArray(options) && options.length === 4)
      state.options = options.map(s => String(s || ''));
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
      case 'start': startTimer(); break;
      case 'lock': state.locked = true; broadcast(); break;
      case 'unlock': state.locked = false; broadcast(); break;
      case 'reveal': state.phase = 'reveal'; stopTimer(); broadcast(); break;
      case 'next':
        nextQuestion();
        break;

      case 'prev':
        prevQuestion();
        break;

      case 'reset':
        currentIndex = 0;
        state = loadQuestion(activeQuizId, 0);
        resetVotes();
        broadcast();
        break;

      case 'switch':
        if (!payload || !payload.quizId) return;
        if (!quizzes.find(q => q.id === payload.quizId)) return;
        activeQuizId = payload.quizId;
        currentIndex = 0;
        state = loadQuestion(activeQuizId, 0);
        resetVotes();
        broadcast();
        break;

      case 'noop':
        broadcast();
        break;
    }
  });

  socket.on('disconnect', () => voters.delete(socket.id));
});

server.listen(PORT, () => {
  console.log(`🚀 Server running: http://localhost:${PORT}`);
  console.log(`🔗 Control: /control/:api_key`);
  console.log(`🔗 Overlay: /overlay/:api_key`);
  console.log(`🔗 Vote:    /vote/:api_key`);
});
