const { app, BrowserWindow, shell } = require("electron");
const net = require("node:net");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

app.setName("刘辉生图软件工作台");

let mainWindow = null;
let serverPort = null;
let serverReadyPromise = null;

app.whenReady().then(async () => {
  await createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createMainWindow();
    return;
  }

  mainWindow.show();
  mainWindow.focus();
});

async function ensureLocalServer() {
  if (serverReadyPromise) {
    return serverReadyPromise;
  }

  serverReadyPromise = (async () => {
    const port = await findAvailablePort(8787);
    serverPort = port;
    process.env.PORT = String(port);
    process.env.ELECTRON_DESKTOP = "1";

    await import(pathToFileURL(path.join(__dirname, "..", "dist-server", "index.js")).href);
    await waitForServer(port);
    return port;
  })();

  return serverReadyPromise;
}

async function createMainWindow() {
  const port = serverPort || (await ensureLocalServer());
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "刘辉生图软件工作台",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    backgroundColor: "#111613",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow = window;

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await window.loadURL(`http://127.0.0.1:${port}/`);
  return window;
}

function isExternalUrl(url) {
  return /^https?:\/\//i.test(url) && !url.startsWith("http://127.0.0.1:");
}

function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.once("error", () => tryPort(port + 1));
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    };

    tryPort(startPort);
  });
}

async function waitForServer(port) {
  const url = `http://127.0.0.1:${port}/api/config`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await delay(150);
    }
  }

  throw new Error("Local app server did not start in time.");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
