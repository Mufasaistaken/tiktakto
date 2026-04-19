const socket = typeof window.io === 'function' ? window.io() : null;

const cells = Array.from(document.querySelectorAll('.cell'));
const welcomeScreen = document.getElementById('welcomeScreen');
const gameScreen = document.getElementById('gameScreen');
const modeDetails = document.getElementById('modeDetails');
const localDetails = document.getElementById('localDetails');
const remoteDetails = document.getElementById('remoteDetails');
const setupStatus = document.getElementById('setupStatus');
const statusText = document.getElementById('statusText');
const roomMeta = document.getElementById('roomMeta');
const remoteRoleStep = document.getElementById('remoteRoleStep');
const initiatorPanel = document.getElementById('initiatorPanel');
const joinerPanel = document.getElementById('joinerPanel');
const generatedKeyRow = document.getElementById('generatedKeyRow');
const generatedKeyText = document.getElementById('generatedKeyText');
const sameDeviceBtn = document.getElementById('sameDeviceBtn');
const separateDevicesBtn = document.getElementById('separateDevicesBtn');
const startLocalBtn = document.getElementById('startLocalBtn');
const initiatorBtn = document.getElementById('initiatorBtn');
const joinerBtn = document.getElementById('joinerBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const copyRoomBtn = document.getElementById('copyRoomBtn');
const startRemoteBtn = document.getElementById('startRemoteBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const newRoundBtn = document.getElementById('newRoundBtn');
const resetScoreBtn = document.getElementById('resetScoreBtn');
const forfeitBtn = document.getElementById('forfeitBtn');
const backToSetupBtn = document.getElementById('backToSetupBtn');
const scoreXEl = document.getElementById('scoreX');
const scoreOEl = document.getElementById('scoreO');
const scoreDrawEl = document.getElementById('scoreDraw');

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

const state = {
  mode: null,
  role: null,
  setupStep: 'choose_mode',
  roomCode: null,
  mark: null,
  remoteGame: null,
  localGame: null,
  showGame: false
};

function createFreshGame(active) {
  return {
    board: Array(9).fill(''),
    turn: 'X',
    active,
    scores: { X: 0, O: 0, D: 0 },
    winner: null,
    winningLine: []
  };
}

function currentGame() {
  if (state.mode === 'local') {
    return state.localGame;
  }
  if (state.mode === 'remote') {
    return state.remoteGame;
  }
  return null;
}

function getLocalWinner(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

function setSetupStatus(text) {
  setupStatus.textContent = text;
}

function setSetupStep(step) {
  state.setupStep = step;
  remoteRoleStep.classList.toggle('hidden', step !== 'choose_remote_role');
  initiatorPanel.classList.toggle('hidden', step !== 'initiator');
  joinerPanel.classList.toggle('hidden', step !== 'joiner');
}

function leaveRemoteRoom() {
  if (!socket) {
    return;
  }
  socket.emit('leave_room');
}

function clearRemoteState({ leaveRoom } = { leaveRoom: false }) {
  if (leaveRoom) {
    leaveRemoteRoom();
  }
  state.role = null;
  state.roomCode = null;
  state.mark = null;
  state.remoteGame = null;
  roomCodeInput.value = '';
  setSetupStep('choose_remote_role');
}

function selectMode(mode) {
  if (state.mode === 'remote' && mode !== 'remote') {
    clearRemoteState({ leaveRoom: true });
  }

  state.mode = mode;
  state.showGame = false;

  if (mode === 'local') {
    state.role = null;
    state.localGame = null;
    setSetupStatus('Local mode selected. Press Start Game when ready.');
  } else {
    state.localGame = null;
    clearRemoteState({ leaveRoom: false });
    setSetupStatus('Separate devices selected. Choose if you are the initiator.');
  }

  render();
}

function resetAllToWelcome(options = {}) {
  const leaveRemote = options.leaveRemote ?? true;
  const setupMessage = options.setupMessage ?? 'Waiting for selection';

  if (state.mode === 'remote') {
    clearRemoteState({ leaveRoom: leaveRemote });
  }

  state.mode = null;
  state.role = null;
  state.localGame = null;
  state.showGame = false;
  setSetupStep('choose_mode');
  setSetupStatus(setupMessage);
  render();
}

function canPlayCell(index) {
  const game = currentGame();
  if (!game || !game.active || game.winner || game.board[index]) {
    return false;
  }

  if (state.mode === 'local') {
    return true;
  }

  return Boolean(state.mark && game.turn === state.mark);
}

function applyLocalMove(index) {
  const game = state.localGame;
  if (!game || !canPlayCell(index)) {
    return;
  }

  game.board[index] = game.turn;
  const result = getLocalWinner(game.board);

  if (result) {
    game.winner = result.winner;
    game.winningLine = result.line;
    game.scores[result.winner] += 1;
    render();
    return;
  }

  if (game.board.every(Boolean)) {
    game.scores.D += 1;
    render();
    return;
  }

  game.turn = game.turn === 'X' ? 'O' : 'X';
  render();
}

function resetLocalRound() {
  if (!state.localGame) {
    return;
  }

  state.localGame.board = Array(9).fill('');
  state.localGame.turn = 'X';
  state.localGame.winner = null;
  state.localGame.winningLine = [];
  state.localGame.active = true;
}

function resetLocalScore() {
  state.localGame = createFreshGame(true);
}

function renderScreens() {
  welcomeScreen.classList.toggle('hidden', state.showGame);
  gameScreen.classList.toggle('hidden', !state.showGame);
}

function renderSetupPanels() {
  const hasMode = Boolean(state.mode);
  modeDetails.classList.toggle('hidden', !hasMode);

  localDetails.classList.toggle('hidden', state.mode !== 'local');
  remoteDetails.classList.toggle('hidden', state.mode !== 'remote');
  const hasGeneratedKey = Boolean(state.mode === 'remote' && state.role === 'initiator' && state.roomCode);
  generatedKeyRow.classList.toggle('hidden', !hasGeneratedKey);
  startRemoteBtn.disabled = !hasGeneratedKey;
  if (hasGeneratedKey) {
    generatedKeyText.textContent = `Room key: ${state.roomCode}`;
  } else {
    generatedKeyText.textContent = 'Room key:';
  }
}

function renderSelectionState() {
  sameDeviceBtn.classList.toggle('is-selected', state.mode === 'local');
  separateDevicesBtn.classList.toggle('is-selected', state.mode === 'remote');
  initiatorBtn.classList.toggle('is-selected', state.role === 'initiator');
  joinerBtn.classList.toggle('is-selected', state.role === 'joiner');
}

function renderBoard() {
  const game = currentGame();

  if (!game) {
    for (const cell of cells) {
      cell.textContent = '';
      cell.classList.remove('x', 'o', 'win');
      cell.disabled = true;
    }
    return;
  }

  for (const cell of cells) {
    const index = Number(cell.dataset.index);
    const value = game.board[index];
    // Use textContent intentionally to avoid HTML injection in board rendering.
    cell.textContent = value;
    cell.classList.remove('x', 'o', 'win');

    if (value === 'X') {
      cell.classList.add('x');
    } else if (value === 'O') {
      cell.classList.add('o');
    }

    if (game.winningLine.includes(index)) {
      cell.classList.add('win');
    }

    cell.disabled = !canPlayCell(index);
  }
}

function renderScores() {
  const game = currentGame();
  if (!game) {
    scoreXEl.textContent = '0';
    scoreOEl.textContent = '0';
    scoreDrawEl.textContent = '0';
    return;
  }

  scoreXEl.textContent = String(game.scores.X);
  scoreOEl.textContent = String(game.scores.O);
  scoreDrawEl.textContent = String(game.scores.D);
}

function renderStatus() {
  const game = currentGame();

  if (state.mode === 'local') {
    roomMeta.textContent = 'Same device mode';

    if (!game) {
      statusText.textContent = 'Press Start Game on setup screen';
      return;
    }

    if (game.winner) {
      statusText.textContent = `Player ${game.winner} wins`;
      return;
    }

    if (game.board.every(Boolean)) {
      statusText.textContent = 'Draw game';
      return;
    }

    statusText.textContent = `Player ${game.turn} turn`;
    return;
  }

  if (state.mode === 'remote') {
    roomMeta.textContent = state.roomCode ? `Room ${state.roomCode} | You are ${state.mark}` : 'Not connected';

    if (!game) {
      statusText.textContent = 'Waiting for room state...';
      return;
    }

    if (!game.active) {
      statusText.textContent = 'Waiting for second player';
      return;
    }

    if (game.winner) {
      statusText.textContent = `Player ${game.winner} wins`;
      return;
    }

    if (game.board.every(Boolean)) {
      statusText.textContent = 'Draw game';
      return;
    }

    statusText.textContent = game.turn === state.mark ? `Your turn (${state.mark})` : `Opponent turn (${game.turn})`;
    return;
  }

  roomMeta.textContent = 'Not connected';
  statusText.textContent = 'Choose mode from setup';
}

function renderControls() {
  if (state.mode === 'local') {
    newRoundBtn.disabled = !state.localGame;
    resetScoreBtn.disabled = !state.localGame;
    return;
  }

  const enabled = Boolean(state.mode === 'remote' && state.remoteGame && state.remoteGame.active);
  newRoundBtn.disabled = !enabled;
  resetScoreBtn.disabled = !enabled;
}

function render() {
  renderScreens();
  renderSetupPanels();
  renderSelectionState();
  renderBoard();
  renderScores();
  renderStatus();
  renderControls();
}

sameDeviceBtn.addEventListener('click', () => {
  selectMode('local');
});

separateDevicesBtn.addEventListener('click', () => {
  selectMode('remote');
});

startLocalBtn.addEventListener('click', () => {
  if (state.mode !== 'local') {
    return;
  }
  state.localGame = createFreshGame(true);
  state.showGame = true;
  render();
});

initiatorBtn.addEventListener('click', () => {
  if (state.mode !== 'remote') {
    return;
  }
  state.role = 'initiator';
  setSetupStep('initiator');
  setSetupStatus('Generate a room key, then share it with player two.');
  render();
});

joinerBtn.addEventListener('click', () => {
  if (state.mode !== 'remote') {
    return;
  }
  state.role = 'joiner';
  setSetupStep('joiner');
  setSetupStatus('Enter the room key from player one.');
  render();
});

createRoomBtn.addEventListener('click', () => {
  if (state.mode !== 'remote' || state.role !== 'initiator') {
    return;
  }

  if (!socket) {
    setSetupStatus('Server connection unavailable. Start the server first.');
    return;
  }

  socket.emit('create_room');
  setSetupStatus('Creating room...');
});

copyRoomBtn.addEventListener('click', async () => {
  if (!state.roomCode) {
    setSetupStatus('Generate a room key first.');
    return;
  }

  try {
    await navigator.clipboard.writeText(state.roomCode);
    setSetupStatus(`Room key ${state.roomCode} copied.`);
  } catch {
    setSetupStatus(`Room key: ${state.roomCode}`);
  }
});

startRemoteBtn.addEventListener('click', () => {
  if (state.mode !== 'remote' || state.role !== 'initiator') {
    return;
  }
  if (!state.roomCode) {
    setSetupStatus('Generate a room key first.');
    return;
  }

  state.showGame = true;
  render();
});

joinRoomBtn.addEventListener('click', () => {
  if (state.mode !== 'remote' || state.role !== 'joiner') {
    return;
  }

  if (!socket) {
    setSetupStatus('Server connection unavailable. Start the server first.');
    return;
  }

  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(roomCode)) {
    setSetupStatus('Room key must be 8 alphanumeric characters (A-Z, 0-9).');
    return;
  }
  socket.emit('join_room', { roomCode });
  setSetupStatus('Joining room...');
});

roomCodeInput.addEventListener('input', () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
});

for (const cell of cells) {
  cell.addEventListener('click', () => {
    const index = Number(cell.dataset.index);
    if (!canPlayCell(index)) {
      return;
    }

    if (state.mode === 'local') {
      applyLocalMove(index);
      return;
    }

    if (!socket) {
      statusText.textContent = 'Server connection unavailable. Start the server first.';
      return;
    }

    socket.emit('make_move', { index });
  });
}

newRoundBtn.addEventListener('click', () => {
  if (state.mode === 'local') {
    resetLocalRound();
    render();
    return;
  }

  if (state.mode === 'remote') {
    if (!socket) {
      statusText.textContent = 'Server connection unavailable. Start the server first.';
      return;
    }
    socket.emit('new_round');
  }
});

resetScoreBtn.addEventListener('click', () => {
  if (state.mode === 'local') {
    resetLocalScore();
    render();
    return;
  }

  if (state.mode === 'remote') {
    if (!socket) {
      statusText.textContent = 'Server connection unavailable. Start the server first.';
      return;
    }
    socket.emit('reset_score');
  }
});

forfeitBtn.addEventListener('click', () => {
  if (state.mode === 'remote' && socket && state.roomCode) {
    socket.emit('forfeit_game');
    resetAllToWelcome({
      leaveRemote: false,
      setupMessage: 'You forfeited the current game.'
    });
    return;
  }

  resetAllToWelcome({
    setupMessage: 'You forfeited the current game.'
  });
});

backToSetupBtn.addEventListener('click', () => {
  resetAllToWelcome();
});

if (socket) {
  socket.on('connect', () => {
    if (state.mode !== 'remote') {
      return;
    }

    // Best-effort reconnect path for non-initiators after transient network loss.
    if (state.roomCode && state.role === 'joiner') {
      socket.emit('join_room', { roomCode: state.roomCode });
      setSetupStatus('Reconnected. Attempting to rejoin room...');
      return;
    }

    if (state.roomCode && state.role === 'initiator') {
      resetAllToWelcome({
        leaveRemote: false,
        setupMessage: 'Connection reset. Initiator session must be recreated.'
      });
    }
  });

  socket.on('disconnect', () => {
    if (state.mode === 'remote') {
      setSetupStatus('Disconnected from server. Reconnecting...');
      statusText.textContent = 'Disconnected from server. Reconnecting...';
    }
  });

  socket.on('room_joined', ({ roomCode, mark }) => {
    if (state.mode !== 'remote') {
      return;
    }

    state.roomCode = roomCode;
    state.mark = mark;
    if (mark === 'X') {
      state.showGame = false;
      state.role = 'initiator';
      setSetupStep('initiator');
      setSetupStatus(`Room key: ${roomCode}. Share it, then press Start Game.`);
    } else {
      state.showGame = true;
      state.role = 'joiner';
      setSetupStatus(`Connected to room ${roomCode}.`);
    }
    render();
  });

  socket.on('player_ready', () => {
    if (state.mode === 'remote') {
      statusText.textContent = 'Both players connected. Starting round...';
    }
  });

  socket.on('state_update', (gameState) => {
    if (state.mode !== 'remote') {
      return;
    }

    state.remoteGame = gameState;
    if (state.mark === 'O' || (state.mark === 'X' && gameState.active)) {
      state.showGame = true;
    }
    render();
  });

  socket.on('player_left', () => {
    if (state.mode === 'remote') {
      statusText.textContent = 'Other player disconnected. Waiting...';
    }
  });

  socket.on('forfeit_notice', ({ winner }) => {
    if (state.mode === 'remote') {
      statusText.textContent = `Player ${winner} wins by forfeit`;
    }
  });

  socket.on('session_ended', ({ message }) => {
    if (state.mode === 'remote') {
      resetAllToWelcome({
        leaveRemote: false,
        setupMessage: message || 'Session ended.'
      });
    }
  });

  socket.on('action_error', ({ message }) => {
    if (state.mode === 'remote') {
      setSetupStatus(message);
      statusText.textContent = message;
    }
  });

  socket.on('connect_error', () => {
    if (state.mode === 'remote') {
      setSetupStatus('Connection failed. Check server/network and try again.');
      statusText.textContent = 'Connection failed. Check server/network and try again.';
    }
  });
}

setSetupStep('choose_mode');
setSetupStatus('Waiting for selection');
render();
