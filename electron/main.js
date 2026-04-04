import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_PORT = Number(process.env.PORT || 8787);
let apiProcess = null;

function resolveApiEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "api", "src", "server.js");
  }
  return path.join(__dirname, "..", "api", "src", "server.js");
}

function startApiServer() {
  if (apiProcess) return;

  const apiEntry = resolveApiEntry();
  apiProcess = spawn(process.execPath, [apiEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(API_PORT),
    },
    stdio: "pipe",
  });

  apiProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(`[api] ${chunk}`);
  });

  apiProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(`[api] ${chunk}`);
  });

  apiProcess.on("exit", (code, signal) => {
    console.log(`[api] exited (code=${code}, signal=${signal || "none"})`);
    apiProcess = null;
  });
}

function stopApiServer() {
  if (!apiProcess) return;
  apiProcess.kill("SIGTERM");
  apiProcess = null;
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: "Actually Good Mongo GUI",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.DESKTOP_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(devServerUrl);
  } else {
    const indexHtmlPath = path.join(__dirname, "..", "dist", "index.html");
    window.loadFile(indexHtmlPath);
  }

  window.once("ready-to-show", () => {
    window.show();
  });
}

app.whenReady().then(() => {
  startApiServer();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("before-quit", () => {
  stopApiServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
