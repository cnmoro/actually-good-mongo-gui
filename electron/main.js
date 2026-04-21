import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

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
  const sqliteDir = app.isPackaged
    ? path.join(app.getPath("userData"), "api-data")
    : path.join(__dirname, "..", "api", "data");
  fs.mkdirSync(sqliteDir, { recursive: true });

  apiProcess = spawn(process.execPath, [apiEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(API_PORT),
      SQLITE_DIR: sqliteDir,
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

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function checkApiHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port: API_PORT,
        path: "/health",
        timeout: 1000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForApiReady({ timeoutMs = 10000, intervalMs = 200 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await checkApiHealth()) return true;
    await wait(intervalMs);
  }
  return false;
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

app.whenReady().then(async () => {
  startApiServer();

  // Avoid racing the renderer against the packaged API boot.
  await waitForApiReady();

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
