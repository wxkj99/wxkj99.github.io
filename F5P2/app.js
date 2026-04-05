import { createBoardUI, hideLoading, renderBoard, showLoading } from "./ui.js";

const ui = createBoardUI(document, handleMoveClick);
let latestSnapshot = null;
let isReady = false;
let showIndices = false;
let canUndo = false;
let worker = null;

ui.newGameButton.addEventListener("click", () => {
  if (isReady) {
    worker.postMessage({ type: "new_game" });
  }
});

ui.undoButton.addEventListener("click", () => {
  if (isReady) {
    worker.postMessage({ type: "undo" });
  }
});

ui.showIndicesToggle.addEventListener("change", (event) => {
  showIndices = Boolean(event.target.checked);
  if (latestSnapshot) {
    renderBoard(ui, latestSnapshot, { showIndices, isReady, canUndo });
  }
});

function handleMoveClick(move) {
  if (isReady && worker) {
    worker.postMessage({ type: "play_human_move", move });
  }
}

showLoading(ui, "正在准备对局", "首次打开时会读取对局数据。");

if (window.location.protocol === "file:") {
  ui.statusText.textContent = "请通过网页地址打开此页面";
  ui.statusSubtext.textContent = "不要直接双击本地文件；请改用网页地址或本地预览方式打开。";
  showLoading(
    ui,
    "无法直接打开",
    "请改用网页地址或本地预览方式访问这个页面。",
  );
} else {
  worker = new Worker(new URL("./engine-worker.js", import.meta.url), {
    type: "module",
  });

  worker.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "loading") {
      showLoading(ui, message.title, message.message);
      return;
    }

    if (message.type === "ready") {
      isReady = true;
      hideLoading(ui);
      return;
    }

    if (message.type === "state") {
      latestSnapshot = message;
      canUndo = message.historyLength > 0;
      renderBoard(ui, latestSnapshot, { showIndices, isReady, canUndo });
      if (message.loading) {
        showLoading(ui, message.loading.title, message.loading.message);
      } else if (isReady) {
        hideLoading(ui);
      }
      return;
    }

    if (message.type === "error") {
      ui.statusText.textContent = "操作失败";
      ui.statusSubtext.textContent = message.message;
      if (!isReady) {
        showLoading(ui, "暂时无法开始", message.message);
      }
    }
  });

  worker.addEventListener("error", (event) => {
    const message =
      event?.message || "页面没有顺利进入对局，请刷新后重试。";
    ui.statusText.textContent = "暂时无法开始";
    ui.statusSubtext.textContent = message;
    showLoading(ui, "页面没有顺利打开", message);
  });

  worker.addEventListener("messageerror", () => {
    const message = "页面与对局逻辑之间的通信失败，请刷新后重试。";
    ui.statusText.textContent = "暂时无法开始";
    ui.statusSubtext.textContent = message;
    showLoading(ui, "页面没有顺利打开", message);
  });

  window.setTimeout(() => {
    if (!isReady) {
      const message = "准备时间比平时更久，请稍候；如果一直没有进入对局，请刷新页面后重试。";
      ui.statusText.textContent = "仍在准备中";
      ui.statusSubtext.textContent = message;
      showLoading(ui, "仍在准备中", message);
    }
  }, 10000);

  worker.postMessage({ type: "init" });
}
