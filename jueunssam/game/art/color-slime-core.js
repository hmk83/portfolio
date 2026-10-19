(function initColorSlimeCore(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ColorSlimeCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCore() {
  const BOARD_SIZE = 7;
  const DEFAULT_ROWS = 5;
  const DEFAULT_COLS = 7;
  const CELL_COUNT = DEFAULT_ROWS * DEFAULT_COLS;
  const STAGE_COUNT = 20;
  const TUTORIAL_STAGE = 1;
  const EMPTY = 0;
  const PLAYER = 1;
  const OPPONENT = 2;
  const TUTORIAL_BOARD_SIZE = { rows: 3, cols: 4 };
  const TUTORIAL_MOVES = [
    { from: 0, to: 1, player: PLAYER, distance: 1 },
    { from: 3, to: 2, player: OPPONENT, distance: 1 },
    { from: 11, to: 6, player: PLAYER, distance: 1 },
  ];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const toIndex = (row, col, size) => row * size.cols + col;
  const toPoint = (index, size) => ({
    row: Math.floor(index / size.cols),
    col: index % size.cols,
  });
  const inBounds = (row, col, size) => row >= 0 && row < size.rows && col >= 0 && col < size.cols;
  const otherPlayer = (player) => (player === PLAYER ? OPPONENT : PLAYER);

  function normalizeBoardSize(sizeInput) {
    const rows = clamp(Number(sizeInput && sizeInput.rows) || DEFAULT_ROWS, 3, 9);
    const cols = clamp(Number(sizeInput && sizeInput.cols) || DEFAULT_COLS, 4, 11);
    return { rows, cols };
  }

  function getBoardSize(board) {
    if (board && Number.isFinite(board.rows) && Number.isFinite(board.cols)) {
      return { rows: board.rows, cols: board.cols };
    }
    const side = Math.sqrt(board && board.length ? board.length : CELL_COUNT);
    if (Number.isInteger(side)) return { rows: side, cols: side };
    return { rows: DEFAULT_ROWS, cols: DEFAULT_COLS };
  }

  function attachBoardSize(board, sizeInput) {
    const size = normalizeBoardSize(sizeInput);
    Object.defineProperties(board, {
      rows: { value: size.rows, configurable: true },
      cols: { value: size.cols, configurable: true },
    });
    return board;
  }

  function getStageBoardSize(stage) {
    const level = clamp(Number(stage) || 1, 1, STAGE_COUNT);
    if (level === TUTORIAL_STAGE) return { ...TUTORIAL_BOARD_SIZE };
    if (level <= 2) return { rows: 4, cols: 5 };
    if (level <= 8) return { rows: 5, cols: 7 };
    if (level <= 12) return { rows: 5, cols: 8 };
    if (level <= 16) return { rows: 6, cols: 9 };
    return { rows: 6, cols: 9 };
  }

  function createInitialBoard(sizeInput) {
    const size = normalizeBoardSize(sizeInput);
    const board = attachBoardSize(Array(size.rows * size.cols).fill(EMPTY), size);
    board[toIndex(0, 0, size)] = PLAYER;
    board[toIndex(size.rows - 1, size.cols - 1, size)] = PLAYER;
    board[toIndex(0, size.cols - 1, size)] = OPPONENT;
    board[toIndex(size.rows - 1, 0, size)] = OPPONENT;
    return board;
  }

  function createTutorialBoard() {
    const size = TUTORIAL_BOARD_SIZE;
    const board = attachBoardSize(Array(size.rows * size.cols).fill(EMPTY), size);
    board[0] = PLAYER;
    board[toIndex(size.rows - 1, size.cols - 1, size)] = PLAYER;
    board[3] = OPPONENT;
    board[5] = OPPONENT;
    return board;
  }

  function getTutorialMoves() {
    return TUTORIAL_MOVES.map((move) => ({ ...move }));
  }

  function getDistance(board, from, to) {
    const size = getBoardSize(board);
    const a = toPoint(from, size);
    const b = toPoint(to, size);
    return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
  }

  function getAdjacentIndexes(board, index, radius) {
    const size = getBoardSize(board);
    const point = toPoint(index, size);
    const indexes = [];
    for (let row = point.row - radius; row <= point.row + radius; row += 1) {
      for (let col = point.col - radius; col <= point.col + radius; col += 1) {
        if (!inBounds(row, col, size) || (row === point.row && col === point.col)) continue;
        indexes.push(toIndex(row, col, size));
      }
    }
    return indexes;
  }

  function getLegalMoves(board, player) {
    const moves = [];
    board.forEach((cell, from) => {
      if (cell !== player) return;
      getAdjacentIndexes(board, from, 2).forEach((to) => {
        if (board[to] !== EMPTY) return;
        const distance = getDistance(board, from, to);
        if (distance < 1 || distance > 2) return;
        moves.push({ from, to, player, distance });
      });
    });
    return moves;
  }

  function applyMove(board, move) {
    const nextBoard = attachBoardSize(board.slice(), getBoardSize(board));
    const distance = move.distance || getDistance(board, move.from, move.to);
    const rival = otherPlayer(move.player);
    let captured = 0;

    if (distance === 2) {
      nextBoard[move.from] = EMPTY;
    }
    nextBoard[move.to] = move.player;

    getAdjacentIndexes(nextBoard, move.to, 1).forEach((index) => {
      if (nextBoard[index] === rival) {
        nextBoard[index] = move.player;
        captured += 1;
      }
    });

    return {
      board: nextBoard,
      captured,
      moveType: distance === 1 ? 'copy' : 'jump',
    };
  }

  function getScores(board) {
    return board.reduce(
      (scores, cell) => {
        if (cell === PLAYER) scores.player += 1;
        if (cell === OPPONENT) scores.opponent += 1;
        if (cell === EMPTY) scores.empty += 1;
        return scores;
      },
      { player: 0, opponent: 0, empty: 0 }
    );
  }

  function calculateStageScore({ winner, scores, elapsedMs, clickCount, stage }) {
    if (winner !== PLAYER) {
      return { total: 0, baseScore: 0, speedBonus: 0, clickBonus: 0 };
    }

    const safeScores = scores || { player: 0, empty: 0 };
    const safeElapsedMs = Math.max(0, Number(elapsedMs) || 0);
    const safeClickCount = Math.max(0, Number(clickCount) || 0);
    const safeStage = clamp(Number(stage) || 1, 1, STAGE_COUNT);
    const stageMultiplier = 1 + (safeStage - 1) * 0.08;
    const baseScore = safeScores.player * 120 + safeScores.empty * 15 + safeStage * 150;
    const speedBonus = clamp(Math.round((45000 - safeElapsedMs) / 100), 0, 450);
    const clickBonus = clamp((40 - safeClickCount) * 25, 0, 1000);
    const total = Math.round((baseScore + speedBonus + clickBonus) * stageMultiplier);

    return { total, baseScore, speedBonus, clickBonus };
  }

  function evaluateBoard(board, player) {
    const rival = otherPlayer(player);
    return board.reduce((score, cell) => {
      if (cell === player) return score + 1;
      if (cell === rival) return score - 1;
      return score;
    }, 0);
  }

  function getStageConfig(stage) {
    const level = clamp(Number(stage) || 1, 1, STAGE_COUNT);
    const isKindergartenStage = level <= 5;
    const growthLevel = clamp(level - 5, 0, STAGE_COUNT - 5);
    return {
      stage: level,
      lookAhead: 0,
      captureWeight: isKindergartenStage ? -1.2 : Math.min(3, 1.1 + growthLevel * 0.13),
      copyBonus: isKindergartenStage ? 1.2 : Math.min(4.4, 2.8 + growthLevel * 0.1),
      jumpBonus: level >= 12 ? Math.min(1.1, (level - 11) * 0.11) : 0,
      randomWeight: isKindergartenStage ? 44 : Math.max(6, 18 - growthLevel),
      mistakeRate: isKindergartenStage ? 1 : Math.max(0.1, 0.42 - growthLevel * 0.022),
      avoidCaptureRate: isKindergartenStage ? 0.98 : Math.max(0.03, 0.2 - growthLevel * 0.012),
      thinkingDelay: 420 + level * 12,
      boardSize: getStageBoardSize(level),
    };
  }

  function scoreMove(board, move, config) {
    const result = applyMove(board, move);
    let score = evaluateBoard(result.board, move.player);
    score += result.captured * config.captureWeight;
    score += result.moveType === 'copy' ? config.copyBonus : config.jumpBonus;

    if (config.lookAhead > 0) {
      const rivalMoves = getLegalMoves(result.board, otherPlayer(move.player));
      const bestRivalReply = rivalMoves.reduce((best, rivalMove) => {
        const rivalResult = applyMove(result.board, rivalMove);
        return Math.max(best, evaluateBoard(rivalResult.board, otherPlayer(move.player)) + rivalResult.captured * 4);
      }, 0);
      score -= bestRivalReply * 0.45;
    }

    return score;
  }

  function chooseComputerMove(board, player, configInput) {
    const config = configInput || getStageConfig(1);
    const rng = typeof config.rng === 'function' ? config.rng : Math.random;
    const moves = getLegalMoves(board, player);
    if (!moves.length) return null;

    if (rng() < config.avoidCaptureRate && moves.length > 1) {
      const movesByCapture = moves.map((move) => ({
        move,
        captured: applyMove(board, move).captured,
      }));
      const lowestCapture = Math.min(...movesByCapture.map((entry) => entry.captured));
      const harmlessMoves = movesByCapture.filter((entry) => entry.captured === lowestCapture);
      return harmlessMoves[Math.floor(rng() * harmlessMoves.length)].move;
    }

    const rankedMoves = moves
      .map((move) => ({
        move,
        score: scoreMove(board, move, config) + rng() * config.randomWeight,
      }))
      .sort((a, b) => b.score - a.score);

    if (rng() < config.mistakeRate && rankedMoves.length > 1) {
      const weakStart = Math.floor(rankedMoves.length * 0.45);
      const weakMoves = rankedMoves.slice(weakStart);
      const pick = Math.floor(rng() * weakMoves.length);
      return weakMoves[pick].move;
    }

    return rankedMoves[0].move;
  }

  function hasAnyMove(board, player) {
    return getLegalMoves(board, player).length > 0;
  }

  function getWinner(board) {
    const scores = getScores(board);
    if (scores.player === scores.opponent) return 0;
    return scores.player > scores.opponent ? PLAYER : OPPONENT;
  }

  function isGameOver(board) {
    const scores = getScores(board);
    return (
      scores.player === 0 ||
      scores.opponent === 0 ||
      scores.empty === 0 ||
      (!hasAnyMove(board, PLAYER) && !hasAnyMove(board, OPPONENT))
    );
  }

  return {
    BOARD_SIZE,
    DEFAULT_ROWS,
    DEFAULT_COLS,
    CELL_COUNT,
    STAGE_COUNT,
    TUTORIAL_STAGE,
    EMPTY,
    PLAYER,
    OPPONENT,
    createInitialBoard,
    createTutorialBoard,
    getTutorialMoves,
    getBoardSize,
    getStageBoardSize,
    getLegalMoves,
    applyMove,
    calculateStageScore,
    chooseComputerMove,
    getStageConfig,
    getScores,
    getWinner,
    isGameOver,
    otherPlayer,
    toPoint,
  };
});
