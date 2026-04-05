const SLOPE_LABELS = ["斜率0", "斜率1", "斜率2", "斜率3", "斜率4", "斜率∞"];

export function createBoardUI(doc, onMoveClick) {
  const affineGrid = doc.getElementById("affineGrid");
  const infiniteColumn = doc.getElementById("infiniteColumn");
  const cells = new Array(31);

  for (let index = 0; index < 25; index += 1) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "board-cell";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `点 ${index}`);
    button.addEventListener("click", () => onMoveClick(index));
    affineGrid.appendChild(button);
    cells[index] = button;
  }

  for (let row = 0; row < 6; row += 1) {
    const pointIndex = 25 + row;
    const wrapper = doc.createElement("div");
    wrapper.className = "infinite-row";

    const button = doc.createElement("button");
    button.type = "button";
    button.className = "infinite-cell";
    button.dataset.index = String(pointIndex);
    button.setAttribute("aria-label", `无穷远点 ${pointIndex}`);
    button.addEventListener("click", () => onMoveClick(pointIndex));

    const label = doc.createElement("span");
    label.className = "slope-label";
    label.textContent = SLOPE_LABELS[row];

    wrapper.appendChild(button);
    wrapper.appendChild(label);
    infiniteColumn.appendChild(wrapper);
    cells[pointIndex] = button;
  }

  return {
    cells,
    statusRibbon: doc.getElementById("statusRibbon"),
    statusText: doc.getElementById("statusText"),
    statusSubtext: doc.getElementById("statusSubtext"),
    phaseLabel: doc.getElementById("phaseLabel"),
    plyLabel: doc.getElementById("plyLabel"),
    lastMoveLabel: doc.getElementById("lastMoveLabel"),
    newGameButton: doc.getElementById("newGameButton"),
    undoButton: doc.getElementById("undoButton"),
    showIndicesToggle: doc.getElementById("showIndicesToggle"),
    loadingOverlay: doc.getElementById("loadingOverlay"),
    loadingTitle: doc.getElementById("loadingTitle"),
    loadingMessage: doc.getElementById("loadingMessage"),
  };
}

function isMoveClickable(mask, move) {
  if (move < 0 || move >= 31) {
    return false;
  }
  return ((mask >>> move) & 1) !== 0;
}

function applyPiece(button, stoneClass) {
  const piece = document.createElement("span");
  piece.className = `piece ${stoneClass}`;
  button.appendChild(piece);
}

export function renderBoard(ui, snapshot, options) {
  const { board, ui: uiState } = snapshot;
  const showIndices = Boolean(options.showIndices);
  const winningLine = new Set(uiState.winningLinePoints ?? []);

  ui.statusRibbon.classList.toggle("is-thinking", uiState.phase === "computer_black");

  for (let move = 0; move < ui.cells.length; move += 1) {
    const button = ui.cells[move];
    button.replaceChildren();
    button.disabled = !isMoveClickable(uiState.clickableMovesMask >>> 0, move);
    button.classList.remove("is-clickable", "is-last-move", "is-winning-line");

    if (isMoveClickable(uiState.clickableMovesMask >>> 0, move)) {
      button.classList.add("is-clickable");
    }
    if (uiState.lastMove === move) {
      button.classList.add("is-last-move");
    }
    if (winningLine.has(move)) {
      button.classList.add("is-winning-line");
    }

    const bit = move === 30 ? 0x40000000 : (1 << move) >>> 0;
    if ((board.firstBits & bit) !== 0) {
      applyPiece(button, "black");
    } else if ((board.secondBits & bit) !== 0) {
      applyPiece(button, "white");
    }

    if (showIndices) {
      const label = document.createElement("span");
      label.className = "index-label";
      label.textContent = String(move);
      button.appendChild(label);
    }
  }

  ui.statusText.textContent = uiState.message;
  ui.statusSubtext.textContent = uiState.submessage;
  ui.phaseLabel.textContent = phaseLabel(uiState.phase);
  ui.plyLabel.textContent = String(board.plyCount);
  ui.lastMoveLabel.textContent = uiState.lastMove == null ? "-" : String(uiState.lastMove);
  ui.newGameButton.disabled = !options.isReady;
  ui.undoButton.disabled = !options.isReady || !options.canUndo;
}

export function showLoading(ui, title, message) {
  ui.loadingTitle.textContent = title;
  ui.loadingMessage.textContent = message;
  ui.loadingOverlay.classList.remove("hidden");
}

export function hideLoading(ui) {
  ui.loadingOverlay.classList.add("hidden");
}

function phaseLabel(phase) {
  switch (phase) {
    case "proxy_black_1":
      return "代先手第 1 手";
    case "white_1":
      return "后手第 1 手";
    case "proxy_black_2":
      return "代先手第 2 手";
    case "white_2":
      return "后手第 2 手";
    case "proxy_black_3":
      return "代先手第 3 手";
    case "white_3":
      return "后手第 3 手";
    case "computer_black":
      return "先手应手";
    case "human_white":
      return "轮到后手";
    case "game_over":
      return "终局";
    default:
      return "准备中";
  }
}
